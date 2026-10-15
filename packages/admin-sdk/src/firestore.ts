import { AdminApp } from './app.js';
import {
  DocumentData,
  DocumentSnapshot,
  QueryFilter,
  QueryOrderBy,
  TransactionPrecondition,
  TransactionWriteOp,
  TransactionCommitResult,
  TransformSentinel,
} from '@syntrabase/shared-types';

export class AdminFieldValue implements TransformSentinel {
  public constructor(
    public readonly _transformType: TransformSentinel['_transformType'],
    public readonly value?: unknown
  ) {}

  static serverTimestamp(): AdminFieldValue {
    return new AdminFieldValue('__SYNTRABASE_SERVER_TIMESTAMP__');
  }

  static increment(n: number): AdminFieldValue {
    return new AdminFieldValue('__SYNTRABASE_INCREMENT__', n);
  }

  static arrayUnion(...elements: unknown[]): AdminFieldValue {
    return new AdminFieldValue('__SYNTRABASE_ARRAY_UNION__', elements);
  }

  static arrayRemove(...elements: unknown[]): AdminFieldValue {
    return new AdminFieldValue('__SYNTRABASE_ARRAY_REMOVE__', elements);
  }

  static delete(): AdminFieldValue {
    return new AdminFieldValue('__SYNTRABASE_DELETE_FIELD__');
  }
}

export class AdminFirestore {
  constructor(public readonly app: AdminApp) {}

  private getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'x-api-key': this.app.options.secretKey, // Privileged bypass key
    };
  }

  public async getDoc(collectionPath: string, documentId: string): Promise<DocumentSnapshot | null> {
    const url = `${this.app.options.apiUrl}/api/v1/projects/${this.app.options.projectId}/databases/(default)/documents/${collectionPath}/${documentId}`;
    const res = await fetch(url, { method: 'GET', headers: this.getHeaders() });
    if (res.status === 404) return null;
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error || `Admin getDoc failed: ${res.statusText}`);
    }
    return (await res.json()) as DocumentSnapshot;
  }

  public async setDoc(collectionPath: string, documentId: string, data: DocumentData, merge = false): Promise<DocumentSnapshot> {
    const url = `${this.app.options.apiUrl}/api/v1/projects/${this.app.options.projectId}/databases/(default)/documents/${collectionPath}/${documentId}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ data, merge }),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error || `Admin setDoc failed: ${res.statusText}`);
    }
    return (await res.json()) as DocumentSnapshot;
  }

  public async updateDoc(collectionPath: string, documentId: string, data: DocumentData): Promise<DocumentSnapshot> {
    const url = `${this.app.options.apiUrl}/api/v1/projects/${this.app.options.projectId}/databases/(default)/documents/${collectionPath}/${documentId}`;
    const res = await fetch(url, {
      method: 'PATCH',
      headers: this.getHeaders(),
      body: JSON.stringify({ data }),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error || `Admin updateDoc failed: ${res.statusText}`);
    }
    return (await res.json()) as DocumentSnapshot;
  }

  public async deleteDoc(collectionPath: string, documentId: string): Promise<void> {
    const url = `${this.app.options.apiUrl}/api/v1/projects/${this.app.options.projectId}/databases/(default)/documents/${collectionPath}/${documentId}`;
    const res = await fetch(url, { method: 'DELETE', headers: this.getHeaders() });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error || `Admin deleteDoc failed: ${res.statusText}`);
    }
  }

  public async queryDocs(params: {
    collectionPath: string;
    filters?: QueryFilter[];
    orderBy?: QueryOrderBy[];
    limit?: number;
    startAfter?: string;
  }): Promise<DocumentSnapshot[]> {
    const url = `${this.app.options.apiUrl}/api/v1/projects/${this.app.options.projectId}/databases/(default)/query`;
    const res = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        collectionPath: params.collectionPath,
        filters: params.filters || [],
        orderBy: params.orderBy || [],
        limit: params.limit || 100,
        startAfter: params.startAfter,
      }),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error || `Admin queryDocs failed: ${res.statusText}`);
    }
    const result = (await res.json()) as { documents: DocumentSnapshot[] };
    return result.documents;
  }

  public async commitTransaction(
    preconditions: TransactionPrecondition[],
    writes: TransactionWriteOp[]
  ): Promise<TransactionCommitResult> {
    const url = `${this.app.options.apiUrl}/api/v1/projects/${this.app.options.projectId}/databases/(default)/transaction`;
    const res = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ preconditions, writes }),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error || `Admin commitTransaction failed: ${res.statusText}`);
    }
    return (await res.json()) as TransactionCommitResult;
  }

  public async queryCollectionGroup(
    collectionId: string,
    options: { limit?: number; offset?: number } = {}
  ): Promise<DocumentSnapshot[]> {
    const params = new URLSearchParams();
    if (options.limit) params.set('limit', String(options.limit));
    if (options.offset) params.set('offset', String(options.offset));
    const qs = params.toString() ? `?${params.toString()}` : '';
    const url = `${this.app.options.apiUrl}/api/v1/projects/${this.app.options.projectId}/databases/(default)/collectionGroups/${encodeURIComponent(collectionId)}${qs}`;
    const res = await fetch(url, { method: 'GET', headers: this.getHeaders() });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error || `Admin queryCollectionGroup failed: ${res.statusText}`);
    }
    const result = (await res.json()) as { documents: DocumentSnapshot[] };
    return result.documents;
  }
}

export function getAdminFirestore(app: AdminApp): AdminFirestore {
  return new AdminFirestore(app);
}
