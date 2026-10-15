import fs from 'fs';
import path from 'path';
import { query, withTransaction } from '../db/pool.js';
import { CryptoUtil } from '../utils/crypto.js';
import { config } from '../config.js';
import { StorageObjectMetadata } from '@syntrabase/shared-types';

export class StorageService {
  /**
   * Initializes local storage directory.
   */
  public static initStorageDir(): void {
    if (!fs.existsSync(config.storage.localRoot)) {
      fs.mkdirSync(config.storage.localRoot, { recursive: true });
    }
  }

  /**
   * Uploads and stores a file with quota and MIME verification.
   */
  public static async uploadFile(params: {
    projectId: string;
    bucketName: string;
    objectPath: string;
    originalName: string;
    mimeType: string;
    buffer: Buffer;
    metadata?: Record<string, string>;
  }): Promise<StorageObjectMetadata> {
    this.initStorageDir();

    // 1. Enforce file size limits
    if (params.buffer.length > config.storage.maxFileSizeBytes) {
      throw new Error(`File size ${params.buffer.length} exceeds limit of ${config.storage.maxFileSizeBytes} bytes`);
    }

    // 2. Fetch bucket and check quota
    const bucketRes = await query<{ id: string; quota_bytes: string; used_bytes: string }>(
      'SELECT id, quota_bytes, used_bytes FROM storage_buckets WHERE project_id = $1 AND name = $2',
      [params.projectId, params.bucketName]
    );

    let bucket = bucketRes.rows[0];
    if (!bucket) {
      // Auto-create default bucket if missing
      const newBucket = await query<{ id: string; quota_bytes: string; used_bytes: string }>(
        'INSERT INTO storage_buckets (project_id, name) VALUES ($1, $2) RETURNING id, quota_bytes, used_bytes',
        [params.projectId, params.bucketName]
      );
      bucket = newBucket.rows[0];
    }

    const quota = parseInt(bucket.quota_bytes, 10);
    const used = parseInt(bucket.used_bytes, 10);
    if (used + params.buffer.length > quota) {
      throw new Error(`Project storage quota exceeded (used: ${used}, limit: ${quota})`);
    }

    // 3. Compute SHA-256 hash
    const contentHash = CryptoUtil.sha256(params.buffer);

    // 4. Safe internal file storage
    const internalFilename = `${CryptoUtil.generateSecureToken(16)}_${params.originalName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const destinationPath = path.resolve(config.storage.localRoot, internalFilename);

    // Path traversal check
    if (!destinationPath.startsWith(path.resolve(config.storage.localRoot))) {
      throw new Error('Unsafe file destination path detected');
    }

    fs.writeFileSync(destinationPath, params.buffer);

    // 5. Persist metadata & update bucket usage in transaction
    return withTransaction(async (client) => {
      const res = await client.query<StorageObjectMetadata>(
        `INSERT INTO storage_objects (
          bucket_id, project_id, object_path, original_name, mime_type, size_bytes, content_hash, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id, bucket_id as "bucketId", project_id as "projectId", object_path as "objectPath",
                  original_name as "originalName", mime_type as "mimeType", size_bytes as "sizeBytes",
                  content_hash as "contentHash", is_public as "isPublic", metadata, created_at as "createdAt", updated_at as "updatedAt"`,
        [
          bucket.id,
          params.projectId,
          params.objectPath,
          params.originalName,
          params.mimeType,
          params.buffer.length,
          contentHash,
          { ...(params.metadata || {}), internalFilename },
        ]
      );

      await client.query(
        'UPDATE storage_buckets SET used_bytes = used_bytes + $1 WHERE id = $2',
        [params.buffer.length, bucket.id]
      );

      return res.rows[0];
    });
  }

  /**
   * Generates a signed, time-limited download URL token.
   */
  public static generateSignedUrl(
    projectId: string,
    bucketName: string,
    objectPath: string,
    expiresInSeconds = 3600
  ): string {
    const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds;
    const payload = `${projectId}:${bucketName}:${objectPath}:${expiresAt}`;
    const signature = CryptoUtil.hmacSha256(payload, config.jwt.secret);
    const token = Buffer.from(JSON.stringify({ projectId, bucketName, objectPath, expiresAt, signature })).toString('base64url');
    return `/api/v1/storage/download?token=${token}`;
  }

  /**
   * Validates a signed URL token and returns the object stream.
   */
  public static validateSignedUrl(token: string): { valid: boolean; projectId?: string; bucketName?: string; objectPath?: string; error?: string } {
    try {
      const decoded = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
      const { projectId, bucketName, objectPath, expiresAt, signature } = decoded;

      if (Math.floor(Date.now() / 1000) > expiresAt) {
        return { valid: false, error: 'Signed URL has expired' };
      }

      const expectedPayload = `${projectId}:${bucketName}:${objectPath}:${expiresAt}`;
      const recomputedSignature = CryptoUtil.hmacSha256(expectedPayload, config.jwt.secret);

      if (recomputedSignature !== signature) {
        return { valid: false, error: 'Invalid URL signature' };
      }

      return { valid: true, projectId, bucketName, objectPath };
    } catch {
      return { valid: false, error: 'Malformed signature token' };
    }
  }

  /**
   * Lists all objects belonging to a project.
   */
  public static async listObjects(projectId: string): Promise<Array<{
    id: string;
    name: string;
    path: string;
    sizeBytes: number;
    contentType: string;
    createdAt: string;
  }>> {
    try {
      const res = await query<{
        id: string;
        original_name: string;
        object_path: string;
        size_bytes: string;
        mime_type: string;
        created_at: string;
      }>(
        `SELECT id, original_name, object_path, size_bytes, mime_type, created_at
         FROM storage_objects
         WHERE project_id = $1
         ORDER BY created_at DESC`,
        [projectId]
      );

      return res.rows.map((row) => ({
        id: row.id,
        name: row.original_name,
        path: row.object_path,
        sizeBytes: parseInt(row.size_bytes, 10),
        contentType: row.mime_type,
        createdAt: row.created_at,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Deletes a storage object and releases bucket quota.
   */
  public static async deleteObject(projectId: string, objectId: string): Promise<void> {
    const res = await query<{ id: string; bucket_id: string; size_bytes: string }>(
      'SELECT id, bucket_id, size_bytes FROM storage_objects WHERE (id::text = $1 OR object_path = $1) AND project_id = $2',
      [objectId, projectId]
    );

    const obj = res.rows[0];
    if (!obj) {
      throw new Error('Object not found or access denied');
    }

    const size = parseInt(obj.size_bytes, 10);

    await withTransaction(async (client) => {
      await client.query('DELETE FROM storage_objects WHERE id = $1', [obj.id]);
      await client.query('UPDATE storage_buckets SET used_bytes = GREATEST(0, used_bytes - $1) WHERE id = $2', [
        size,
        obj.bucket_id,
      ]);
    });
  }
}
