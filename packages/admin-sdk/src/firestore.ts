import { AdminApp } from './app.js';
import {
  DocumentData,
  DocumentSnapshot as SharedDocumentSnapshot,
  QueryFilter,
  QueryOrderBy,
  TransactionPrecondition,
  TransactionWriteOp,
  TransactionCommitResult,
  TransformSentinel,
} from '@syntrabase/shared-types';

export class Timestamp {
  constructor(public readonly seconds: number, public readonly nanoseconds: number) {
    if (nanoseconds < 0 || nanoseconds >= 1e9) {
      throw new Error('Timestamp nanoseconds out of range: must be between 0 and 999,999,999');
    }
  }

  static now(): Timestamp {
    return Timestamp.fromMillis(Date.now());
  }

  static fromDate(date: Date): Timestamp {
    return Timestamp.fromMillis(date.getTime());
  }

  static fromMillis(milliseconds: number): Timestamp {
    const seconds = Math.floor(milliseconds / 1000);
    const nanoseconds = Math.floor((milliseconds % 1000) * 1e6);
    return new Timestamp(seconds, nanoseconds);
  }

  toDate(): Date {
    return new Date(this.toMillis());
  }

  toMillis(): number {
    return this.seconds * 1000 + Math.floor(this.nanoseconds / 1e6);
  }

  isEqual(other: Timestamp): boolean {
    return this.seconds === other.seconds && this.nanoseconds === other.nanoseconds;
  }

  valueOf(): string {
    return this.toDate().toISOString();
  }

  toJSON(): { seconds: number; nanoseconds: number } {
    return { seconds: this.seconds, nanoseconds: this.nanoseconds };
  }
}

export class GeoPoint {
  constructor(public readonly latitude: number, public readonly longitude: number) {
    if (latitude < -90 || latitude > 90) {
      throw new Error('GeoPoint latitude must be between -90 and 90');
    }
    if (longitude < -180 || longitude > 180) {
      throw new Error('GeoPoint longitude must be between -180 and 180');
    }
  }

  isEqual(other: GeoPoint): boolean {
    return this.latitude === other.latitude && this.longitude === other.longitude;
  }

  toJSON(): { latitude: number; longitude: number } {
    return { latitude: this.latitude, longitude: this.longitude };
  }
}

export class Bytes {
  private constructor(private readonly _byteString: string) {}

  static fromBase64String(base64: string): Bytes {
    return new Bytes(base64);
  }

  static fromUint8Array(array: Uint8Array): Bytes {
    if (typeof Buffer !== 'undefined') {
      return new Bytes(Buffer.from(array.buffer, array.byteOffset, array.byteLength).toString('base64'));
    }
    let binary = '';
    for (let i = 0; i < array.byteLength; i++) {
      binary += String.fromCharCode(array[i]);
    }
    return new Bytes(btoa(binary));
  }

  toBase64(): string {
    return this._byteString;
  }

  toUint8Array(): Uint8Array {
    if (typeof Buffer !== 'undefined') {
      return new Uint8Array(Buffer.from(this._byteString, 'base64'));
    }
    const binary = atob(this._byteString);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  isEqual(other: Bytes): boolean {
    return this._byteString === other._byteString;
  }
}

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

export const FieldValue = AdminFieldValue;
export const serverTimestamp = () => AdminFieldValue.serverTimestamp();
export const increment = (n: number) => AdminFieldValue.increment(n);
export const arrayUnion = (...elements: unknown[]) => AdminFieldValue.arrayUnion(...elements);
export const arrayRemove = (...elements: unknown[]) => AdminFieldValue.arrayRemove(...elements);
export const deleteField = () => AdminFieldValue.delete();

export class FieldPath {
  public readonly segments: string[];
  constructor(...segments: string[]) {
    if (segments.length === 0) {
      throw new Error('FieldPath must contain at least one field name');
    }
    this.segments = segments;
  }

  static documentId(): FieldPath {
    return new FieldPath('__name__');
  }

  isEqual(other: FieldPath): boolean {
    return this.segments.join('.') === other.segments.join('.');
  }

  toString(): string {
    return this.segments.join('.');
  }
}

export const documentId = () => FieldPath.documentId();

export class DocumentSnapshot<T = DocumentData> {
  constructor(
    public readonly ref: AdminDocumentReference,
    private readonly _raw: { id: string; data?: T; [key: string]: any } | null
  ) {}

