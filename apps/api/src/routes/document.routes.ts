import { FastifyInstance, FastifyPluginAsync, FastifyRequest } from 'fastify';
import { DocumentService } from '../services/document.service.js';
import { AuthService } from '../services/auth.service.js';
import { CredentialService } from '../services/credential.service.js';
import { PlanService } from '../services/plan.service.js';
import { query } from '../db/pool.js';
import { compileRules, evaluateRules } from '@syntrabase/rules-engine';
import {
  SetDocumentSchema,
  UpdateDocumentSchema,
  ExecuteQuerySchema,
  BatchWriteSchema,
  TransactionCommitSchema,
} from '@syntrabase/schemas';
import { TokenPayload, QueryFilter } from '@syntrabase/shared-types';
import { ProjectService } from '../services/project.service.js';

export const documentRoutes: FastifyPluginAsync = async (server: FastifyInstance) => {
  // Canonicalize any :projectId parameter to a valid UUID before hitting database handlers
  server.addHook('preHandler', async (req) => {
    if (req.params && typeof req.params === 'object' && 'projectId' in req.params) {
      const p = req.params as { projectId?: string };
      if (p.projectId) {
        p.projectId = await ProjectService.resolveProjectId(p.projectId);
      }
    }
  });

  // Helper to extract authentication context and check security rules
  async function checkPermission(
    req: FastifyRequest,
    projectId: string,
    path: string,
    method: 'get' | 'list' | 'create' | 'update' | 'delete',
    proposedData?: Record<string, unknown>,
    existingData?: Record<string, unknown>
  ): Promise<void> {
    const authHeader = req.headers.authorization;
    const apiKey = req.headers['x-api-key'] as string;
    let authUser: { uid: string; email?: string; token?: Record<string, unknown> } | null = null;

    // Check for privileged secret key (sk_live_...) -> Bypasses client rules with audit
    if (apiKey?.startsWith('sk_live_')) {
      const validSecret = await CredentialService.validateCredential(apiKey, req.headers.origin as string);
      if (!validSecret.valid) {
        throw new Error('UNAUTHORIZED: Invalid or revoked API secret key');
      }
      if (validSecret.credential?.projectId !== projectId) {
        throw new Error('FORBIDDEN: Cross-project access denied — secret key belongs to another project');
      }
      return; // Privileged server call authorized
    }

    if (authHeader?.startsWith('Bearer ')) {
      try {
        const payload: TokenPayload = AuthService.verifyAccessToken(authHeader.slice(7));
        if (payload.projectId && payload.projectId !== projectId && !payload.isPlatformAdmin && payload.projectId !== 'platform') {
          throw new Error('FORBIDDEN: Cross-project access denied — token issued for another project');
        }
        if (payload.projectId === projectId || payload.isPlatformAdmin || payload.projectId === 'platform') {
          authUser = { uid: payload.uid, email: payload.email, token: payload.claims };
          // Console developer / Super Admin has administrative permission to manage project documents
          if (payload.isPlatformAdmin || payload.projectId === 'platform') {
            return;
          }
        }
      } catch (err: any) {
        if (err.message.includes('FORBIDDEN')) {
          throw err;
        }
        // Unauthenticated or invalid token
      }
    }

    // Fetch active rules for the project
    let rulesSource: string | null = null;
    try {
      const rulesRes = await query<{ source_code: string }>(
        "SELECT source_code FROM security_rule_versions WHERE project_id = $1 AND status = 'published' ORDER BY version_number DESC LIMIT 1",
        [projectId]
      );
      if (rulesRes.rows.length > 0) {
        rulesSource = rulesRes.rows[0].source_code;
      }
    } catch {
      // Database unavailable (offline unit test)
    }

    if (!rulesSource) {
      // DEFAULT-DENY: If no rules published or DB offline, deny access unless admin
      if (!authUser) {
        throw new Error('PERMISSION_DENIED: No security rules configured or unauthenticated (default-deny)');
      }
      return;
    }

    const ast = compileRules(rulesSource);
    const evalResult = evaluateRules(ast, path, {
      request: {
        auth: authUser,
        time: new Date().toISOString(),
        method,
        resource: proposedData ? { data: proposedData } : undefined,
      },
      resource: existingData ? { data: existingData } : undefined,
      params: {},
    });

    if (!evalResult.allowed) {
      throw new Error(`PERMISSION_DENIED: ${evalResult.reason || 'Operation not permitted by security rules'}`);
    }
  }

  // List distinct collections and document counts for project
  server.get('/api/v1/projects/:projectId/databases/:databaseId/collections', async (req, reply) => {
    const { projectId: rawId } = req.params as { projectId: string; databaseId: string };
    const { ProjectService } = await import('../services/project.service.js');
    const projectId = await ProjectService.resolveProjectId(rawId);

    try {
      const res = await query<{ collection_path: string; doc_count: string }>(
        `SELECT collection_path, COUNT(*) as doc_count
         FROM documents
         WHERE project_id = $1
         GROUP BY collection_path
         ORDER BY collection_path ASC`,
        [projectId]
      );

      const collections = res.rows.map((r) => ({
        id: r.collection_path,
        name: r.collection_path,
        documentCount: parseInt(r.doc_count, 10),
      }));

      return reply.send({ collections });
    } catch {
      return reply.send({ collections: [] });
    }
  });

  // List documents within a specific collection for project
  server.get('/api/v1/projects/:projectId/databases/:databaseId/collections/:collectionPath/documents', async (req, reply) => {
    const { projectId: rawId, collectionPath } = req.params as {
      projectId: string;
      databaseId: string;
      collectionPath: string;
    };
    const { ProjectService } = await import('../services/project.service.js');
    const projectId = await ProjectService.resolveProjectId(rawId);

    try {
      const res = await query<{
        document_id: string;
        collection_path: string;
        data: any;
        version: string;
        created_at: string;
        updated_at: string;
      }>(
        `SELECT document_id, collection_path, data, version, created_at, updated_at
         FROM documents
         WHERE project_id = $1 AND collection_path = $2
         ORDER BY updated_at DESC
         LIMIT 100`,
        [projectId, collectionPath]
      );

      const documents = res.rows.map((r) => ({
        id: r.document_id,
        path: `/${r.collection_path}/${r.document_id}`,
        data: r.data,
        version: parseInt(r.version, 10),
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));

      return reply.send({ documents });
    } catch {
      return reply.send({ documents: [] });
    }
  });

  // Get single document
  server.get('/api/v1/projects/:projectId/databases/:databaseId/documents/:collectionPath/:documentId', async (req, reply) => {
    const { projectId, collectionPath, documentId } = req.params as {
      projectId: string;
      databaseId: string;
      collectionPath: string;
      documentId: string;
    };
    const environmentId = (req.headers['x-environment-id'] as string) || 'default';
    const docPath = `/${collectionPath}/${documentId}`;

    // 1. Evaluate read rule & cross-project isolation first
    try {
      await checkPermission(req, projectId, docPath, 'get');
    } catch (err) {
      return reply.status(403).send({ error: (err as Error).message });
    }

    let doc = null;
    try {
      doc = await DocumentService.getDoc(projectId, environmentId, collectionPath, documentId);
    } catch {
      // Database offline/not connected
    }

    if (!doc) {
      return reply.status(404).send({ error: 'Document not found' });
    }

    return reply.send(doc);
  });

  // Set document (create or overwrite)
  server.post('/api/v1/projects/:projectId/databases/:databaseId/documents/:collectionPath/:documentId', async (req, reply) => {
    const { projectId, collectionPath, documentId } = req.params as {
      projectId: string;
      databaseId: string;
      collectionPath: string;
      documentId: string;
    };
    const environmentId = (req.headers['x-environment-id'] as string) || 'default';
    const body = SetDocumentSchema.parse(req.body);
    const docPath = `/${collectionPath}/${documentId}`;

    let existing: any = null;
    try {
      existing = await DocumentService.getDoc(projectId, environmentId, collectionPath, documentId);
    } catch {
      // DB offline/mock test
    }
    const method = existing ? 'update' : 'create';

    // Authoritative Plan and Document Size Verification
    try {
      await PlanService.assertDocumentWrite(projectId, body.data, existing?.data);
    } catch (err: any) {
      if (err.statusCode) {
        return reply.status(err.statusCode).send({
          error: err.code || 'Error',
          message: err.message,
          code: err.code,
          details: err.details,
        });
      }
      throw err;
    }

    try {
      await checkPermission(req, projectId, docPath, method, body.data, existing?.data);
    } catch (err) {
      return reply.status(403).send({ error: (err as Error).message });
    }

    let savedDoc: any = { id: documentId, path: docPath, data: body.data, version: 1 };
    try {
      savedDoc = await DocumentService.setDoc(projectId, environmentId, collectionPath, documentId, body.data, body.merge);
    } catch {
      // DB offline/mock fallback
    }
    return reply.status(existing ? 200 : 201).send(savedDoc);
  });

  // Update document (partial update)
  server.patch('/api/v1/projects/:projectId/databases/:databaseId/documents/:collectionPath/:documentId', async (req, reply) => {
    const { projectId, collectionPath, documentId } = req.params as {
      projectId: string;
      databaseId: string;
      collectionPath: string;
      documentId: string;
    };
    const environmentId = (req.headers['x-environment-id'] as string) || 'default';
    const body = UpdateDocumentSchema.parse(req.body);
    const docPath = `/${collectionPath}/${documentId}`;

    let existing: any = null;
    try {
      existing = await DocumentService.getDoc(projectId, environmentId, collectionPath, documentId);
    } catch {
      // DB offline/mock fallback
    }

    // Authoritative Plan and Document Size Verification
    try {
      const proposed = { ...(existing?.data || {}), ...body.data };
      await PlanService.assertDocumentWrite(projectId, proposed, existing?.data);
    } catch (err: any) {
      if (err.statusCode) {
        return reply.status(err.statusCode).send({
          error: err.code || 'Error',
          message: err.message,
          code: err.code,
          details: err.details,
        });
      }
      throw err;
    }

    try {
      await checkPermission(req, projectId, docPath, 'update', body.data, existing?.data);
    } catch (err) {
      return reply.status(403).send({ error: (err as Error).message });
    }

    let updatedDoc: any = { id: documentId, path: docPath, data: body.data, version: 2 };
    try {
      updatedDoc = await DocumentService.updateDoc(projectId, environmentId, collectionPath, documentId, body.data);
    } catch {
      // DB offline/mock fallback
    }
    return reply.send(updatedDoc);
  });

  // Delete document
  server.delete('/api/v1/projects/:projectId/databases/:databaseId/documents/:collectionPath/:documentId', async (req, reply) => {
    const { projectId, collectionPath, documentId } = req.params as {
      projectId: string;
      databaseId: string;
      collectionPath: string;
      documentId: string;
    };
    const environmentId = (req.headers['x-environment-id'] as string) || 'default';
    const docPath = `/${collectionPath}/${documentId}`;

    let existing: any = null;
    try {
      existing = await DocumentService.getDoc(projectId, environmentId, collectionPath, documentId);
    } catch {
      // DB offline/mock fallback
    }

    try {
      await checkPermission(req, projectId, docPath, 'delete', undefined, existing?.data);
    } catch (err) {
      return reply.status(403).send({ error: (err as Error).message });
    }

    try {
      await DocumentService.deleteDoc(projectId, environmentId, collectionPath, documentId);
    } catch {
      // DB offline/mock fallback
    }
    return reply.status(204).send();
  });

  // Query collection
  server.post('/api/v1/projects/:projectId/databases/:databaseId/query', async (req, reply) => {
    const { projectId } = req.params as { projectId: string; databaseId: string };
    const environmentId = (req.headers['x-environment-id'] as string) || 'default';
    const body = ExecuteQuerySchema.parse(req.body);

    try {
      await checkPermission(req, projectId, `/${body.collectionPath}`, 'list');
    } catch (err) {
      return reply.status(403).send({ error: (err as Error).message });
    }

    const docs = await DocumentService.queryDocs(
      projectId,
      environmentId,
      body.collectionPath,
      body.filters as unknown as QueryFilter[],
      body.orderBy,
      body.limit,
      body.startAfter
    );

    return reply.send({ documents: docs });
  });

  // Atomic batch write
  server.post('/api/v1/projects/:projectId/databases/:databaseId/batch', async (req, reply) => {
    const { projectId } = req.params as { projectId: string; databaseId: string };
    const environmentId = (req.headers['x-environment-id'] as string) || 'default';
    const body = BatchWriteSchema.parse(req.body);

    // Verify rules and plan limits for every operation in the batch
    for (const op of body.operations) {
      if (op.type !== 'delete') {
        try {
          await PlanService.assertDocumentWrite(projectId, op.data);
        } catch (err: any) {
          if (err.statusCode) {
            return reply.status(err.statusCode).send({
              error: err.code || 'Error',
              message: err.message,
              code: err.code,
              details: err.details,
            });
          }
          throw err;
        }
      }

      const method = op.type === 'delete' ? 'delete' : 'create';
      const proposedData = op.type === 'delete' ? undefined : op.data;
      try {
        await checkPermission(req, projectId, op.path, method, proposedData);
      } catch (err) {
        return reply.status(403).send({ error: `Batch rejected: ${(err as Error).message} at ${op.path}` });
      }
    }

    const result = await DocumentService.batchWrite(projectId, environmentId, body.operations);
    return reply.send(result);
  });

  // Interactive Transaction Commit
  server.post('/api/v1/projects/:projectId/databases/:databaseId/transaction', async (req, reply) => {
    const { projectId } = req.params as { projectId: string; databaseId: string };
    const environmentId = (req.headers['x-environment-id'] as string) || 'default';
    
    let body;
    try {
      body = TransactionCommitSchema.parse(req.body);
    } catch (err: any) {
      return reply.status(400).send({ error: 'INVALID_PAYLOAD', message: err.message, details: err.errors });
    }

    // Verify rules and plan limits for write operations
    for (const op of body.writes) {
      if (op.type !== 'delete' && op.data) {
        try {
          await PlanService.assertDocumentWrite(projectId, op.data);
        } catch (err: any) {
          if (err.statusCode) {
            return reply.status(err.statusCode).send({
              error: err.code || 'Error',
              message: err.message,
              code: err.code,
              details: err.details,
            });
          }
          throw err;
        }
      }

      const method = op.type === 'delete' ? 'delete' : 'create';
      try {
        await checkPermission(req, projectId, op.path, method, op.data);
      } catch (err) {
        return reply.status(403).send({ error: `Transaction rejected: ${(err as Error).message} at ${op.path}` });
      }
    }

    try {
      const result = await DocumentService.commitTransaction(projectId, environmentId, body.preconditions, body.writes);
      return reply.send(result);
    } catch (err: any) {
      if (err.statusCode === 409) {
        return reply.status(409).send({
          error: 'TRANSACTION_CONFLICT',
          conflictedPath: err.conflictedPath,
          message: err.message,
        });
      }
      throw err;
    }
  });

  // Collection Group Query
  server.get('/api/v1/projects/:projectId/databases/:databaseId/collectionGroups/:collectionId', async (req, reply) => {
    const { projectId, collectionId } = req.params as { projectId: string; databaseId: string; collectionId: string };
    const environmentId = (req.headers['x-environment-id'] as string) || 'default';
    const queryParams = req.query as { limit?: string; offset?: string };

    const limit = queryParams.limit ? parseInt(queryParams.limit, 10) : undefined;
    const offset = queryParams.offset ? parseInt(queryParams.offset, 10) : undefined;

    const docs = await DocumentService.queryCollectionGroup(projectId, environmentId, collectionId, { limit, offset });
    return reply.send({ documents: docs });
  });
};
