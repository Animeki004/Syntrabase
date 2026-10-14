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

export function doc(db: Firestore, pathOrColl: string | CollectionReference, id?: string): DocumentReference {
  if (typeof pathOrColl === 'string') {
    const fullPath = id ? `${pathOrColl}/${id}` : pathOrColl;
    const parts = fullPath.replace(/^\/+|\/+$/g, '').split('/');
    const docId = parts[parts.length - 1];
    return new DocumentReference(db, fullPath, docId);
  }
  const fullPath = id ? `${pathOrColl.path}/${id}` : `${pathOrColl.path}/auto_${Date.now()}`;
  const docId = id || `auto_${Date.now()}`;
  return new DocumentReference(db, fullPath, docId);
}

export function collection(db: Firestore, path: string): CollectionReference {
  return new CollectionReference(db, path.replace(/^\/+|\/+$/g, ''));
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
// Field Value Transforms
// -----------------------------------------------------------------------------

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

// -----------------------------------------------------------------------------
// Query Builder & Collection Group
// -----------------------------------------------------------------------------

export interface QueryConstraint {
  type: 'where' | 'orderBy' | 'limit' | 'startAfter';
  filter?: QueryFilter;
  order?: QueryOrderBy;
  limitCount?: number;
  startAfterId?: string;
}

export function where(field: string, opStr: QueryFilterOperator, value: unknown): QueryConstraint {
  return { type: 'where', filter: { field, operator: opStr, value } };
}

export function orderBy(field: string, direction: 'asc' | 'desc' = 'asc'): QueryConstraint {
  return { type: 'orderBy', order: { field, direction } };
}

export function limit(limitCount: number): QueryConstraint {
  return { type: 'limit', limitCount };
}

export function startAfter(startAfterId: string): QueryConstraint {
  return { type: 'startAfter', startAfterId };
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
    if (c.type === 'limit' && c.limitCount) limitCount = c.limitCount;
    if (c.type === 'startAfter' && c.startAfterId) startAfterId = c.startAfterId;
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
