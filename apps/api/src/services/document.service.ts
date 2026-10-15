import { withTransaction, query } from '../db/pool.js';
import {
  BatchWriteOperation,
  BatchWriteResult,
  DocumentData,
  DocumentSnapshot,
  QueryFilter,
  QueryOrderBy,
  TransactionPrecondition,
  TransactionWriteOp,
  TransactionCommitResult,
} from '@syntrabase/shared-types';

export class DocumentService {
  /**
   * Retrieves a single document by path and ID.
   */
  public static async getDoc(
    projectId: string,
    environmentId: string,
    collectionPath: string,
    documentId: string
  ): Promise<DocumentSnapshot | null> {
    const res = await query<{
      id: string;
      collection_path: string;
      document_id: string;
      data: DocumentData;
      version: string;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT * FROM documents
       WHERE project_id = $1 AND environment_id = $2 AND collection_path = $3 AND document_id = $4`,
      [projectId, environmentId, collectionPath, documentId]
    );

    const row = res.rows[0];
    if (!row) return null;

    return {
      id: row.document_id,
      path: `/${row.collection_path}/${row.document_id}`,
      data: row.data,
      version: parseInt(row.version, 10),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Evaluates server-side field transforms (serverTimestamp, increment, arrayUnion, arrayRemove, deleteField).
   */
  public static applyFieldTransforms(existing: DocumentData | null, incoming: DocumentData): DocumentData {
    const result: DocumentData = existing ? JSON.parse(JSON.stringify(existing)) : {};

    function processObject(target: Record<string, any>, source: Record<string, any>) {
      for (const [key, val] of Object.entries(source)) {
        // SYN-P4-005: Guard against Prototype Pollution
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
          continue;
        }

        if (val && typeof val === 'object' && '_transformType' in val) {
          const transformType = (val as any)._transformType;
          if (transformType === '__SYNTRABASE_SERVER_TIMESTAMP__') {
            target[key] = new Date().toISOString();
          } else if (transformType === '__SYNTRABASE_INCREMENT__') {
            const currentNum = typeof target[key] === 'number' ? target[key] : 0;
            target[key] = currentNum + (typeof (val as any).value === 'number' ? (val as any).value : 1);
          } else if (transformType === '__SYNTRABASE_ARRAY_UNION__') {
            const arr = Array.isArray(target[key]) ? [...target[key]] : [];
            const additions = Array.isArray((val as any).value) ? (val as any).value : [(val as any).value];
            for (const item of additions) {
              const exists = arr.some((el: any) => JSON.stringify(el) === JSON.stringify(item));
              if (!exists) arr.push(item);
            }
            target[key] = arr;
          } else if (transformType === '__SYNTRABASE_ARRAY_REMOVE__') {
            const arr = Array.isArray(target[key]) ? [...target[key]] : [];
            const removals = Array.isArray((val as any).value) ? (val as any).value : [(val as any).value];
            target[key] = arr.filter((el: any) => !removals.some((item: any) => JSON.stringify(item) === JSON.stringify(el)));
          } else if (transformType === '__SYNTRABASE_DELETE_FIELD__') {
            delete target[key];
          }
        } else if (val && typeof val === 'object' && !Array.isArray(val)) {
          if (!target[key] || typeof target[key] !== 'object' || Array.isArray(target[key])) {
            target[key] = {};
          }
          processObject(target[key], val);
        } else {
          target[key] = val;
        }
      }
    }

    processObject(result, incoming);
    return result;
  }

  /**
   * Writes (sets or merges) a document and records a durable outbox event.
   */
  public static async setDoc(
    projectId: string,
    environmentId: string,
    collectionPath: string,
    documentId: string,
    data: DocumentData,
    merge = false
  ): Promise<DocumentSnapshot> {
    return withTransaction(async (client) => {
      // 1. Check existing doc
      const existingRes = await client.query<{ data: DocumentData; version: string }>(
        `SELECT data, version FROM documents
         WHERE project_id = $1 AND environment_id = $2 AND collection_path = $3 AND document_id = $4`,
        [projectId, environmentId, collectionPath, documentId]
      );

      const existing = existingRes.rows[0];
      let newVersion = 1;
      const finalData = existing
        ? (merge ? this.applyFieldTransforms(existing.data, data) : this.applyFieldTransforms(null, data))
        : this.applyFieldTransforms(null, data);

      if (existing) {
        newVersion = parseInt(existing.version, 10) + 1;
        await client.query(
          `UPDATE documents
           SET data = $1, version = $2, updated_at = NOW()
           WHERE project_id = $3 AND environment_id = $4 AND collection_path = $5 AND document_id = $6`,
          [finalData, newVersion, projectId, environmentId, collectionPath, documentId]
        );
      } else {
        await client.query(
          `INSERT INTO documents (project_id, environment_id, collection_path, document_id, data, version)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [projectId, environmentId, collectionPath, documentId, finalData, newVersion]
        );
      }

