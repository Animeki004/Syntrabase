import { FirebaseApp } from './app.js';
import { getAuth } from './auth.js';
import {
  BatchWriteOperation,
  DocumentData,
  DocumentSnapshot,
  QueryFilter,
  QueryFilterOperator,
  QueryOrderBy,
  TransactionPrecondition,
  TransactionWriteOp,
  TransactionCommitPayload,
  TransformSentinel,
} from '@syntrabase/shared-types';

export class Firestore {
  public _persistenceEnabled = false;
  public _persistenceType: 'memory' | 'indexeddb' = 'memory';
  public _cache = new Map<string, DocumentSnapshot>();

  constructor(public readonly app: FirebaseApp) {}
}

const firestoreInstances = new Map<FirebaseApp, Firestore>();

export function getFirestore(app: FirebaseApp): Firestore {
  let db = firestoreInstances.get(app);
  if (!db) {
    db = new Firestore(app);
    firestoreInstances.set(app, db);
  }
  return db;
}

export class DocumentReference {
  constructor(
    public readonly firestore: Firestore,
    public readonly path: string,
    public readonly id: string
  ) {}
}

export class CollectionReference {
  constructor(
    public readonly firestore: Firestore,
    public readonly path: string
  ) {}
}

export function doc(
  dbOrColl: Firestore | CollectionReference,
  pathOrColl?: string | CollectionReference,
  ...morePaths: string[]
): DocumentReference {
  const generateAutoId = () => `auto_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  // Case 1: doc(collectionRef, ...morePaths)
  if (dbOrColl instanceof CollectionReference) {
    const rawSegments = pathOrColl
      ? (typeof pathOrColl === 'string' ? [pathOrColl, ...morePaths] : [pathOrColl.path, ...morePaths])
      : [];
    const segments = rawSegments.filter(Boolean);
    const docId = segments.length > 0 ? segments[segments.length - 1] : generateAutoId();
    const fullPath = segments.length > 0
      ? `${dbOrColl.path}/${segments.join('/')}`.replace(/^\/+|\/+$/g, '')
      : `${dbOrColl.path}/${docId}`;
    return new DocumentReference(dbOrColl.firestore, fullPath, docId);
  }

  // Case 2: doc(firestore, collectionRef, ...morePaths)
  if (pathOrColl instanceof CollectionReference) {
    const segments = morePaths.filter(Boolean);
    const docId = segments.length > 0 ? segments[segments.length - 1] : generateAutoId();
    const fullPath = segments.length > 0
      ? `${pathOrColl.path}/${segments.join('/')}`.replace(/^\/+|\/+$/g, '')
      : `${pathOrColl.path}/${docId}`;
    return new DocumentReference(pathOrColl.firestore, fullPath, docId);
  }

  // Case 3: doc(firestore, 'path', ...morePaths)
  const segments = pathOrColl ? [pathOrColl, ...morePaths].filter(Boolean) : [];
  const fullPath = segments.join('/').replace(/^\/+|\/+$/g, '');
  const parts = fullPath.split('/');
  const docId = parts[parts.length - 1] || generateAutoId();
  return new DocumentReference(dbOrColl, fullPath, docId);
}

export function collection(
  dbOrDoc: Firestore | DocumentReference,
  path: string,
  ...morePaths: string[]
): CollectionReference {
  const segments = [path, ...morePaths].filter(Boolean);
  if (dbOrDoc instanceof DocumentReference) {
    const fullPath = `${dbOrDoc.path}/${segments.join('/')}`.replace(/^\/+|\/+$/g, '');
    return new CollectionReference(dbOrDoc.firestore, fullPath);
  }
  const fullPath = segments.join('/').replace(/^\/+|\/+$/g, '');
  return new CollectionReference(dbOrDoc, fullPath);
}

function getRequestHeaders(db: Firestore): Record<string, string> {
  const auth = getAuth(db.app);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-api-key': db.app.options.apiKey,
    'x-environment-id': db.app.options.environmentId || 'default',
  };
  if (auth.accessToken) {
    headers['Authorization'] = `Bearer ${auth.accessToken}`;
  }
  return headers;
}

// -----------------------------------------------------------------------------
// Data Types & Field Value Transforms
// -----------------------------------------------------------------------------

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

export class FieldValue implements TransformSentinel {
  public constructor(
    public readonly _transformType: TransformSentinel['_transformType'],
    public readonly value?: unknown
  ) {}

  static serverTimestamp(): FieldValue {
    return new FieldValue('__SYNTRABASE_SERVER_TIMESTAMP__');
  }

  static increment(n: number): FieldValue {
    return new FieldValue('__SYNTRABASE_INCREMENT__', n);
  }

  static arrayUnion(...elements: unknown[]): FieldValue {
    return new FieldValue('__SYNTRABASE_ARRAY_UNION__', elements);
  }

  static arrayRemove(...elements: unknown[]): FieldValue {
    return new FieldValue('__SYNTRABASE_ARRAY_REMOVE__', elements);
  }

  static delete(): FieldValue {
    return new FieldValue('__SYNTRABASE_DELETE_FIELD__');
  }
}

export const serverTimestamp = () => FieldValue.serverTimestamp();
export const increment = (n: number) => FieldValue.increment(n);
export const arrayUnion = (...elements: unknown[]) => FieldValue.arrayUnion(...elements);
export const arrayRemove = (...elements: unknown[]) => FieldValue.arrayRemove(...elements);
export const deleteField = () => FieldValue.delete();

// -----------------------------------------------------------------------------
// Document CRUD
// -----------------------------------------------------------------------------

export interface DocumentSnapshotResult {
  exists(): boolean;
  data(): DocumentData | undefined;
  id: string;
  version?: number;
}

export async function getDoc(docRef: DocumentReference): Promise<DocumentSnapshotResult> {
  const parts = docRef.path.replace(/^\/+|\/+$/g, '').split('/');
  const docId = parts.pop()!;
  const collPath = parts.join('/');

  const url = `${docRef.firestore.app.options.apiUrl}/api/v1/projects/${docRef.firestore.app.options.projectId}/databases/(default)/documents/${collPath}/${docId}`;

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: getRequestHeaders(docRef.firestore),
    });

    if (res.status === 404) {
      return { exists: () => false, data: () => undefined, id: docId };
    }

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error || `Failed to fetch document: ${res.statusText}`);
    }

    const snapshot = (await res.json()) as DocumentSnapshot;
    if (docRef.firestore._persistenceEnabled) {
      docRef.firestore._cache.set(docRef.path, snapshot);
    }

    return {
      exists: () => true,
      data: () => snapshot.data,
      id: snapshot.id,
      version: snapshot.version,
    };
  } catch (netErr) {
    if (docRef.firestore._persistenceEnabled && docRef.firestore._cache.has(docRef.path)) {
      const cached = docRef.firestore._cache.get(docRef.path)!;
      return {
        exists: () => true,
        data: () => cached.data,
        id: cached.id,
        version: cached.version,
      };
    }
    throw netErr;
  }
}

export async function setDoc(
  docRef: DocumentReference,
  data: DocumentData,
  options: { merge?: boolean } = {}
): Promise<void> {
  const parts = docRef.path.replace(/^\/+|\/+$/g, '').split('/');
  const docId = parts.pop()!;
  const collPath = parts.join('/');

  const url = `${docRef.firestore.app.options.apiUrl}/api/v1/projects/${docRef.firestore.app.options.projectId}/databases/(default)/documents/${collPath}/${docId}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: getRequestHeaders(docRef.firestore),
    body: JSON.stringify({ data, merge: options.merge || false }),
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || `Failed to set document: ${res.statusText}`);
  }

  const snapshot = (await res.json().catch(() => null)) as DocumentSnapshot | null;
  if (snapshot && docRef.firestore._persistenceEnabled) {
    docRef.firestore._cache.set(docRef.path, snapshot);
  }
}

