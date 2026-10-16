import { getAuth } from './auth.js';
export class Firestore {
    app;
    _persistenceEnabled = false;
    _persistenceType = 'memory';
    _cache = new Map();
    constructor(app) {
        this.app = app;
    }
}
const firestoreInstances = new Map();
export function getFirestore(app) {
    let db = firestoreInstances.get(app);
    if (!db) {
        db = new Firestore(app);
        firestoreInstances.set(app, db);
    }
    return db;
}
export class DocumentReference {
    firestore;
    path;
    id;
    constructor(firestore, path, id) {
        this.firestore = firestore;
        this.path = path;
        this.id = id;
    }
}
export class CollectionReference {
    firestore;
    path;
    constructor(firestore, path) {
        this.firestore = firestore;
        this.path = path;
    }
}
export function doc(db, pathOrColl, id) {
    const generateAutoId = () => `auto_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    if (typeof pathOrColl === 'string') {
        const fullPath = id ? `${pathOrColl}/${id}` : pathOrColl;
        const parts = fullPath.replace(/^\/+|\/+$/g, '').split('/');
        const docId = parts[parts.length - 1];
        return new DocumentReference(db, fullPath, docId);
    }
    const docId = id || generateAutoId();
    const fullPath = `${pathOrColl.path}/${docId}`;
    return new DocumentReference(db, fullPath, docId);
}
export function collection(db, path) {
    return new CollectionReference(db, path.replace(/^\/+|\/+$/g, ''));
}
function getRequestHeaders(db) {
    const auth = getAuth(db.app);
    const headers = {
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
export class FieldValue {
    _transformType;
    value;
    constructor(_transformType, value) {
        this._transformType = _transformType;
        this.value = value;
    }
    static serverTimestamp() {
        return new FieldValue('__SYNTRABASE_SERVER_TIMESTAMP__');
    }
    static increment(n) {
        return new FieldValue('__SYNTRABASE_INCREMENT__', n);
    }
    static arrayUnion(...elements) {
        return new FieldValue('__SYNTRABASE_ARRAY_UNION__', elements);
    }
    static arrayRemove(...elements) {
        return new FieldValue('__SYNTRABASE_ARRAY_REMOVE__', elements);
    }
    static delete() {
        return new FieldValue('__SYNTRABASE_DELETE_FIELD__');
    }
}
export const serverTimestamp = () => FieldValue.serverTimestamp();
export const increment = (n) => FieldValue.increment(n);
export const arrayUnion = (...elements) => FieldValue.arrayUnion(...elements);
export const arrayRemove = (...elements) => FieldValue.arrayRemove(...elements);
export const deleteField = () => FieldValue.delete();
export async function getDoc(docRef) {
    const parts = docRef.path.replace(/^\/+|\/+$/g, '').split('/');
    const docId = parts.pop();
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
            const err = (await res.json().catch(() => ({})));
            throw new Error(err.error || `Failed to fetch document: ${res.statusText}`);
        }
        const snapshot = (await res.json());
        if (docRef.firestore._persistenceEnabled) {
            docRef.firestore._cache.set(docRef.path, snapshot);
        }
        return {
            exists: () => true,
            data: () => snapshot.data,
            id: snapshot.id,
            version: snapshot.version,
        };
    }
    catch (netErr) {
        if (docRef.firestore._persistenceEnabled && docRef.firestore._cache.has(docRef.path)) {
            const cached = docRef.firestore._cache.get(docRef.path);
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
export async function setDoc(docRef, data, options = {}) {
    const parts = docRef.path.replace(/^\/+|\/+$/g, '').split('/');
    const docId = parts.pop();
    const collPath = parts.join('/');
    const url = `${docRef.firestore.app.options.apiUrl}/api/v1/projects/${docRef.firestore.app.options.projectId}/databases/(default)/documents/${collPath}/${docId}`;
    const res = await fetch(url, {
        method: 'POST',
        headers: getRequestHeaders(docRef.firestore),
        body: JSON.stringify({ data, merge: options.merge || false }),
    });
    if (!res.ok) {
        const err = (await res.json().catch(() => ({})));
        throw new Error(err.error || `Failed to set document: ${res.statusText}`);
    }
    const snapshot = (await res.json().catch(() => null));
    if (snapshot && docRef.firestore._persistenceEnabled) {
        docRef.firestore._cache.set(docRef.path, snapshot);
    }
}
export async function updateDoc(docRef, data) {
    const parts = docRef.path.replace(/^\/+|\/+$/g, '').split('/');
    const docId = parts.pop();
    const collPath = parts.join('/');
    const url = `${docRef.firestore.app.options.apiUrl}/api/v1/projects/${docRef.firestore.app.options.projectId}/databases/(default)/documents/${collPath}/${docId}`;
    const res = await fetch(url, {
        method: 'PATCH',
        headers: getRequestHeaders(docRef.firestore),
        body: JSON.stringify({ data }),
    });
    if (!res.ok) {
        const err = (await res.json().catch(() => ({})));
        throw new Error(err.error || `Failed to update document: ${res.statusText}`);
    }
    const snapshot = (await res.json().catch(() => null));
    if (snapshot && docRef.firestore._persistenceEnabled) {
        docRef.firestore._cache.set(docRef.path, snapshot);
    }
}
export async function deleteDoc(docRef) {
    const parts = docRef.path.replace(/^\/+|\/+$/g, '').split('/');
    const docId = parts.pop();
    const collPath = parts.join('/');
    const url = `${docRef.firestore.app.options.apiUrl}/api/v1/projects/${docRef.firestore.app.options.projectId}/databases/(default)/documents/${collPath}/${docId}`;
    const res = await fetch(url, {
        method: 'DELETE',
        headers: getRequestHeaders(docRef.firestore),
    });
    if (!res.ok) {
        const err = (await res.json().catch(() => ({})));
        throw new Error(err.error || `Failed to delete document: ${res.statusText}`);
    }
    if (docRef.firestore._persistenceEnabled) {
        docRef.firestore._cache.delete(docRef.path);
    }
}
export async function addDoc(collectionRef, data) {
    const autoDocRef = doc(collectionRef.firestore, collectionRef);
    await setDoc(autoDocRef, data);
    return autoDocRef;
}
export function where(field, opStr, value) {
    return { type: 'where', filter: { field, operator: opStr, value } };
}
export function orderBy(field, direction = 'asc') {
    return { type: 'orderBy', order: { field, direction } };
}
export function limit(limitCount) {
    return { type: 'limit', limitCount };
}
export function startAfter(startAfterId) {
    return { type: 'startAfter', startAfterId };
}
export class Query {
    collectionRef;
    constraints;
    constructor(collectionRef, constraints) {
        this.collectionRef = collectionRef;
        this.constraints = constraints;
    }
}
export class CollectionGroupQuery {
    firestore;
    collectionId;
    constraints;
    constructor(firestore, collectionId, constraints = []) {
        this.firestore = firestore;
        this.collectionId = collectionId;
        this.constraints = constraints;
    }
}
export function query(collectionRef, ...constraints) {
    return new Query(collectionRef, constraints);
}
export function collectionGroup(db, collectionId) {
    return new CollectionGroupQuery(db, collectionId);
}
export async function getDocs(queryObj) {
    if (queryObj instanceof CollectionGroupQuery) {
        let limitCount = 50;
        for (const c of queryObj.constraints) {
            if (c.type === 'limit' && c.limitCount)
                limitCount = c.limitCount;
        }
        const url = `${queryObj.firestore.app.options.apiUrl}/api/v1/projects/${queryObj.firestore.app.options.projectId}/databases/(default)/collectionGroups/${encodeURIComponent(queryObj.collectionId)}?limit=${limitCount}`;
        const res = await fetch(url, {
            method: 'GET',
            headers: getRequestHeaders(queryObj.firestore),
        });
        if (!res.ok) {
            const err = (await res.json().catch(() => ({})));
            throw new Error(err.error || `CollectionGroup query failed: ${res.statusText}`);
        }
        const result = (await res.json());
        const docs = (result.documents || []).map((d) => ({
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
    const filters = [];
    const orderBys = [];
    let limitCount = 50;
    let startAfterId = undefined;
    for (const c of constraints) {
        if (c.type === 'where' && c.filter)
            filters.push(c.filter);
        if (c.type === 'orderBy' && c.order)
            orderBys.push(c.order);
        if (c.type === 'limit' && c.limitCount)
            limitCount = c.limitCount;
        if (c.type === 'startAfter' && c.startAfterId)
            startAfterId = c.startAfterId;
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
        const err = (await res.json().catch(() => ({})));
        throw new Error(err.error || `Query failed: ${res.statusText}`);
    }
    const result = (await res.json());
    const docs = (result.documents || []).map((d) => ({
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
    firestore;
    operations = [];
    constructor(firestore) {
        this.firestore = firestore;
    }
    set(docRef, data, options = {}) {
        this.operations.push({ type: 'set', path: docRef.path, data, merge: options.merge });
        return this;
    }
    update(docRef, data) {
        this.operations.push({ type: 'update', path: docRef.path, data });
        return this;
    }
    delete(docRef) {
        this.operations.push({ type: 'delete', path: docRef.path });
        return this;
    }
    async commit() {
        const url = `${this.firestore.app.options.apiUrl}/api/v1/projects/${this.firestore.app.options.projectId}/databases/(default)/batch`;
        const res = await fetch(url, {
            method: 'POST',
            headers: getRequestHeaders(this.firestore),
            body: JSON.stringify({ operations: this.operations }),
        });
        if (!res.ok) {
            const err = (await res.json().catch(() => ({})));
            throw new Error(err.error || `Batch write failed: ${res.statusText}`);
        }
    }
}
export function writeBatch(db) {
    return new WriteBatch(db);
}
// -----------------------------------------------------------------------------
// Interactive Transactions
// -----------------------------------------------------------------------------
export class Transaction {
    firestore;
    preconditions = [];
    writes = [];
    constructor(firestore) {
        this.firestore = firestore;
    }
    async get(docRef) {
        const snap = await getDoc(docRef);
        if (snap.exists() && snap.version !== undefined) {
            this.preconditions.push({ path: docRef.path, expectedVersion: snap.version });
        }
        else {
            this.preconditions.push({ path: docRef.path, mustNotExist: true });
        }
        return snap;
    }
    set(docRef, data) {
        this.writes.push({ type: 'set', path: docRef.path, data });
        return this;
    }
    update(docRef, data) {
        this.writes.push({ type: 'update', path: docRef.path, data });
        return this;
    }
    delete(docRef) {
        this.writes.push({ type: 'delete', path: docRef.path });
        return this;
    }
    getPayload() {
        return {
            preconditions: this.preconditions,
            writes: this.writes,
        };
    }
}
export async function runTransaction(db, updateFunction, options = {}) {
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
                const err = (await res.json().catch(() => ({})));
                throw new Error(err.error || 'Transaction failed: max retries reached due to concurrent conflicts');
            }
            const backoffMs = Math.min(1000, Math.pow(2, attempt) * 50) + Math.random() * 50;
            await new Promise((resolve) => setTimeout(resolve, backoffMs));
            continue;
        }
        if (!res.ok) {
            const err = (await res.json().catch(() => ({})));
            throw new Error(err.error || `Transaction failed: ${res.statusText}`);
        }
        return result;
    }
    throw new Error('Transaction failed: exceeded maximum attempts');
}
export async function enableIndexedDbPersistence(db, _options) {
    db._persistenceEnabled = true;
    const idb = typeof globalThis !== 'undefined' ? globalThis.indexedDB : null;
    if (!idb) {
        db._persistenceType = 'memory';
        return;
    }
    db._persistenceType = 'indexeddb';
    const dbName = `syntrabase_${db.app.options.projectId}_${db.app.options.environmentId || 'default'}`;
    return new Promise((resolve, reject) => {
        const req = idb.open(dbName, 1);
        req.onupgradeneeded = (event) => {
            const targetDb = event.target.result;
            if (!targetDb.objectStoreNames.contains('documents')) {
                targetDb.createObjectStore('documents', { keyPath: 'path' });
            }
        };
        req.onsuccess = () => resolve();
        req.onerror = () => reject(new Error(`Failed to initialize IndexedDB: ${req.error?.message}`));
    });
}
//# sourceMappingURL=firestore.js.map