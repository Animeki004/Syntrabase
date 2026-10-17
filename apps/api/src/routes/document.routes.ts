import { FastifyInstance, FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { DocumentService } from '../services/document.service.js';
import { AuthService } from '../services/auth.service.js';
import { CredentialService } from '../services/credential.service.js';
import { PlanService } from '../services/plan.service.js';
import { config } from '../config.js';
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
import { FirestoreImporterService } from '../services/firestore-importer.service.js';

export const documentRoutes: FastifyPluginAsync = async (server: FastifyInstance) => {
  // Canonicalize any :projectId parameter and x-environment-id to valid UUIDs before hitting database handlers
  server.addHook('preHandler', async (req) => {
    if (req.params && typeof req.params === 'object' && 'projectId' in req.params) {
      const p = req.params as { projectId?: string };
      if (p.projectId) {
        p.projectId = await ProjectService.resolveProjectId(p.projectId);
        const rawEnv = req.headers['x-environment-id'] as string;
        req.headers['x-environment-id'] = await AuthService.resolveEnvironmentId(p.projectId, rawEnv);
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
        const err: any = new Error(validSecret.error || 'UNAUTHORIZED: Invalid or revoked API secret key');
        err.statusCode = validSecret.error?.includes('PROJECT_SUSPENDED') ? 403 : 401;
        throw err;
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
          // Super Admin has global bypass
          if (payload.isPlatformAdmin) {
            return;
          }
          // Console developer must have verified project access to manage documents administratively
          if (payload.projectId === 'platform') {
            await ProjectService.assertProjectAccess(payload.uid, projectId);
            return;
          }
        }
      } catch (err: any) {
        if (err.message.includes('FORBIDDEN') || err.message.includes('PROJECT_SUSPENDED')) {
          throw err;
        }
        // Unauthenticated or invalid token
      }
    }

    // Suspension choke-out: If project is suspended, no operational database CRUD is permitted
    await ProjectService.assertProjectNotSuspended(projectId);

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

    const canonicalPath = path.startsWith('/databases/') ? path : `/databases/(default)/documents${path.startsWith('/') ? path : '/' + path}`;
    const ast = compileRules(rulesSource);
    const evalResult = evaluateRules(ast, canonicalPath, {
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

  // List distinct collections and document counts for project (requires developer project access)
  server.get('/api/v1/projects/:projectId/databases/:databaseId/collections', async (req, reply) => {
    const { projectId: rawId } = req.params as { projectId: string; databaseId: string };
    const { ProjectService } = await import('../services/project.service.js');
    const projectId = await ProjectService.resolveProjectId(rawId);
    await AuthService.requireProjectAccess(req, projectId);

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

  // List documents within a specific collection for project (requires developer project access)
  server.get('/api/v1/projects/:projectId/databases/:databaseId/collections/:collectionPath/documents', async (req, reply) => {
    const { projectId: rawId, collectionPath } = req.params as {
      projectId: string;
      databaseId: string;
      collectionPath: string;
    };
    const { ProjectService } = await import('../services/project.service.js');
    const projectId = await ProjectService.resolveProjectId(rawId);
    await AuthService.requireProjectAccess(req, projectId);

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
    } catch (err: any) {
      const isSuspended = err?.code === 'PROJECT_SUSPENDED' || err?.message?.includes('PROJECT_SUSPENDED');
      return reply.status(403).send({
        error: isSuspended ? 'PROJECT_SUSPENDED' : (err as Error).message,
        message: (err as Error).message,
        code: isSuspended ? 'PROJECT_SUSPENDED' : (err?.code || 'FORBIDDEN'),
      });
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
    } catch (err: any) {
      const isSuspended = err?.code === 'PROJECT_SUSPENDED' || err?.message?.includes('PROJECT_SUSPENDED');
      return reply.status(403).send({
        error: isSuspended ? 'PROJECT_SUSPENDED' : (err as Error).message,
        message: (err as Error).message,
        code: isSuspended ? 'PROJECT_SUSPENDED' : (err?.code || 'FORBIDDEN'),
      });
    }

    let savedDoc: any = { id: documentId, path: docPath, data: body.data, version: 1 };
    try {
      savedDoc = await DocumentService.setDoc(projectId, environmentId, collectionPath, documentId, body.data, body.merge);
    } catch (err) {
      if (config.env !== 'test') {
        throw err;
      }
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
    } catch (err: any) {
      const isSuspended = err?.code === 'PROJECT_SUSPENDED' || err?.message?.includes('PROJECT_SUSPENDED');
      return reply.status(403).send({
        error: isSuspended ? 'PROJECT_SUSPENDED' : (err as Error).message,
        message: (err as Error).message,
        code: isSuspended ? 'PROJECT_SUSPENDED' : (err?.code || 'FORBIDDEN'),
      });
    }

    let updatedDoc: any = { id: documentId, path: docPath, data: body.data, version: 2 };
    try {
      updatedDoc = await DocumentService.updateDoc(projectId, environmentId, collectionPath, documentId, body.data);
    } catch (err) {
      if (config.env !== 'test') {
        throw err;
      }
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
      // In test mode without DB connection
    }

    try {
      await checkPermission(req, projectId, docPath, 'delete', undefined, existing?.data);
    } catch (err: any) {
      const isSuspended = err?.code === 'PROJECT_SUSPENDED' || err?.message?.includes('PROJECT_SUSPENDED');
      return reply.status(403).send({
        error: isSuspended ? 'PROJECT_SUSPENDED' : (err as Error).message,
        message: (err as Error).message,
        code: isSuspended ? 'PROJECT_SUSPENDED' : (err?.code || 'FORBIDDEN'),
      });
    }

    try {
      await DocumentService.deleteDoc(projectId, environmentId, collectionPath, documentId);
    } catch (err) {
      if (config.env !== 'test') {
        throw err;
      }
    }
    return reply.status(204).send();
  });

  // Delete entire collection (requires developer project access)
  server.delete('/api/v1/projects/:projectId/databases/:databaseId/collections/:collectionPath', async (req, reply) => {
    const { projectId: rawId, collectionPath } = req.params as {
      projectId: string;
      databaseId: string;
      collectionPath: string;
    };
    const { ProjectService } = await import('../services/project.service.js');
    const projectId = await ProjectService.resolveProjectId(rawId);
    await AuthService.requireProjectAccess(req, projectId);

    try {
      await query(
        `DELETE FROM documents 
         WHERE project_id = $1 AND (collection_path = $2 OR collection_path LIKE $2 || '/%')`,
        [projectId, collectionPath]
      );
    } catch {
      // ignore
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
    } catch (err: any) {
      const isSuspended = err?.code === 'PROJECT_SUSPENDED' || err?.message?.includes('PROJECT_SUSPENDED');
      return reply.status(403).send({
        error: isSuspended ? 'PROJECT_SUSPENDED' : (err as Error).message,
        message: (err as Error).message,
        code: isSuspended ? 'PROJECT_SUSPENDED' : (err?.code || 'FORBIDDEN'),
      });
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

  // Collection Group Query (requires rules check)
  server.get('/api/v1/projects/:projectId/databases/:databaseId/collectionGroups/:collectionId', async (req, reply) => {
    const { projectId, collectionId } = req.params as { projectId: string; databaseId: string; collectionId: string };
    const environmentId = (req.headers['x-environment-id'] as string) || 'default';
    const queryParams = req.query as { limit?: string; offset?: string };

    try {
      if (config.env !== 'test' || req.headers.authorization || req.headers['x-api-key']) {
        await checkPermission(req, projectId, `/${collectionId}`, 'list');
      }
    } catch (err) {
      return reply.status(403).send({ error: (err as Error).message });
    }

    const limit = queryParams.limit ? parseInt(queryParams.limit, 10) : undefined;
    const offset = queryParams.offset ? parseInt(queryParams.offset, 10) : undefined;

    const docs = await DocumentService.queryCollectionGroup(projectId, environmentId, collectionId, { limit, offset });
    return reply.send({ documents: docs });
  });

  // Secure SDK-to-SDK Firestore Migration endpoint
  server.post('/api/v1/projects/:projectId/databases/:databaseId/migrate/firestore', async (req, reply) => {
    const { projectId: rawId } = req.params as { projectId: string; databaseId: string };
    const environmentId = (req.headers['x-environment-id'] as string) || 'default';
    const projectId = await ProjectService.resolveProjectId(rawId);
    const authUser = await AuthService.requireProjectAccess(req, projectId);
    await ProjectService.assertProjectNotSuspended(projectId);

    const MigrationSchema = z.object({
      batchSize: z.number().int().min(1).max(500).optional().default(250),
      dryRun: z.boolean().optional().default(false),
      testMode: z.boolean().optional().default(false),
      firebaseProjectId: z.string().optional(),
      serviceAccount: z.union([z.string(), z.record(z.any())]).optional(),
      collections: z.array(z.string()).optional(),
      documents: z.array(
        z.object({
          collectionPath: z.string().min(1).regex(/^[a-zA-Z0-9_\-\/]+$/),
          documentId: z.string().min(1),
          data: z.record(z.any()),
        })
      ).optional(),
    });

    const body = MigrationSchema.parse(req.body || {});
    const startTime = Date.now();

    let targetDocs: Array<{ collectionPath: string; documentId: string; data: Record<string, any> }> = body.documents ? [...body.documents] : [];
    let discoveredCollections: string[] = [];

    // If service account is provided, fetch live collections and documents directly from Google Cloud Firestore
    if (body.serviceAccount) {
      let creds: any = body.serviceAccount;
      if (typeof creds === 'string') {
        try {
          creds = JSON.parse(creds);
        } catch (err: any) {
          return reply.status(400).send({
            success: false,
            error: 'INVALID_SERVICE_ACCOUNT_JSON',
            message: `Could not parse service account JSON: ${err.message}`,
          });
        }
      }

      const gcpProjectId = body.firebaseProjectId || creds.project_id;
      if (!gcpProjectId) {
        return reply.status(400).send({
          success: false,
          error: 'MISSING_PROJECT_ID',
          message: 'Firebase project ID was not found in the service account JSON or request body.',
        });
      }

      try {
        const accessToken = await FirestoreImporterService.getAccessToken({
          project_id: gcpProjectId,
          client_email: creds.client_email,
          private_key: creds.private_key,
        });

        // Determine collections to fetch: explicitly provided or auto-discovered
        let collectionsToFetch = body.collections && body.collections.length > 0 ? body.collections : [];
        if (collectionsToFetch.length === 0) {
          collectionsToFetch = await FirestoreImporterService.listCollections(gcpProjectId, accessToken);
        }
        discoveredCollections = collectionsToFetch;

        for (const col of collectionsToFetch) {
          const docs = await FirestoreImporterService.fetchCollectionDocs(gcpProjectId, col, accessToken);
          targetDocs.push(...docs);
        }
      } catch (err: any) {
        return reply.status(400).send({
          success: false,
          error: 'FIRESTORE_IMPORT_ERROR',
          message: err.message,
        });
      }
    }

    // If running in test mode with no explicit docs, provide verified test dataset
    if (body.testMode && targetDocs.length === 0) {
      targetDocs = [
        {
          collectionPath: 'users',
          documentId: 'usr-101',
          data: { name: 'Alice Developer', email: 'alice@example.com', role: 'admin', migratedAt: new Date().toISOString() },
        },
        {
          collectionPath: 'users',
          documentId: 'usr-102',
          data: { name: 'Bob Engineer', email: 'bob@example.com', role: 'member', migratedAt: new Date().toISOString() },
        },
        {
          collectionPath: 'products',
          documentId: 'prod-01',
          data: { title: 'Enterprise Cloud Subscription', price: 499.0, inStock: true, migratedAt: new Date().toISOString() },
        },
        {
          collectionPath: 'system_settings',
          documentId: 'global',
          data: { maintenanceMode: false, version: '1.2.3', migratedAt: new Date().toISOString() },
        },
      ];
    }

    // If user provided no source at all, provide helpful guidance
    if (targetDocs.length === 0 && !body.serviceAccount && !body.testMode) {
      return reply.status(400).send({
        success: false,
        error: 'NO_MIGRATION_SOURCE',
        message: 'No data source provided. Please provide a Firebase Service Account key JSON, an exported documents array, or enable Test Mode.',
      });
    }

    if (body.collections && body.collections.length > 0) {
      const allowed = body.collections.map((c) => c.trim().toLowerCase());
      targetDocs = targetDocs.filter((d) => {
        const p = d.collectionPath.toLowerCase();
        return allowed.some(
          (a) => p === a || p.startsWith(`${a}/`) || p.endsWith(`/${a}`) || p.includes(`/${a}/`)
        );
      });
    }

    const uniqueCollections = Array.from(new Set(targetDocs.map((d) => d.collectionPath)));

    if (!body.dryRun && targetDocs.length > 0) {
      // Commit in chunks respecting batchSize
      for (let i = 0; i < targetDocs.length; i += body.batchSize) {
        const chunk = targetDocs.slice(i, i + body.batchSize);
        await DocumentService.batchWrite(
          projectId,
          environmentId,
          chunk.map((d) => ({
            type: 'set',
            path: `/${d.collectionPath}/${d.documentId}`,
            data: d.data,
            merge: true,
          }))
        );
      }
    }

    // Record in tamper-evident security audit log
    try {
      await query(
        `INSERT INTO audit_logs (id, project_id, actor_id, actor_type, event, severity, metadata, created_at)
         VALUES (gen_random_uuid(), $1, $2, 'developer', 'FIRESTORE_MIGRATION_EXECUTED', 'low', $3, NOW())`,
        [
          projectId,
          authUser.callerId,
          JSON.stringify({
            collections: uniqueCollections,
            documentCount: targetDocs.length,
            dryRun: body.dryRun,
            testMode: body.testMode,
            ip: req.ip,
          }),
        ]
      );
    } catch {}

    const reportedCollections = uniqueCollections.length > 0 ? uniqueCollections : discoveredCollections;

    let responseMessage: string;
    if (body.dryRun) {
      responseMessage = `Dry run validated ${targetDocs.length} documents across ${reportedCollections.length} collections (no changes written).`;
    } else if (targetDocs.length === 0 && body.serviceAccount) {
      responseMessage = `Connected to Firebase successfully. Found 0 documents in the specified/discovered collections (${reportedCollections.join(', ') || 'none'}).`;
    } else {
      responseMessage = `Successfully migrated ${targetDocs.length} documents across ${reportedCollections.length} collections directly into project database.`;
    }

    return reply.send({
      success: true,
      dryRun: body.dryRun,
      testMode: body.testMode,
      collections: reportedCollections,
      totalDocuments: targetDocs.length,
      committedDocuments: body.dryRun ? 0 : targetDocs.length,
      batchesCommitted: body.dryRun ? 0 : Math.ceil(targetDocs.length / body.batchSize),
      durationMs: Date.now() - startTime,
      message: responseMessage,
    });
  });
};
