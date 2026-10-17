import crypto from 'crypto';

export interface ServiceAccountCredentials {
  type?: string;
  project_id: string;
  private_key_id?: string;
  private_key: string;
  client_email: string;
  client_id?: string;
}

export interface DiscoveredDoc {
  collectionPath: string;
  documentId: string;
  data: Record<string, any>;
}

export class FirestoreImporterService {
  /**
   * Encodes path segments to avoid colons or special characters breaking Google Cloud REST endpoints.
   */
  public static encodePath(path: string): string {
    return path.split('/').map(encodeURIComponent).join('/');
  }

  /**
   * Generates a signed Google OAuth2 JWT assertion and exchanges it for an access token.
   */
  public static async getAccessToken(credentials: ServiceAccountCredentials): Promise<string> {
    if (!credentials.client_email || !credentials.private_key || !credentials.project_id) {
      throw new Error('INVALID_SERVICE_ACCOUNT: Missing project_id, client_email, or private_key in credentials.');
    }

    let privateKey = credentials.private_key;
    if (typeof privateKey === 'string') {
      privateKey = privateKey.replace(/\\n/g, '\n').trim();
    }

    const now = Math.floor(Date.now() / 1000);
    const header = { alg: 'RS256', typ: 'JWT' };
    const claim = {
      iss: credentials.client_email,
      scope: 'https://www.googleapis.com/auth/datastore',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now,
    };

    const b64 = (obj: any) => Buffer.from(JSON.stringify(obj)).toString('base64url');
    const unsignedToken = `${b64(header)}.${b64(claim)}`;

    let signature = this.signWithAutoRepair(privateKey, unsignedToken);

    const assertion = `${unsignedToken}.${signature}`;

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
    });

    const data = (await res.json()) as any;
    if (!res.ok || !data.access_token) {
      throw new Error(`GOOGLE_AUTH_FAILED: ${data.error_description || data.error || res.statusText}`);
    }

    return data.access_token;
  }

  /**
   * Signs an unsigned JWT token with RS256, with automated recovery for common copy-paste truncations.
   */
  private static signWithAutoRepair(rawKey: string, unsignedToken: string): string {
    // 1. First attempt: standard parse
    try {
      const sign = crypto.createSign('RSA-SHA256');
      sign.update(unsignedToken);
      return sign.sign(rawKey, 'base64url');
    } catch (initialErr: any) {
      // 2. Intelligent recovery: test if minor line-copy truncation occurred
      const repaired = this.attemptKeyRepair(rawKey, unsignedToken);
      if (repaired) {
        return repaired;
      }

      throw new Error(
        `INVALID_SERVICE_ACCOUNT_KEY: The private_key in your service account JSON could not be decoded (${initialErr.message}). ` +
        `This typically happens when the key is truncated or characters were deleted during copy-paste. ` +
        `Please ensure you copy the complete contents of the downloaded service account JSON file.`
      );
    }
  }

  /**
   * Attempts recovery if a few characters were dropped at line boundaries during copy/paste.
   */
  private static attemptKeyRepair(keyStr: string, unsignedToken: string): string | null {
    const lines = keyStr.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length < 5) return null;

    const b64Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

    // Scan lines that have length < 64 (excluding header and footer)
    for (let i = 1; i < lines.length - 1; i++) {
      if (lines[i].length < 64 && lines[i].length >= 60) {
        // Try prepending or appending missing characters
        for (const c of b64Chars) {
          const candidateLines = [...lines];
          candidateLines[i] = c + candidateLines[i];
          const testKey = candidateLines.join('\n');
          try {
            const sign = crypto.createSign('RSA-SHA256');
            sign.update(unsignedToken);
            return sign.sign(testKey, 'base64url');
          } catch {}
        }
      }
    }

    return null;
  }

  /**
   * Lists root collections in Google Firestore.
   */
  public static async listCollections(googleProjectId: string, accessToken: string): Promise<string[]> {
    const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(googleProjectId)}/databases/(default)/documents:listCollectionIds`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ pageSize: 100 }),
    });

    const data = (await res.json()) as any;
    if (!res.ok) {
      throw new Error(`FIRESTORE_LIST_FAILED: ${data.error?.message || res.statusText}`);
    }

    return Array.isArray(data.collectionIds) ? data.collectionIds : [];
  }

  /**
   * Recursively fetches all documents and subcollections under a given collection path.
   */
  public static async fetchCollectionDocs(
    googleProjectId: string,
    collectionId: string,
    accessToken: string,
    maxDocs = 5000
  ): Promise<DiscoveredDoc[]> {
    const results: DiscoveredDoc[] = [];
    await this.fetchCollectionRecursive(googleProjectId, collectionId, accessToken, results, maxDocs, 0);
    return results;
  }

  /**
   * Deep recursive traversal engine that walks through documents, phantom parent nodes, and subcollections.
   */
  private static async fetchCollectionRecursive(
    googleProjectId: string,
    collectionPath: string,
    accessToken: string,
    results: DiscoveredDoc[],
    maxDocs: number,
    depth = 0
  ): Promise<void> {
    if (depth > 8 || results.length >= maxDocs) return;

    let pageToken: string | undefined = undefined;
    const encodedCol = this.encodePath(collectionPath);

    do {
      const params = new URLSearchParams({ pageSize: '300', showMissing: 'true' });
      if (pageToken) params.set('pageToken', pageToken);

      const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(googleProjectId)}/databases/(default)/documents/${encodedCol}?${params.toString()}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!res.ok) break;

      const data = (await res.json()) as any;
      const docs = Array.isArray(data.documents) ? data.documents : [];

      for (const d of docs) {
        if (results.length >= maxDocs) break;

        const docFullName = d.name || '';
        const prefix = `projects/${googleProjectId}/databases/(default)/documents/`;
        const relPath = docFullName.startsWith(prefix) ? docFullName.slice(prefix.length) : docFullName;
        const lastSlash = relPath.lastIndexOf('/');
        const parentCol = relPath.slice(0, lastSlash);
        const docId = relPath.slice(lastSlash + 1);

        // If node contains real document data, register it
        if (d.fields && Object.keys(d.fields).length > 0) {
          results.push({
            collectionPath: parentCol,
            documentId: docId,
            data: this.decodeFirestoreFields(d.fields),
          });
        }

        // Check for nested subcollections under this document node (handles phantom and real documents)
        const subUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(googleProjectId)}/databases/(default)/documents/${this.encodePath(relPath)}:listCollectionIds`;
        try {
          const subRes = await fetch(subUrl, {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ pageSize: 100 }),
          });

          if (subRes.ok) {
            const subData = (await subRes.json()) as any;
            const subCols = Array.isArray(subData.collectionIds) ? subData.collectionIds : [];
            for (const sc of subCols) {
              await this.fetchCollectionRecursive(
                googleProjectId,
                `${relPath}/${sc}`,
                accessToken,
                results,
                maxDocs,
                depth + 1
              );
            }
          }
        } catch {
          // Continue traversal even if a subcollection query fails
        }
      }

      pageToken = data.nextPageToken;
    } while (pageToken && results.length < maxDocs);
  }

  /**
   * Recursively decodes Firestore REST typed values to plain JavaScript objects.
   */
  public static decodeFirestoreFields(fields: Record<string, any>): Record<string, any> {
    const obj: Record<string, any> = {};
    for (const [key, val] of Object.entries(fields)) {
      obj[key] = this.decodeFirestoreValue(val);
    }
    return obj;
  }

  public static decodeFirestoreValue(val: any): any {
    if (!val || typeof val !== 'object') return val;
    if ('stringValue' in val) return val.stringValue;
    if ('integerValue' in val) return parseInt(val.integerValue, 10);
    if ('doubleValue' in val) return parseFloat(val.doubleValue);
    if ('booleanValue' in val) return val.booleanValue;
    if ('timestampValue' in val) return val.timestampValue;
    if ('nullValue' in val) return null;
    if ('bytesValue' in val) return val.bytesValue;
    if ('geoPointValue' in val) {
      return {
        _type: 'GeoPoint',
        latitude: val.geoPointValue.latitude,
        longitude: val.geoPointValue.longitude,
      };
    }
    if ('referenceValue' in val) {
      return { _type: 'DocumentReference', path: val.referenceValue };
    }
    if ('arrayValue' in val) {
      const arr = val.arrayValue.values || [];
      return arr.map((item: any) => this.decodeFirestoreValue(item));
    }
    if ('mapValue' in val) {
      return this.decodeFirestoreFields(val.mapValue.fields || {});
    }
    return val;
  }
}
