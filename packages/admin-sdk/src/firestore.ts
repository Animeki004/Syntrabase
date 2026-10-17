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

export class AdminQuery {
  constructor(
    public readonly firestore: AdminFirestore,
    public readonly collectionPath: string,
    public readonly filters: QueryFilter[] = [],
    public readonly orderBys: QueryOrderBy[] = [],
    public readonly limitCount?: number,
    public readonly startAfterId?: string
  ) {}

  public where(field: string, operator: any, value: any): AdminQuery {
    return new AdminQuery(
      this.firestore,
      this.collectionPath,
      [...this.filters, { field, operator, value }],
      this.orderBys,
      this.limitCount,
      this.startAfterId
    );
  }

  public orderBy(field: string, direction: 'asc' | 'desc' = 'asc'): AdminQuery {
    return new AdminQuery(
      this.firestore,
      this.collectionPath,
      this.filters,
      [...this.orderBys, { field, direction }],
      this.limitCount,
      this.startAfterId
    );
  }

  public limit(count: number): AdminQuery {
    return new AdminQuery(
      this.firestore,
      this.collectionPath,
      this.filters,
      this.orderBys,
      count,
      this.startAfterId
    );
  }

  public startAfter(docId: string): AdminQuery {
    return new AdminQuery(
      this.firestore,
      this.collectionPath,
      this.filters,
      this.orderBys,
      this.limitCount,
      docId
    );
  }

  public async get(): Promise<DocumentSnapshot[]> {
    return this.firestore.queryDocs({
      collectionPath: this.collectionPath,
      filters: this.filters,
      orderBy: this.orderBys,
      limit: this.limitCount,
      startAfter: this.startAfterId,
    });
  }
}

export class AdminDocumentReference {
  constructor(
    public readonly firestore: AdminFirestore,
    public readonly path: string,
    public readonly id: string
  ) {}

  public collection(subcollectionName: string): AdminCollectionReference {
    return new AdminCollectionReference(
      this.firestore,
      `${this.path}/${subcollectionName.replace(/^\/+|\/+$/g, '')}`
    );
  }

  public async get(): Promise<DocumentSnapshot | null> {
    const parts = this.path.split('/');
    const docId = parts.pop()!;
    const colPath = parts.join('/');
    return this.firestore.getDoc(colPath, docId);
  }

  public async set(data: DocumentData, options: { merge?: boolean } = {}): Promise<DocumentSnapshot> {
    const parts = this.path.split('/');
    const docId = parts.pop()!;
    const colPath = parts.join('/');
    return this.firestore.setDoc(colPath, docId, data, options.merge || false);
  }

  public async update(data: DocumentData): Promise<DocumentSnapshot> {
    const parts = this.path.split('/');
    const docId = parts.pop()!;
    const colPath = parts.join('/');
    return this.firestore.updateDoc(colPath, docId, data);
  }

  public async delete(): Promise<void> {
    const parts = this.path.split('/');
    const docId = parts.pop()!;
    const colPath = parts.join('/');
    return this.firestore.deleteDoc(colPath, docId);
  }
}

export class AdminCollectionReference {
  constructor(
    public readonly firestore: AdminFirestore,
    public readonly path: string
  ) {}

  public doc(documentId?: string): AdminDocumentReference {
    const id = documentId || `auto_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    return new AdminDocumentReference(this.firestore, `${this.path}/${id}`, id);
  }

  public async add(data: DocumentData): Promise<AdminDocumentReference> {
    const docRef = this.doc();
    await docRef.set(data);
    return docRef;
  }

  public async get(): Promise<DocumentSnapshot[]> {
    return this.firestore.queryDocs({ collectionPath: this.path });
  }

  public where(field: string, operator: any, value: any): AdminQuery {
    return new AdminQuery(this.firestore, this.path, [{ field, operator, value }]);
  }

  public orderBy(field: string, direction: 'asc' | 'desc' = 'asc'): AdminQuery {
    return new AdminQuery(this.firestore, this.path, [], [{ field, direction }]);
  }

  public limit(count: number): AdminQuery {
    return new AdminQuery(this.firestore, this.path, [], [], count);
  }
}

export class AdminFirestore {
  constructor(public readonly app: AdminApp) {}

  public collection(collectionPath: string): AdminCollectionReference {
    return new AdminCollectionReference(this, collectionPath.replace(/^\/+|\/+$/g, ''));
  }

  public doc(documentPath: string): AdminDocumentReference {
    const clean = documentPath.replace(/^\/+|\/+$/g, '');
    const parts = clean.split('/');
    const id = parts[parts.length - 1];
    return new AdminDocumentReference(this, clean, id);
  }

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

  /**
   * Lists composite indexes for the project database.
   */
  public async listIndexes(databaseId = '(default)'): Promise<any[]> {
    const url = `${this.app.options.apiUrl}/api/v1/projects/${this.app.options.projectId}/databases/${databaseId}/indexes`;
    const res = await fetch(url, { method: 'GET', headers: this.getHeaders() });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error || `Admin listIndexes failed: ${res.statusText}`);
    }
    const data = (await res.json()) as { indexes: any[] };
    return data.indexes;
  }

  /**
   * Creates a composite index on a collection.
   */
  public async createIndex(params: {
    collectionPath: string;
    fields: Array<{ fieldPath: string; order?: 'ASCENDING' | 'DESCENDING' }>;
    queryScope?: 'Collection' | 'CollectionGroup';
    databaseId?: string;
  }): Promise<any> {
    const databaseId = params.databaseId || '(default)';
    const url = `${this.app.options.apiUrl}/api/v1/projects/${this.app.options.projectId}/databases/${databaseId}/indexes`;
    const res = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        collectionPath: params.collectionPath,
        fields: params.fields,
        queryScope: params.queryScope || 'Collection',
      }),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error || `Admin createIndex failed: ${res.statusText}`);
    }
    const data = (await res.json()) as { index: any };
    return data.index;
  }

  /**
   * Deletes a composite index.
   */
  public async deleteIndex(indexId: string, databaseId = '(default)'): Promise<void> {
    const url = `${this.app.options.apiUrl}/api/v1/projects/${this.app.options.projectId}/databases/${databaseId}/indexes/${indexId}`;
    const res = await fetch(url, { method: 'DELETE', headers: this.getHeaders() });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error || `Admin deleteIndex failed: ${res.statusText}`);
    }
  }
}

export function getAdminFirestore(app: AdminApp): AdminFirestore {
  return new AdminFirestore(app);
}