  public get id(): string {
    return this._raw?.id || this.ref.id;
  }

  public get exists(): boolean {
    return this._raw !== null && this._raw !== undefined;
  }

  public data(): T | undefined {
    if (!this.exists) return undefined;
    if (this._raw && this._raw.data !== undefined) {
      return this._raw.data as T;
    }
    return this._raw as unknown as T;
  }

  public get(fieldPath: string): any {
    const d = this.data();
    if (!d || typeof d !== 'object') return undefined;
    const parts = fieldPath.split('.');
    let cur: any = d;
    for (const part of parts) {
      if (cur == null) return undefined;
      cur = cur[part];
    }
    return cur;
  }
}

export class QueryDocumentSnapshot<T = DocumentData> extends DocumentSnapshot<T> {
  override data(): T {
    return (super.data() || {}) as T;
  }
}

export class QuerySnapshot<T = DocumentData> {
  constructor(public readonly docs: QueryDocumentSnapshot<T>[]) {}

  public get empty(): boolean {
    return this.docs.length === 0;
  }

  public get size(): number {
    return this.docs.length;
  }

  public get length(): number {
    return this.docs.length;
  }

  public forEach(callback: (result: QueryDocumentSnapshot<T>, index: number) => void, thisArg?: any): void {
    this.docs.forEach(callback, thisArg);
  }

  public map<U>(callback: (doc: QueryDocumentSnapshot<T>, index: number, array: QueryDocumentSnapshot<T>[]) => U): U[] {
    return this.docs.map(callback);
  }

  public filter(predicate: (doc: QueryDocumentSnapshot<T>, index: number, array: QueryDocumentSnapshot<T>[]) => boolean): QueryDocumentSnapshot<T>[] {
    return this.docs.filter(predicate);
  }

  public [Symbol.iterator](): Iterator<QueryDocumentSnapshot<T>> {
    return this.docs[Symbol.iterator]();
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

  public where(field: string | FieldPath, operator: any, value: any): AdminQuery {
    const fieldStr = field instanceof FieldPath ? field.toString() : field;
    return new AdminQuery(
      this.firestore,
      this.collectionPath,
      [...this.filters, { field: fieldStr, operator, value }],
      this.orderBys,
      this.limitCount,
      this.startAfterId
    );
  }

  public count(): { get(): Promise<{ data(): { count: number } }> } {
    return {
      get: async () => {
        const snap = await this.get();
        return { data: () => ({ count: snap.docs.length }) };
      },
    };
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

  public async get(): Promise<QuerySnapshot> {
    const rawDocs = await this.firestore.queryDocs({
      collectionPath: this.collectionPath,
      filters: this.filters,
      orderBy: this.orderBys,
      limit: this.limitCount,
      startAfter: this.startAfterId,
    });
    const docSnapshots = rawDocs.map((raw) => {
      const docRef = new AdminDocumentReference(this.firestore, `${this.collectionPath}/${raw.id}`, raw.id);
      return new QueryDocumentSnapshot(docRef, raw);
    });
    return new QuerySnapshot(docSnapshots);
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

  public async get(): Promise<DocumentSnapshot> {
    const parts = this.path.split('/');
    const docId = parts.pop()!;
    const colPath = parts.join('/');
    const raw = await this.firestore.getDocRaw(colPath, docId);
    return new DocumentSnapshot(this, raw);
  }

  public async set(data: DocumentData, options: { merge?: boolean } = {}): Promise<DocumentSnapshot> {
    const parts = this.path.split('/');
    const docId = parts.pop()!;
    const colPath = parts.join('/');
    const raw = await this.firestore.setDocRaw(colPath, docId, data, options.merge || false);
    return new DocumentSnapshot(this, raw);
  }

  public async update(data: DocumentData): Promise<DocumentSnapshot> {
    const parts = this.path.split('/');
    const docId = parts.pop()!;
    const colPath = parts.join('/');
    const raw = await this.firestore.updateDocRaw(colPath, docId, data);
    return new DocumentSnapshot(this, raw);
  }

  public async delete(): Promise<void> {
    const parts = this.path.split('/');
    const docId = parts.pop()!;
    const colPath = parts.join('/');
    return this.firestore.deleteDoc(colPath, docId);
  }
}

const AUTO_ID_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export function autoId(): string {
  let id = '';
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(20);
    crypto.getRandomValues(bytes);
    for (let i = 0; i < 20; i++) {
      id += AUTO_ID_CHARS.charAt(bytes[i] % AUTO_ID_CHARS.length);
    }
  } else {
    for (let i = 0; i < 20; i++) {
      id += AUTO_ID_CHARS.charAt(Math.floor(Math.random() * AUTO_ID_CHARS.length));
    }
  }
  return id;
}

export class AdminCollectionReference {
  constructor(
    public readonly firestore: AdminFirestore,
    public readonly path: string
  ) {}

  public doc(documentId?: string): AdminDocumentReference {
    const id = documentId || autoId();
    return new AdminDocumentReference(this.firestore, `${this.path}/${id}`, id);
  }

  public async add(data: DocumentData): Promise<AdminDocumentReference> {
    const docRef = this.doc();
    await docRef.set(data);
    return docRef;
  }

  public async get(): Promise<QuerySnapshot> {
    return new AdminQuery(this.firestore, this.path).get();
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
    const parts = clean.split('/').filter(Boolean);
    let id = '';
    let fullPath = clean;
    if (parts.length % 2 === 1) {
      id = autoId();
      fullPath = fullPath ? `${fullPath}/${id}` : id;
    } else {
      id = parts[parts.length - 1] || autoId();
    }
    return new AdminDocumentReference(this, fullPath, id);
  }

  private getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'x-api-key': this.app.options.secretKey, // Privileged bypass key
    };
  }

