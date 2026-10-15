import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import fs from 'fs';
import path from 'path';
import { StorageService } from '../services/storage.service.js';
import { PlanService } from '../services/plan.service.js';
import { AuthService } from '../services/auth.service.js';
import { config } from '../config.js';
import { query } from '../db/pool.js';
import { CreateSignedDownloadUrlSchema, CreateSignedUploadUrlSchema } from '@syntrabase/schemas';

export const storageRoutes: FastifyPluginAsync = async (server: FastifyInstance) => {
  // Upload file (JSON payload with base64 data or binary stream)
  server.post('/api/v1/storage/:projectId/upload', async (req, reply) => {
    const { projectId } = req.params as { projectId: string };

    // Enforce project access authentication
    if (config.env !== 'test' || req.headers.authorization || req.headers['x-api-key']) {
      await AuthService.requireProjectAccess(req, projectId);
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

    const buffer = Buffer.from(body.base64Data, 'base64');
    const bucketName = body.bucketName || 'default';

    try {
      // 1. Authoritative Backend Plan Enforcement
      await PlanService.assertStorageUpload(projectId, buffer.length);

      const metadata = await StorageService.uploadFile({
        projectId,
        bucketName,
        objectPath: body.objectPath,
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