export async function updateDoc(docRef: DocumentReference, data: DocumentData): Promise<void> {
  const parts = docRef.path.replace(/^\/+|\/+$/g, '').split('/');
  const docId = parts.pop()!;
  const collPath = parts.join('/');

  const url = `${docRef.firestore.app.options.apiUrl}/api/v1/projects/${docRef.firestore.app.options.projectId}/databases/(default)/documents/${collPath}/${docId}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: getRequestHeaders(docRef.firestore),
    body: JSON.stringify({ data }),
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || `Failed to update document: ${res.statusText}`);
  }

  const snapshot = (await res.json().catch(() => null)) as DocumentSnapshot | null;
  if (snapshot && docRef.firestore._persistenceEnabled) {
    docRef.firestore._cache.set(docRef.path, snapshot);
  }
}

export async function deleteDoc(docRef: DocumentReference): Promise<void> {
  const parts = docRef.path.replace(/^\/+|\/+$/g, '').split('/');
  const docId = parts.pop()!;
  const collPath = parts.join('/');

  const url = `${docRef.firestore.app.options.apiUrl}/api/v1/projects/${docRef.firestore.app.options.projectId}/databases/(default)/documents/${collPath}/${docId}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: getRequestHeaders(docRef.firestore),
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || `Failed to delete document: ${res.statusText}`);
  }

  if (docRef.firestore._persistenceEnabled) {
    docRef.firestore._cache.delete(docRef.path);
  }
}