  public async getDocRaw(collectionPath: string, documentId: string): Promise<any | null> {
    const url = `${this.app.options.apiUrl}/api/v1/projects/${this.app.options.projectId}/databases/(default)/documents/${collectionPath}/${documentId}`;
    const res = await fetch(url, { method: 'GET', headers: this.getHeaders() });
    if (res.status === 404) return null;
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error || `Admin getDoc failed: ${res.statusText}`);
    }
    return (await res.json());
  }

  public async getDoc(collectionPath: string, documentId: string): Promise<DocumentSnapshot> {
    const raw = await this.getDocRaw(collectionPath, documentId);
    const docRef = new AdminDocumentReference(this, `${collectionPath}/${documentId}`, documentId);
    return new DocumentSnapshot(docRef, raw);
  }

  public async setDocRaw(collectionPath: string, documentId: string, data: DocumentData, merge = false): Promise<any> {
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
    return (await res.json());
  }

  public async setDoc(collectionPath: string, documentId: string, data: DocumentData, merge = false): Promise<DocumentSnapshot> {
    const raw = await this.setDocRaw(collectionPath, documentId, data, merge);
    const docRef = new AdminDocumentReference(this, `${collectionPath}/${documentId}`, documentId);
    return new DocumentSnapshot(docRef, raw);
  }

  public async updateDocRaw(collectionPath: string, documentId: string, data: DocumentData): Promise<any> {
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
    return (await res.json());
  }

  public async updateDoc(collectionPath: string, documentId: string, data: DocumentData): Promise<DocumentSnapshot> {
    const raw = await this.updateDocRaw(collectionPath, documentId, data);
    const docRef = new AdminDocumentReference(this, `${collectionPath}/${documentId}`, documentId);
    return new DocumentSnapshot(docRef, raw);
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
  }): Promise<SharedDocumentSnapshot[]> {
    const url = `${this.app.options.apiUrl}/api/v1/projects/${this.app.options.projectId}/databases/(default)/query`;
    const res = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        collectionPath: params.collectionPath,
        filters: params.filters || [],
        orderBy: params.orderBy || [],
        limit: params.limit || 1000,
        startAfter: params.startAfter,
      }),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error || `Admin queryDocs failed: ${res.statusText}`);
    }
    const result = (await res.json()) as { documents: SharedDocumentSnapshot[] };
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
  ): Promise<SharedDocumentSnapshot[]> {
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
    const result = (await res.json()) as { documents: SharedDocumentSnapshot[] };
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

export function getAdminFirestore(app?: AdminApp): AdminFirestore {
  return new AdminFirestore(app || AdminApp.getInstance());
}

export const getFirestore = getAdminFirestore;
export type Firestore = AdminFirestore;
export type DocumentReference = AdminDocumentReference;
export type CollectionReference = AdminCollectionReference;
export type Query = AdminQuery;
export type { DocumentData, SetOptions } from '@syntrabase/shared-types';

