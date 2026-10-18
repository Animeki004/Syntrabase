import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import fs from 'fs';
import path from 'path';
import { StorageService } from '../services/storage.service.js';
import { PlanService } from '../services/plan.service.js';
import { AuthService } from '../services/auth.service.js';
import { config } from '../config.js';
import { query } from '../db/pool.js';
import { CreateSignedDownloadUrlSchema, CreateSignedUploadUrlSchema } from '@syntrabase/schemas';

// In-memory rate limiting map for storage uploads (anti-spam defense: max 60 uploads / minute / project)
const uploadRateLimitMap = new Map<string, { count: number; resetAt: number }>();

export const storageRoutes: FastifyPluginAsync = async (server: FastifyInstance) => {
  // Upload file (JSON payload with base64 data or binary stream)
  server.post('/api/v1/storage/:projectId/upload', async (req, reply) => {
    const { projectId } = req.params as { projectId: string };

    // Enforce project access authentication
    if (config.env !== 'test' || req.headers.authorization || req.headers['x-api-key']) {
      await AuthService.requireProjectAccess(req, projectId);
    }

    // Anti-spam throttling check
    const now = Date.now();
    const rateKey = `upload_${projectId}`;
    const rateData = uploadRateLimitMap.get(rateKey);
    if (rateData && rateData.resetAt > now) {
      if (rateData.count >= 60) {
        return reply.status(429).send({
          error: 'TOO_MANY_REQUESTS: Storage upload rate limit exceeded. Please wait before uploading more files.',
          code: 'UPLOAD_RATE_LIMIT_EXCEEDED',
        });
      }
      rateData.count++;
    } else {
      uploadRateLimitMap.set(rateKey, { count: 1, resetAt: now + 60000 });
    }

    const body = req.body as {
      bucketName?: string;
      objectPath: string;
      originalName: string;
      mimeType: string;
      base64Data: string;
      metadata?: Record<string, string>;
    };

    if (!body.objectPath || !body.base64Data) {
      return reply.status(400).send({ error: 'Missing objectPath or base64Data' });
    }

    const cleanObjectPath = body.objectPath.trim().replace(/^\/+/, '');
    if (cleanObjectPath.includes('..') || cleanObjectPath.length > 512) {
      return reply.status(400).send({ error: 'INVALID_OBJECT_PATH: Directory traversal or invalid object path characters rejected.' });
    }

    const dangerousExtensions = /\.(exe|sh|bat|cmd|ps1|vbs|msi|com|scr|pif|reg|dll|so|dylib)$/i;
    if (dangerousExtensions.test(cleanObjectPath) || dangerousExtensions.test(body.originalName || '')) {
      return reply.status(400).send({ error: 'FORBIDDEN_FILE_TYPE: Executable or script extensions are prohibited.' });
    }

    const buffer = Buffer.from(body.base64Data, 'base64');
    const bucketName = body.bucketName || 'default';

    try {
      // 1. Authoritative Backend Plan Enforcement
      await PlanService.assertStorageUpload(projectId, buffer.length);

      const metadata = await StorageService.uploadFile({
        projectId,
        bucketName,
        objectPath: cleanObjectPath,
        originalName: body.originalName || 'file',
        mimeType: body.mimeType || 'application/octet-stream',
        buffer,
        metadata: body.metadata,
      });

      return reply.status(201).send(metadata);
    } catch (err: any) {
      if (err.statusCode) {
        return reply.status(err.statusCode).send({
          error: err.code || 'Error',
          message: err.message,
          code: err.code,
          feature: err.feature,
          upgradeUrl: err.upgradeUrl,
          details: err.details,
        });
      }
      return reply.status(400).send({ error: (err as Error).message });
    }
  });

  // Generate signed upload URL
  server.post('/api/v1/storage/:projectId/signed-upload-url', async (req, reply) => {
    const { projectId } = req.params as { projectId: string };

    if (config.env !== 'test' || req.headers.authorization || req.headers['x-api-key']) {
      await AuthService.requireProjectAccess(req, projectId);
    }

    const body = CreateSignedUploadUrlSchema.parse(req.body);

    try {
      // Enforce storage capability and quota
      await PlanService.assertStorageUpload(projectId, body.sizeBytes);

      const signedUrl = StorageService.generateSignedUrl(
        projectId,
        body.bucketName,
        body.objectPath,
        3600
      );

      return reply.send({ signedUrl });
    } catch (err: any) {
      if (err.statusCode) {
        return reply.status(err.statusCode).send({
          error: err.code || 'Error',
          message: err.message,
          code: err.code,
          feature: err.feature,
          upgradeUrl: err.upgradeUrl,
        });
      }
      return reply.status(400).send({ error: (err as Error).message });
    }
  });

  // Generate signed download/upload URL
  server.post('/api/v1/storage/:projectId/signed-url', async (req, reply) => {
    const { projectId } = req.params as { projectId: string };

    if (config.env !== 'test' || req.headers.authorization || req.headers['x-api-key']) {
      await AuthService.requireProjectAccess(req, projectId);
    }

    const body = CreateSignedDownloadUrlSchema.parse(req.body);

    try {
      // If action is explicitly upload, reject on Free tier
      if ((body as any).action === 'upload') {
        await PlanService.assertCapability(projectId, 'storage.objects');
      }

      const signedUrl = StorageService.generateSignedUrl(
        projectId,
        body.bucketName,
        body.objectPath,
        body.expiresInSeconds
      );

      return reply.send({ signedUrl });
    } catch (err: any) {
      if (err.statusCode) {
        return reply.status(err.statusCode).send({
          error: err.code || 'Error',
          message: err.message,
          code: err.code,
          feature: err.feature,
          upgradeUrl: err.upgradeUrl,
        });
      }
      return reply.status(400).send({ error: (err as Error).message });
    }
  });

  // Download object via signed token
  server.get('/api/v1/storage/download', async (req, reply) => {
    const { token } = req.query as { token?: string };
    if (!token) {
      return reply.status(400).send({ error: 'Missing download token' });
    }

    const validation = StorageService.validateSignedUrl(token);
    if (!validation.valid || !validation.objectPath) {
      return reply.status(403).send({ error: validation.error || 'Invalid download token' });
    }

    // Verify project is active and not suspended
    if (validation.projectId) {
      try {
        const projRes = await query<{ is_active: boolean; status: string }>(
          'SELECT is_active, status FROM projects WHERE id = $1',
          [validation.projectId]
        );
        if (projRes.rows.length > 0) {
          const proj = projRes.rows[0];
          if (proj.is_active === false || proj.status === 'suspended') {
            return reply.status(403).send({ error: 'PROJECT_SUSPENDED', message: 'Project is inactive or suspended' });
          }
        }
      } catch {}
    }

    // Locate file in storage via database metadata first
    const objRes = await query<{ metadata: any; mime_type: string; original_name: string }>(
      'SELECT metadata, mime_type, original_name FROM storage_objects WHERE project_id = $1 AND object_path = $2',
      [validation.projectId, validation.objectPath]
    ).catch(() => ({ rows: [] }));

    const storageRoot = path.resolve(config.storage.localRoot);
    const matching = objRes.rows[0]?.metadata?.internalFilename;

    if (!matching) {
      return reply.status(404).send({ error: 'Object not found' });
    }

    const fullFilePath = path.join(storageRoot, matching);
    if (!fullFilePath.startsWith(storageRoot) || !fs.existsSync(fullFilePath)) {
      return reply.status(404).send({ error: 'Object not found on disk or invalid path' });
    }

    const mimeType = objRes.rows[0]?.mime_type || 'application/octet-stream';
    const originalName = objRes.rows[0]?.original_name || path.basename(validation.objectPath);

    reply.header('Content-Type', mimeType);
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Content-Security-Policy', "default-src 'none'");
    reply.header('Content-Disposition', `inline; filename="${originalName.replace(/"/g, '')}"`);

    const stream = fs.createReadStream(fullFilePath);
    return reply.send(stream);
  });

  // Direct authenticated download by objectId
  server.get('/api/v1/storage/:projectId/objects/:objectId/download', async (req, reply) => {
    const { projectId, objectId } = req.params as { projectId: string; objectId: string };

    if (config.env !== 'test' || req.headers.authorization || req.headers['x-api-key']) {
      await AuthService.requireProjectAccess(req, projectId);
    }

    // Check project status
    try {
      const projRes = await query<{ is_active: boolean; status: string }>(
        'SELECT is_active, status FROM projects WHERE id = $1',
        [projectId]
      );
      if (projRes.rows.length > 0) {
        const proj = projRes.rows[0];
        if (proj.is_active === false || proj.status === 'suspended') {
          return reply.status(403).send({ error: 'PROJECT_SUSPENDED', message: 'Project is inactive or suspended' });
        }
      }
    } catch {}

    const objRes = await query<{ metadata: any; mime_type: string; original_name: string; object_path: string }>(
      'SELECT metadata, mime_type, original_name, object_path FROM storage_objects WHERE project_id = $1 AND (id::text = $2 OR object_path = $2)',
      [projectId, objectId]
    ).catch(() => ({ rows: [] }));

    const obj = objRes.rows[0];
    const internalFilename = obj?.metadata?.internalFilename;
    if (!internalFilename) {
      return reply.status(404).send({ error: 'Object not found' });
    }

    const storageRoot = path.resolve(config.storage.localRoot);
    const fullFilePath = path.join(storageRoot, internalFilename);
    if (!fullFilePath.startsWith(storageRoot) || !fs.existsSync(fullFilePath)) {
      return reply.status(404).send({ error: 'Object not found on disk or invalid path' });
    }

    const mimeType = obj.mime_type || 'application/octet-stream';
    const originalName = obj.original_name || path.basename(obj.object_path || 'file');

    reply.header('Content-Type', mimeType);
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Content-Security-Policy', "default-src 'none'");
    reply.header('Content-Disposition', `attachment; filename="${originalName.replace(/"/g, '')}"`);

    const stream = fs.createReadStream(fullFilePath);
    return reply.send(stream);
  });

  // List project objects
  server.get('/api/v1/storage/:projectId/objects', async (req, reply) => {
    const { projectId } = req.params as { projectId: string };

    if (config.env !== 'test' || req.headers.authorization || req.headers['x-api-key']) {
      await AuthService.requireProjectAccess(req, projectId);
    }

    const objects = await StorageService.listObjects(projectId);
    return reply.send({ objects });
  });

  // Delete project object
  server.delete('/api/v1/storage/:projectId/objects/:objectId', async (req, reply) => {
    const { projectId, objectId } = req.params as { projectId: string; objectId: string };

    if (config.env !== 'test' || req.headers.authorization || req.headers['x-api-key']) {
      await AuthService.requireProjectAccess(req, projectId);
    }

    await StorageService.deleteObject(projectId, objectId);
    return reply.send({ success: true, message: `Object ${objectId} deleted.` });
  });
};