export async function addDoc(
  collectionRef: CollectionReference,
  data: DocumentData
): Promise<DocumentReference> {
  const autoDocRef = doc(collectionRef.firestore, collectionRef);
  await setDoc(autoDocRef, data);
  return autoDocRef;
}

// -----------------------------------------------------------------------------
// Query Builder & Collection Group
// -----------------------------------------------------------------------------

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

export interface QueryConstraint {
  type: 'where' | 'orderBy' | 'limit' | 'limitToLast' | 'startAt' | 'startAfter' | 'endAt' | 'endBefore' | 'and' | 'or';
  filter?: QueryFilter;
  order?: QueryOrderBy;
  limitCount?: number;
  startAfterId?: string;
  cursorValue?: unknown;
  composite?: QueryConstraint[];
}

export function where(field: string | FieldPath, opStr: QueryFilterOperator, value: unknown): QueryConstraint {
  const fieldStr = field instanceof FieldPath ? field.toString() : field;
  return { type: 'where', filter: { field: fieldStr, operator: opStr, value } };
}

export function orderBy(field: string, direction: 'asc' | 'desc' = 'asc'): QueryConstraint {
  return { type: 'orderBy', order: { field, direction } };
}

export function limit(limitCount: number): QueryConstraint {
  return { type: 'limit', limitCount };
}

export function limitToLast(limitCount: number): QueryConstraint {
  return { type: 'limitToLast', limitCount };
}

export function startAt(...values: unknown[]): QueryConstraint {
  const first = values[0];
  const startAfterId = typeof first === 'string' ? first : (first as any)?.id ? (first as any).id : undefined;
  return { type: 'startAt', startAfterId, cursorValue: values.length === 1 ? values[0] : values };
}

export function startAfter(...values: unknown[]): QueryConstraint {
  const first = values[0];
  const startAfterId = typeof first === 'string' ? first : (first as any)?.id ? (first as any).id : undefined;
  return { type: 'startAfter', startAfterId, cursorValue: values.length === 1 ? values[0] : values };
}

export function endAt(...values: unknown[]): QueryConstraint {
  return { type: 'endAt', cursorValue: values.length === 1 ? values[0] : values };
}

export function endBefore(...values: unknown[]): QueryConstraint {
  return { type: 'endBefore', cursorValue: values.length === 1 ? values[0] : values };
}

export function and(...constraints: QueryConstraint[]): QueryConstraint {
  return { type: 'and', composite: constraints };
}

export function or(...constraints: QueryConstraint[]): QueryConstraint {
  return { type: 'or', composite: constraints };
}

export function count(): { type: 'count' } {
  return { type: 'count' };
}

export async function getCountFromServer(
  queryObj: Query | CollectionReference | CollectionGroupQuery
): Promise<{ data(): { count: number } }> {
  const snapshot = await getDocs(queryObj);
  return {
    data: () => ({ count: snapshot.size }),
  };
}

export async function getAggregateFromServer<T extends Record<string, any>>(
  queryObj: Query | CollectionReference | CollectionGroupQuery,
  _spec: T
): Promise<{ data(): { [K in keyof T]: number } }> {
  const snapshot = await getDocs(queryObj);
  const res: any = {};
  for (const key of Object.keys(_spec)) {
    res[key] = snapshot.size;
  }
  return {
    data: () => res,
  };
}

export class Query {
  constructor(
    public readonly collectionRef: CollectionReference,
    public readonly constraints: QueryConstraint[]
  ) {}
}

export class CollectionGroupQuery {
  constructor(
    public readonly firestore: Firestore,
    public readonly collectionId: string,
    public readonly constraints: QueryConstraint[] = []
  ) {}
}

export function query(collectionRef: CollectionReference, ...constraints: QueryConstraint[]): Query {
  return new Query(collectionRef, constraints);
}

