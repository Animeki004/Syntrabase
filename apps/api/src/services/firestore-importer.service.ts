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
   * Generates a signed Google OAuth2 JWT assertion and exchanges it for an access token.
   */
  public static async getAccessToken(credentials: ServiceAccountCredentials): Promise<string> {
    if (!credentials.client_email || !credentials.private_key || !credentials.project_id) {
      throw new Error('INVALID_SERVICE_ACCOUNT: Missing project_id, client_email, or private_key in credentials.');
    }

    let privateKey = credentials.private_key;
    if (typeof privateKey === 'string') {
      privateKey = privateKey.replace(/\\n/g, '\n');
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

    let signature: string;
    try {
      const sign = crypto.createSign('RSA-SHA256');
      sign.update(unsignedToken);
      signature = sign.sign(privateKey, 'base64url');
    } catch (err: any) {
      throw new Error(
        `INVALID_SERVICE_ACCOUNT_KEY: The private_key in your service account JSON could not be decoded (${err.message}). ` +
        `This typically happens when the key is truncated or characters were deleted during copy-paste. ` +
        `Please ensure you copy the complete contents of the downloaded service account JSON file.`
      );
    }

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
   * Fetches documents from a Firestore collection and normalizes fields.
   */
  public static async fetchCollectionDocs(
    googleProjectId: string,
    collectionId: string,
    accessToken: string,
    maxDocs = 1000
  ): Promise<DiscoveredDoc[]> {
    const results: DiscoveredDoc[] = [];
    let pageToken: string | undefined = undefined;

    do {
      const params = new URLSearchParams({ pageSize: '300' });
      if (pageToken) params.set('pageToken', pageToken);

      const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(googleProjectId)}/databases/(default)/documents/${encodeURIComponent(collectionId)}?${params.toString()}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      const data = (await res.json()) as any;
      if (!res.ok) {
        throw new Error(`FIRESTORE_FETCH_FAILED [${collectionId}]: ${data.error?.message || res.statusText}`);
      }

      const docs = Array.isArray(data.documents) ? data.documents : [];
      for (const d of docs) {
        const parts = (d.name || '').split('/');
        const docId = parts[parts.length - 1];
        const parsedData = this.decodeFirestoreFields(d.fields || {});
        results.push({
          collectionPath: collectionId,
          documentId: docId,
          data: parsedData,
        });
        if (results.length >= maxDocs) break;
      }

      pageToken = data.nextPageToken;
    } while (pageToken && results.length < maxDocs);

    return results;
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