      // 2. ATOMICALLY INSERT TO EVENT_OUTBOX
      await client.query(
        `INSERT INTO event_outbox (
          project_id, environment_id, collection_path, document_id, event_type, payload, version
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          projectId,
          environmentId,
          collectionPath,
          documentId,
          existing ? 'document_updated' : 'document_created',
          finalData,
          newVersion,
        ]
      );

      // Increment usage counters
      client.query(
        `INSERT INTO usage_counters (project_id, period_start, period_end, document_writes)
         VALUES ($1, CURRENT_DATE, CURRENT_DATE + INTERVAL '1 month', 1)
         ON CONFLICT (project_id, period_start)
         DO UPDATE SET document_writes = usage_counters.document_writes + 1`,
        [projectId]
      ).catch(() => {});

      return {
        id: documentId,
        path: `/${collectionPath}/${documentId}`,
        data: finalData,
        version: newVersion,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    });
  }

  /**
   * Updates specific fields of an existing document.
   */
  public static async updateDoc(
    projectId: string,
    environmentId: string,
    collectionPath: string,
    documentId: string,
    data: DocumentData
  ): Promise<DocumentSnapshot> {
    return withTransaction(async (client) => {
      const existingRes = await client.query<{ data: DocumentData; version: string }>(
        `SELECT data, version FROM documents
         WHERE project_id = $1 AND environment_id = $2 AND collection_path = $3 AND document_id = $4`,
        [projectId, environmentId, collectionPath, documentId]
      );

      const existing = existingRes.rows[0];
      if (!existing) {
        throw new Error(`Document not found: /${collectionPath}/${documentId}`);
      }

      const newVersion = parseInt(existing.version, 10) + 1;
      const mergedData = this.applyFieldTransforms(existing.data, data);

      await client.query(
        `UPDATE documents
         SET data = $1, version = $2, updated_at = NOW()
         WHERE project_id = $3 AND environment_id = $4 AND collection_path = $5 AND document_id = $6`,
        [mergedData, newVersion, projectId, environmentId, collectionPath, documentId]
      );

      await client.query(
        `INSERT INTO event_outbox (
          project_id, environment_id, collection_path, document_id, event_type, payload, version
        ) VALUES ($1, $2, $3, $4, 'document_updated', $5, $6)`,
        [projectId, environmentId, collectionPath, documentId, mergedData, newVersion]
      );

      return {
        id: documentId,
        path: `/${collectionPath}/${documentId}`,
        data: mergedData,
        version: newVersion,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    });
  }

  /**
   * Deletes a document and records an outbox deletion event.
   */
  public static async deleteDoc(
    projectId: string,
    environmentId: string,
    collectionPath: string,
    documentId: string
  ): Promise<void> {
    await withTransaction(async (client) => {
      await client.query(
        `DELETE FROM documents
         WHERE project_id = $1 AND environment_id = $2 AND collection_path = $3 AND document_id = $4`,
        [projectId, environmentId, collectionPath, documentId]
      );

      await client.query(
        `INSERT INTO event_outbox (
          project_id, environment_id, collection_path, document_id, event_type, payload, version
        ) VALUES ($1, $2, $3, $4, 'document_deleted', '{}'::jsonb, 0)`,
        [projectId, environmentId, collectionPath, documentId]
      );
    });
  }

  /**
   * Performs compound queries with JSONB filters, sorting, and pagination.
   */
  public static async queryDocs(
    projectId: string,
    environmentId: string,
    collectionPath: string,
    filters: QueryFilter[] = [],
    orderBy: QueryOrderBy[] = [],
    limit = 50,
    startAfter?: string
  ): Promise<DocumentSnapshot[]> {
    const params: unknown[] = [projectId, environmentId, collectionPath];
    let querySql = `
      SELECT document_id, collection_path, data, version, created_at, updated_at
      FROM documents
      WHERE project_id = $1 AND environment_id = $2 AND collection_path = $3
    `;

    const safeIdentRegex = /^[a-zA-Z0-9_.]+$/;

    // Add JSONB query filters
    for (const f of filters) {
      if (!safeIdentRegex.test(f.field)) {
        const err: any = new Error(`INVALID_FIELD: Query filter field '${f.field}' contains invalid characters`);
        err.statusCode = 400;
        throw err;
      }
      const safeField = f.field.replace(/'/g, "''");

      params.push(f.value);
      const paramIndex = params.length;

      switch (f.operator) {
        case '==':
          querySql += ` AND data->>'${safeField}' = $${paramIndex}::text`;
          break;
        case '!=':
          querySql += ` AND data->>'${safeField}' != $${paramIndex}::text`;
          break;
        case '<':
          querySql += ` AND (data->>'${safeField}')::numeric < $${paramIndex}::numeric`;
          break;
        case '<=':
          querySql += ` AND (data->>'${safeField}')::numeric <= $${paramIndex}::numeric`;
          break;
        case '>':
          querySql += ` AND (data->>'${safeField}')::numeric > $${paramIndex}::numeric`;
          break;
        case '>=':
          querySql += ` AND (data->>'${safeField}')::numeric >= $${paramIndex}::numeric`;
          break;
        case 'array-contains':
          querySql += ` AND data->'${safeField}' @> jsonb_build_array($${paramIndex})`;
          break;
        case 'in':
          querySql += ` AND data->>'${safeField}' = ANY($${paramIndex}::text[])`;
          break;
      }
    }

    // Cursor pagination
    if (startAfter) {
      params.push(startAfter);
      querySql += ` AND document_id > $${params.length}`;
    }

    // Ordering
    if (orderBy.length > 0) {
      const orderClauses = orderBy.map((o) => {
        if (!safeIdentRegex.test(o.field)) {
          const err: any = new Error(`INVALID_FIELD: OrderBy field '${o.field}' contains invalid characters`);
          err.statusCode = 400;
          throw err;
        }
        const safeField = o.field.replace(/'/g, "''");
        const safeDir = o.direction.toLowerCase() === 'desc' ? 'DESC' : 'ASC';
        return `data->>'${safeField}' ${safeDir}`;
      });
      querySql += ` ORDER BY ${orderClauses.join(', ')}`;
    } else {
      querySql += ` ORDER BY document_id ASC`;
    }

    // Limit
    params.push(Math.min(limit, 500));
    querySql += ` LIMIT $${params.length}`;

    const res = await query<{
      document_id: string;
      collection_path: string;
      data: DocumentData;
      version: string;
      created_at: string;
      updated_at: string;
    }>(querySql, params);

    return res.rows.map((row) => ({
      id: row.document_id,
      path: `/${row.collection_path}/${row.document_id}`,
      data: row.data,
      version: parseInt(row.version, 10),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  /**
   * Executes atomic batch writes inside a single transaction.
   */
  public static async batchWrite(
    projectId: string,
    environmentId: string,
    operations: BatchWriteOperation[]
  ): Promise<BatchWriteResult> {
    if (operations.length > 500) {
      throw new Error('Batch write exceeds limit of 500 operations');
    }

    return withTransaction(async (client) => {
      for (const op of operations) {
        const parts = op.path.replace(/^\/+|\/+$/g, '').split('/');
        const docId = parts.pop()!;
        const collPath = parts.join('/');

        if (op.type === 'set') {
          const existingRes = await client.query<{ data: DocumentData; version: string }>(
            `SELECT data, version FROM documents
             WHERE project_id = $1 AND environment_id = $2 AND collection_path = $3 AND document_id = $4`,
            [projectId, environmentId, collPath, docId]
          );
          const existing = existingRes.rows[0];
          const newVersion = existing ? parseInt(existing.version, 10) + 1 : 1;
          const finalData = existing && op.merge ? { ...existing.data, ...op.data } : op.data;

          if (existing) {
            await client.query(
              `UPDATE documents SET data = $1, version = $2, updated_at = NOW()
               WHERE project_id = $3 AND environment_id = $4 AND collection_path = $5 AND document_id = $6`,
              [finalData, newVersion, projectId, environmentId, collPath, docId]
            );
          } else {
            await client.query(
              `INSERT INTO documents (project_id, environment_id, collection_path, document_id, data, version)
               VALUES ($1, $2, $3, $4, $5, $6)`,
              [projectId, environmentId, collPath, docId, finalData, newVersion]
            );
          }

          await client.query(
            `INSERT INTO event_outbox (project_id, environment_id, collection_path, document_id, event_type, payload, version)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [projectId, environmentId, collPath, docId, existing ? 'document_updated' : 'document_created', finalData, newVersion]
          );
        } else if (op.type === 'update') {
          const existingRes = await client.query<{ data: DocumentData; version: string }>(
            `SELECT data, version FROM documents
             WHERE project_id = $1 AND environment_id = $2 AND collection_path = $3 AND document_id = $4`,
            [projectId, environmentId, collPath, docId]
          );
          const existing = existingRes.rows[0];
          if (!existing) throw new Error(`Document not found: ${op.path}`);

          const newVersion = parseInt(existing.version, 10) + 1;
          const mergedData = { ...existing.data, ...op.data };

          await client.query(
            `UPDATE documents SET data = $1, version = $2, updated_at = NOW()
             WHERE project_id = $3 AND environment_id = $4 AND collection_path = $5 AND document_id = $6`,
            [mergedData, newVersion, projectId, environmentId, collPath, docId]
          );

          await client.query(
            `INSERT INTO event_outbox (project_id, environment_id, collection_path, document_id, event_type, payload, version)
             VALUES ($1, $2, $3, $4, 'document_updated', $5, $6)`,
            [projectId, environmentId, collPath, docId, mergedData, newVersion]
          );
        } else if (op.type === 'delete') {
          await client.query(
            `DELETE FROM documents
             WHERE project_id = $1 AND environment_id = $2 AND collection_path = $3 AND document_id = $4`,
            [projectId, environmentId, collPath, docId]
          );

          await client.query(
            `INSERT INTO event_outbox (project_id, environment_id, collection_path, document_id, event_type, payload, version)
             VALUES ($1, $2, $3, $4, 'document_deleted', '{}'::jsonb, 0)`,
            [projectId, environmentId, collPath, docId]
          );
        }
      }

      return {
        appliedCount: operations.length,
        committedAt: new Date().toISOString(),
      };
    });
  }

  /**
   * Commits an interactive client transaction with row-level locks on preconditions.
   */
  public static async commitTransaction(
    projectId: string,
    environmentId: string,
    preconditions: TransactionPrecondition[],
    writes: TransactionWriteOp[]
  ): Promise<TransactionCommitResult> {
    return withTransaction(async (client) => {
      // 1. Verify preconditions with FOR UPDATE row locks
      for (const pre of preconditions) {
        const parts = pre.path.replace(/^\/+|\/+$/g, '').split('/');
        const docId = parts.pop()!;
        const collPath = parts.join('/');

        const res = await client.query<{ version: string }>(
          `SELECT version FROM documents
           WHERE project_id = $1 AND environment_id = $2 AND collection_path = $3 AND document_id = $4
           FOR UPDATE`,
          [projectId, environmentId, collPath, docId]
        );

        const currentVersion = res.rows[0] ? parseInt(res.rows[0].version, 10) : undefined;

        if (pre.mustNotExist && currentVersion !== undefined) {
          const err: any = new Error(`Transaction precondition failed: ${pre.path} already exists`);
          err.statusCode = 409;
          err.code = 'TRANSACTION_CONFLICT';
          err.conflictedPath = pre.path;
          throw err;
        }

        if (pre.expectedVersion !== undefined && currentVersion !== pre.expectedVersion) {
          const err: any = new Error(`Transaction precondition failed: ${pre.path} version mismatch (expected ${pre.expectedVersion}, found ${currentVersion ?? 'none'})`);
          err.statusCode = 409;
          err.code = 'TRANSACTION_CONFLICT';
          err.conflictedPath = pre.path;
          throw err;
        }
      }

      // 2. Apply writes
      const versions: Record<string, number> = {};
      for (const op of writes) {
        const parts = op.path.replace(/^\/+|\/+$/g, '').split('/');
        const docId = parts.pop()!;
        const collPath = parts.join('/');

        if (op.type === 'set' || op.type === 'update') {
          const existingRes = await client.query<{ data: DocumentData; version: string }>(
            `SELECT data, version FROM documents
             WHERE project_id = $1 AND environment_id = $2 AND collection_path = $3 AND document_id = $4`,
            [projectId, environmentId, collPath, docId]
          );
          const existing = existingRes.rows[0];
          const newVersion = existing ? parseInt(existing.version, 10) + 1 : 1;
          const rawData = op.data || {};
          const finalData = this.applyFieldTransforms(existing?.data || null, rawData);

          if (existing) {
            await client.query(
              `UPDATE documents SET data = $1, version = $2, updated_at = NOW()
               WHERE project_id = $3 AND environment_id = $4 AND collection_path = $5 AND document_id = $6`,
              [finalData, newVersion, projectId, environmentId, collPath, docId]
            );
          } else {
            await client.query(
              `INSERT INTO documents (project_id, environment_id, collection_path, document_id, data, version)
               VALUES ($1, $2, $3, $4, $5, $6)`,
              [projectId, environmentId, collPath, docId, finalData, newVersion]
            );
          }

          await client.query(
            `INSERT INTO event_outbox (project_id, environment_id, collection_path, document_id, event_type, payload, version)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [projectId, environmentId, collPath, docId, existing ? 'document_updated' : 'document_created', finalData, newVersion]
          );

          versions[op.path] = newVersion;
        } else if (op.type === 'delete') {
          await client.query(
            `DELETE FROM documents
             WHERE project_id = $1 AND environment_id = $2 AND collection_path = $3 AND document_id = $4`,
            [projectId, environmentId, collPath, docId]
          );

          await client.query(
            `INSERT INTO event_outbox (project_id, environment_id, collection_path, document_id, event_type, payload, version)
             VALUES ($1, $2, $3, $4, 'document_deleted', '{}'::jsonb, 0)`,
            [projectId, environmentId, collPath, docId]
          );
          versions[op.path] = 0;
        }
      }

      return { committed: true, versions };
    });
  }

  /**
   * Executes a collection group query across subcollections matching the leaf collection ID.
   */
  public static async queryCollectionGroup(
    projectId: string,
    environmentId: string,
    collectionId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<DocumentSnapshot[]> {
    const limit = Math.min(options?.limit || 50, 100);
    const offset = options?.offset || 0;

    const res = await query<{
      document_id: string;
      collection_path: string;
      data: DocumentData;
      version: string;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT document_id, collection_path, data, version, created_at, updated_at
       FROM documents
       WHERE project_id = $1 
         AND environment_id = $2 
         AND substring(collection_path from '[^/]+$') = $3
       ORDER BY created_at DESC
       LIMIT $4 OFFSET $5`,
      [projectId, environmentId, collectionId, limit, offset]
    );

    return res.rows.map((row) => ({
      id: row.document_id,
      path: `/${row.collection_path}/${row.document_id}`,
      data: row.data,
      version: parseInt(row.version, 10),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }
}
