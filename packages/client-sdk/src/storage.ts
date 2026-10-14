import { FirebaseApp } from './app.js';
import { getAuth } from './auth.js';

export class FirebaseStorage {
  constructor(public readonly app: FirebaseApp) {}
}

const storageInstances = new Map<FirebaseApp, FirebaseStorage>();

export function getStorage(app: FirebaseApp): FirebaseStorage {
  let storage = storageInstances.get(app);
  if (!storage) {
    storage = new FirebaseStorage(app);
    storageInstances.set(app, storage);
  }
  return storage;
}

export class StorageReference {
  constructor(
    public readonly storage: FirebaseStorage,
    public readonly fullPath: string,
    public readonly bucket: string
  ) {}
}

export function ref(storage: FirebaseStorage, path: string): StorageReference {
  return new StorageReference(storage, path.replace(/^\/+/, ''), 'default');
}

export async function uploadBytes(
  storageRef: StorageReference,
  data: Buffer | Uint8Array | Blob,
  metadata?: { contentType?: string; customMetadata?: Record<string, string> }
): Promise<{ ref: StorageReference; metadata: Record<string, unknown> }> {
  let base64Data: string;

  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(data)) {
    base64Data = data.toString('base64');
  } else if (data instanceof Uint8Array) {
    base64Data = Buffer.from(data).toString('base64');
  } else {
    // Blob in browser
    const arrayBuffer = await (data as Blob).arrayBuffer();
    base64Data = Buffer.from(arrayBuffer).toString('base64');
  }

  const auth = getAuth(storageRef.storage.app);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-api-key': storageRef.storage.app.options.apiKey,
  };
  if (auth.accessToken) {
    headers['Authorization'] = `Bearer ${auth.accessToken}`;
  }

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
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || `Upload failed: ${res.statusText}`);
  }

  const meta = (await res.json()) as Record<string, unknown>;
  return { ref: storageRef, metadata: meta };
}

export async function getDownloadURL(storageRef: StorageReference): Promise<string> {
  const url = `${storageRef.storage.app.options.apiUrl}/api/v1/storage/${storageRef.storage.app.options.projectId}/signed-url`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': storageRef.storage.app.options.apiKey,
    },
    body: JSON.stringify({
      bucketName: storageRef.bucket,
      objectPath: storageRef.fullPath,
      expiresInSeconds: 3600,
    }),
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || `Failed to get download URL: ${res.statusText}`);
  }

  const data = (await res.json()) as { signedUrl: string };
  return `${storageRef.storage.app.options.apiUrl}${data.signedUrl}`;
}