export function collectionGroup(db: Firestore, collectionId: string): CollectionGroupQuery {
  return new CollectionGroupQuery(db, collectionId);
}

export async function getDocs(queryObj: Query | CollectionReference | CollectionGroupQuery): Promise<{
  docs: Array<{ id: string; data(): DocumentData }>;
  empty: boolean;
  size: number;
}> {
  if (queryObj instanceof CollectionGroupQuery) {
    let limitCount = 50;
    for (const c of queryObj.constraints) {
      if (c.type === 'limit' && c.limitCount) limitCount = c.limitCount;
    }

    const url = `${queryObj.firestore.app.options.apiUrl}/api/v1/projects/${queryObj.firestore.app.options.projectId}/databases/(default)/collectionGroups/${encodeURIComponent(queryObj.collectionId)}?limit=${limitCount}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: getRequestHeaders(queryObj.firestore),
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error || `CollectionGroup query failed: ${res.statusText}`);
    }

    const result = (await res.json()) as { documents?: DocumentSnapshot[] };
    const docs = (result.documents || []).map((d: DocumentSnapshot) => ({
      id: d.id,
      data: () => d.data,
    }));

    return {
      docs,
      empty: docs.length === 0,
      size: docs.length,
    };
  }

  const collectionRef = queryObj instanceof CollectionReference ? queryObj : queryObj.collectionRef;
  const constraints = queryObj instanceof CollectionReference ? [] : queryObj.constraints;

  const filters: QueryFilter[] = [];
  const orderBys: QueryOrderBy[] = [];
  let limitCount = 50;
  let startAfterId: string | undefined = undefined;

  for (const c of constraints) {
    if (c.type === 'where' && c.filter) filters.push(c.filter);
    if (c.type === 'orderBy' && c.order) orderBys.push(c.order);
    if ((c.type === 'limit' || c.type === 'limitToLast') && c.limitCount) limitCount = c.limitCount;
    if ((c.type === 'startAfter' || c.type === 'startAt') && c.startAfterId) startAfterId = c.startAfterId;
  }

  const url = `${collectionRef.firestore.app.options.apiUrl}/api/v1/projects/${collectionRef.firestore.app.options.projectId}/databases/(default)/query`;
  const res = await fetch(url, {
    method: 'POST',
    headers: getRequestHeaders(collectionRef.firestore),
    body: JSON.stringify({
      collectionPath: collectionRef.path,
      filters,
      orderBy: orderBys,
      limit: limitCount,
      startAfter: startAfterId,
    }),
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || `Query failed: ${res.statusText}`);
  }

  const result = (await res.json()) as { documents?: DocumentSnapshot[] };
  const docs = (result.documents || []).map((d: DocumentSnapshot) => ({
    id: d.id,
    data: () => d.data,
  }));

  return {
    docs,
    empty: docs.length === 0,
    size: docs.length,
  };
}

// -----------------------------------------------------------------------------
// Atomic Write Batch
// -----------------------------------------------------------------------------

export class WriteBatch {
  private operations: BatchWriteOperation[] = [];

  constructor(private firestore: Firestore) {}

  public set(docRef: DocumentReference, data: DocumentData, options: { merge?: boolean } = {}): this {
    this.operations.push({ type: 'set', path: docRef.path, data, merge: options.merge });
    return this;
  }

  public update(docRef: DocumentReference, data: DocumentData): this {
    this.operations.push({ type: 'update', path: docRef.path, data });
    return this;
  }

  public delete(docRef: DocumentReference): this {
    this.operations.push({ type: 'delete', path: docRef.path });
    return this;
  }

  public async commit(): Promise<void> {
    const url = `${this.firestore.app.options.apiUrl}/api/v1/projects/${this.firestore.app.options.projectId}/databases/(default)/batch`;
    const res = await fetch(url, {
      method: 'POST',
      headers: getRequestHeaders(this.firestore),
      body: JSON.stringify({ operations: this.operations }),
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error || `Batch write failed: ${res.statusText}`);
    }
  }
}

export function writeBatch(db: Firestore): WriteBatch {
  return new WriteBatch(db);
}

// -----------------------------------------------------------------------------
// Interactive Transactions
// -----------------------------------------------------------------------------

export class Transaction {
  private preconditions: TransactionPrecondition[] = [];
  private writes: TransactionWriteOp[] = [];

  constructor(private firestore: Firestore) {}

  public async get(docRef: DocumentReference): Promise<DocumentSnapshotResult> {
    const snap = await getDoc(docRef);
    if (snap.exists() && snap.version !== undefined) {
      this.preconditions.push({ path: docRef.path, expectedVersion: snap.version });
    } else {
      this.preconditions.push({ path: docRef.path, mustNotExist: true });
    }
    return snap;
  }

  public set(docRef: DocumentReference, data: DocumentData): this {
    this.writes.push({ type: 'set', path: docRef.path, data });
    return this;
  }

  public update(docRef: DocumentReference, data: DocumentData): this {
    this.writes.push({ type: 'update', path: docRef.path, data });
    return this;
  }

  public delete(docRef: DocumentReference): this {
    this.writes.push({ type: 'delete', path: docRef.path });
    return this;
  }

  public getPayload(): TransactionCommitPayload {
    return {
      preconditions: this.preconditions,
      writes: this.writes,
    };
  }
}

export async function runTransaction<T>(
  db: Firestore,
  updateFunction: (transaction: Transaction) => Promise<T>,
  options: { maxAttempts?: number } = {}
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 5;
  let attempt = 0;

  while (attempt < maxAttempts) {
    attempt++;
    const transaction = new Transaction(db);
    const result = await updateFunction(transaction);

    const payload = transaction.getPayload();
    const url = `${db.app.options.apiUrl}/api/v1/projects/${db.app.options.projectId}/databases/(default)/transaction`;
    const res = await fetch(url, {
      method: 'POST',
      headers: getRequestHeaders(db),
      body: JSON.stringify(payload),
    });

    if (res.status === 409) {
      if (attempt >= maxAttempts) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error || 'Transaction failed: max retries reached due to concurrent conflicts');
      }
      const backoffMs = Math.min(1000, Math.pow(2, attempt) * 50) + Math.random() * 50;
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
      continue;
    }

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error || `Transaction failed: ${res.statusText}`);
    }

    return result;
  }

  throw new Error('Transaction failed: exceeded maximum attempts');
}

// -----------------------------------------------------------------------------
// Offline Persistence
// -----------------------------------------------------------------------------

export interface PersistenceSettings {
  forceOwnership?: boolean;
}

export const CACHE_SIZE_UNLIMITED = -1;

export async function enableIndexedDbPersistence(db: Firestore, _options?: PersistenceSettings): Promise<void> {
  db._persistenceEnabled = true;
  const idb = typeof globalThis !== 'undefined' ? (globalThis as any).indexedDB : null;
  if (!idb) {
    db._persistenceType = 'memory';
    return;
  }

  db._persistenceType = 'indexeddb';
  const dbName = `syntrabase_${db.app.options.projectId}_${db.app.options.environmentId || 'default'}`;

  return new Promise((resolve, reject) => {
    const req = idb.open(dbName, 1);
    req.onupgradeneeded = (event: any) => {
      const targetDb = event.target.result;
      if (!targetDb.objectStoreNames.contains('documents')) {
        targetDb.createObjectStore('documents', { keyPath: 'path' });
      }
    };
    req.onsuccess = () => resolve();
    req.onerror = () => reject(new Error(`Failed to initialize IndexedDB: ${req.error?.message}`));
  });
}

export async function enableMultiTabIndexedDbPersistence(db: Firestore): Promise<void> {
  return enableIndexedDbPersistence(db, { forceOwnership: false });
}

export function persistentLocalCache(settings?: { cacheSizeBytes?: number; tabManager?: any }): any {
  return { kind: 'persistent', ...settings };
}

export function memoryLocalCache(settings?: { garbageCollector?: any }): any {
  return { kind: 'memory', ...settings };
}

export function memoryEagerGarbageCollector(): any {
  return { kind: 'memoryEager' };
}

export function memoryLruGarbageCollector(settings?: { cacheSizeBytes?: number }): any {
  return { kind: 'memoryLru', ...settings };
}

export function persistentSingleTabManager(settings?: any): any {
  return { kind: 'persistentSingleTab', ...settings };
}

export function persistentMultipleTabManager(): any {
  return { kind: 'persistentMultipleTab' };
}

export function initializeFirestore(
  app: FirebaseApp,
  settings?: { localCache?: any; persistence?: boolean },
  _databaseId = '(default)'
): Firestore {
  const db = getFirestore(app);
  if (settings?.persistence || settings?.localCache?.kind === 'persistent') {
    enableIndexedDbPersistence(db).catch(() => {});
  }
  return db;
}
