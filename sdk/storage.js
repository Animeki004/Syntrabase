import { getAuth } from './auth.js';
export class FirebaseStorage {
    app;
    constructor(app) {
        this.app = app;
    }
}
const storageInstances = new Map();
export function getStorage(app) {
    let storage = storageInstances.get(app);
    if (!storage) {
        storage = new FirebaseStorage(app);
        storageInstances.set(app, storage);
    }
    return storage;
}
export class StorageReference {
    storage;
    fullPath;
    bucket;
    constructor(storage, fullPath, bucket) {
        this.storage = storage;
        this.fullPath = fullPath;
        this.bucket = bucket;
    }
}
export function ref(storage, path) {
    return new StorageReference(storage, path.replace(/^\/+/, ''), 'default');
}
function getStorageHeaders(storage) {
    const auth = getAuth(storage.app);
    const headers = {
        'Content-Type': 'application/json',
        'x-api-key': storage.app.options.apiKey,
        'x-environment-id': storage.app.options.environmentId || 'default',
    };
    if (auth.accessToken) {
        headers['Authorization'] = `Bearer ${auth.accessToken}`;
    }
    return headers;
}
export async function toBase64(data) {
    if (typeof Buffer !== 'undefined' && Buffer.isBuffer(data)) {
        return data.toString('base64');
    }
    let bytes;
    if (data instanceof Uint8Array) {
        bytes = data;
    }
    else {
        // Blob in browser or Node Blob
        const arrayBuffer = await data.arrayBuffer();
        bytes = new Uint8Array(arrayBuffer);
    }
    if (typeof Buffer !== 'undefined') {
        return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64');
    }
    // Pure browser environment without Buffer polyfill
    let binary = '';
    const len = bytes.byteLength;
    const CHUNK_SIZE = 8192;
    for (let i = 0; i < len; i += CHUNK_SIZE) {
        const chunk = bytes.subarray(i, Math.min(i + CHUNK_SIZE, len));
        binary += String.fromCharCode.apply(null, chunk);
    }
    return btoa(binary);
}
export async function uploadBytes(storageRef, data, metadata) {
    const base64Data = await toBase64(data);
    const headers = getStorageHeaders(storageRef.storage);
    const url = `${storageRef.storage.app.options.apiUrl}/api/v1/storage/${storageRef.storage.app.options.projectId}/upload`;
    const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            bucketName: storageRef.bucket,
            objectPath: storageRef.fullPath,
            originalName: storageRef.fullPath.split('/').pop() || 'upload',
            mimeType: metadata?.contentType || 'application/octet-stream',
            base64Data,
            metadata: metadata?.customMetadata,
        }),
    });
    if (!res.ok) {
        const err = (await res.json().catch(() => ({})));
        throw new Error(err.error || `Upload failed: ${res.statusText}`);
    }
    const meta = (await res.json());
    return { ref: storageRef, metadata: meta };
}
export async function getDownloadURL(storageRef) {
    const url = `${storageRef.storage.app.options.apiUrl}/api/v1/storage/${storageRef.storage.app.options.projectId}/signed-url`;
    const res = await fetch(url, {
        method: 'POST',
        headers: getStorageHeaders(storageRef.storage),
        body: JSON.stringify({
            bucketName: storageRef.bucket,
            objectPath: storageRef.fullPath,
            expiresInSeconds: 3600,
        }),
    });
    if (!res.ok) {
        const err = (await res.json().catch(() => ({})));
        throw new Error(err.error || `Failed to get download URL: ${res.statusText}`);
    }
    const data = (await res.json());
    return `${storageRef.storage.app.options.apiUrl}${data.signedUrl}`;
}
export async function deleteObject(storageRef) {
    const url = `${storageRef.storage.app.options.apiUrl}/api/v1/storage/${storageRef.storage.app.options.projectId}/objects/${encodeURIComponent(storageRef.fullPath)}`;
    const res = await fetch(url, {
        method: 'DELETE',
        headers: getStorageHeaders(storageRef.storage),
    });
    if (!res.ok) {
        const err = (await res.json().catch(() => ({})));
        throw new Error(err.error || `Delete object failed: ${res.statusText}`);
    }
}
export async function listAll(storageRef) {
    const url = `${storageRef.storage.app.options.apiUrl}/api/v1/storage/${storageRef.storage.app.options.projectId}/objects`;
    const res = await fetch(url, {
        method: 'GET',
        headers: getStorageHeaders(storageRef.storage),
    });
    if (!res.ok) {
        const err = (await res.json().catch(() => ({})));
        throw new Error(err.error || `List objects failed: ${res.statusText}`);
    }
    const data = (await res.json());
    const prefix = storageRef.fullPath ? (storageRef.fullPath.endsWith('/') ? storageRef.fullPath : `${storageRef.fullPath}/`) : '';
    const items = [];
    for (const obj of data.objects || []) {
        if (!prefix || obj.path.startsWith(prefix)) {
            items.push(new StorageReference(storageRef.storage, obj.path, storageRef.bucket));
        }
    }
    return { items, prefixes: [] };
}
//# sourceMappingURL=storage.js.map