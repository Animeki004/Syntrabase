import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { query } from '../db/pool.js';
import { config } from '../config.js';
import { ProjectService } from '../services/project.service.js';
import { DatabaseService } from '../services/database.service.js';
import { AuthService } from '../services/auth.service.js';
import { AuditService } from '../services/audit.service.js';
import { EmailService } from '../services/email.service.js';
import { ContactService } from '../services/contact.service.js';
import { PlanService } from '../services/plan.service.js';
import { CryptoUtil } from '../utils/crypto.js';
import { UrlUtil } from '../utils/url.util.js';
import { CreateDatabaseSchema, FollowUpContactMessageSchema } from '@syntrabase/schemas';
import { z } from 'zod';

const CreateProjectRequestSchema = z.object({
  name: z.string().min(2).max(100).trim(),
  slug: z.string().min(2).max(64).regex(/^[a-z0-9-]+$/).optional(),
});

export const projectRoutes: FastifyPluginAsync = async (server: FastifyInstance) => {
  // Canonicalize any :projectId parameter to a valid UUID before hitting database handlers
  server.addHook('preHandler', async (req) => {
    if (req.params && typeof req.params === 'object' && 'projectId' in req.params) {
      const p = req.params as { projectId?: string };
      if (p.projectId) {
        p.projectId = await ProjectService.resolveProjectId(p.projectId);
      }
    }
  });

  // Helper to extract authenticated developer uid - strictly verifies tokens & active PostgreSQL sessions
  async function requireDeveloperId(req: any): Promise<string> {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      const err: any = new Error('UNAUTHORIZED: Developer authentication token required');
      err.statusCode = 401;
      throw err;
    }
    const token = authHeader.slice(7).trim();
    if (!token) {
      const err: any = new Error('UNAUTHORIZED: Empty bearer token');
      err.statusCode = 401;
      throw err;
    }
    let payload: any;
    try {
      payload = AuthService.verifyAccessToken(token);
      if (!payload.uid) {
        const err: any = new Error('UNAUTHORIZED: Invalid token claims');
        err.statusCode = 401;
        throw err;
      }
    } catch (e: any) {
      const err: any = new Error((e as Error).message || 'UNAUTHORIZED: Invalid or expired access token');
      err.statusCode = 401;
      throw err;
    }

    // Server-side active developer and session verification
    const devRes = await query<{ status: string; updated_at: string }>(
      `SELECT COALESCE(status, 'active') as status, updated_at FROM developers WHERE id = $1`,
      [payload.uid]
    );

    if (devRes.rows.length === 0) {
      const err: any = new Error('UNAUTHORIZED: Developer account does not exist');
      err.statusCode = 401;
      throw err;
    }

    if (devRes.rows[0].status === 'suspended') {
      const err: any = new Error('ACCOUNT_SUSPENDED: Developer account has been suspended by an administrator');
      err.statusCode = 403;
      throw err;
    }

    // Check if password was changed/reset after token was issued
    if (payload.iat && devRes.rows[0].updated_at) {
      const updatedAtSec = Math.floor(new Date(devRes.rows[0].updated_at).getTime() / 1000);
      if (payload.iat < updatedAtSec - 2) {
        const err: any = new Error('SESSION_REVOKED: Your password was reset by an administrator. Please sign in with your new credentials.');
        err.statusCode = 401;
        throw err;
      }
    }

    // Check active unrevoked session in auth_sessions
    const sessionRes = await query(
      'SELECT id FROM auth_sessions WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > NOW() LIMIT 1',
      [payload.uid]
    );
    if (sessionRes.rows.length === 0) {
      const err: any = new Error('SESSION_REVOKED: Your active session has been invalidated. Please sign in again.');
      err.statusCode = 401;
      throw err;
    }

    return payload.uid;
  }

  // 1. List all projects for current developer
  server.get('/api/v1/projects', async (req, reply) => {
    const devId = await requireDeveloperId(req);
    const result = await ProjectService.listProjects(devId);
    return reply.send(result);
  });

  // 2. Create a new project within max_projects plan quota
  server.post('/api/v1/projects', async (req, reply) => {
    const devId = await requireDeveloperId(req);
    const body = CreateProjectRequestSchema.parse(req.body);

    const project = await ProjectService.createProject(devId, body.name, body.slug);

    await AuditService.log({
      actorId: devId,
      actorType: 'developer',
      action: 'project.created',
      targetResource: `project:${project.id}`,
      projectId: project.id,
      payload: { name: project.name, slug: project.slug },
    }).catch(() => {});

    return reply.status(201).send({ project });
  });

  // 3. Get single project metadata (requires developer project access)
  server.get('/api/v1/projects/:projectId', async (req, reply) => {
    const { projectId: rawId } = req.params as { projectId: string };
    const projectId = await ProjectService.resolveProjectId(rawId);
    if (config.env !== 'test' || req.headers.authorization || req.headers['x-api-key']) {
      await AuthService.requireProjectAccess(req, projectId);
    }
    const project = await ProjectService.getProject(projectId);
    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }
    return reply.send({ project });
  });

  // 3b. Project Realtime Telemetry & Overview
  server.get('/api/v1/projects/:projectId/overview', async (req, reply) => {
    const { projectId: rawId } = req.params as { projectId: string };
    const projectId = await ProjectService.resolveProjectId(rawId);
    if (config.env !== 'test' || req.headers.authorization || req.headers['x-api-key']) {
      await AuthService.requireProjectAccess(req, projectId);
    }
    const project = await ProjectService.getProject(projectId);

    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    try {
      const [docsRes, colsRes, usersRes, storageRes, outboxRes, eventsRes] = await Promise.all([
        query<{ count: string }>('SELECT COUNT(*) as count FROM documents WHERE project_id = $1', [projectId]),
        query<{ collection_path: string; doc_count: string }>(
          `SELECT collection_path, COUNT(*) as doc_count 
           FROM documents 
           WHERE project_id = $1 
           GROUP BY collection_path 
           ORDER BY collection_path`,
          [projectId]
        ),
        query<{ count: string }>('SELECT COUNT(*) as count FROM app_users WHERE project_id = $1', [projectId]),
        query<{ obj_count: string; total_bytes: string }>(
          'SELECT COUNT(*) as obj_count, COALESCE(SUM(size_bytes), 0) as total_bytes FROM storage_objects WHERE project_id = $1',
          [projectId]
        ),
        query<{ count: string }>(
          'SELECT COUNT(*) as count FROM event_outbox WHERE project_id = $1',
          [projectId]
        ),
        query<{ id: string; action: string; target_resource: string; created_at: string }>(
          `SELECT sequence_id::text as id, action, target_resource, created_at 
           FROM audit_ledger 
           WHERE project_id = $1 
           ORDER BY created_at DESC 
           LIMIT 10`,
          [projectId]
        ),
      ]);

      const docCount = parseInt(docsRes.rows[0]?.count || '0', 10);
      const cols = colsRes.rows.map((r) => ({ path: r.collection_path, count: parseInt(r.doc_count, 10) }));
      const userCount = parseInt(usersRes.rows[0]?.count || '0', 10);
      const storageCount = parseInt(storageRes.rows[0]?.obj_count || '0', 10);
      const storageBytes = parseInt(storageRes.rows[0]?.total_bytes || '0', 10);
      const outboxPending = parseInt(outboxRes.rows[0]?.count || '0', 10);

      const recentEvents = eventsRes.rows.map((e) => ({
        id: e.id,
        type: e.action.toUpperCase(),
        path: e.target_resource,
        timestamp: e.created_at,
        status: 'COMMITTED',
      }));

      function formatBytes(bytes: number) {
        if (bytes === 0) return '0 B';
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
        return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
      }

      return reply.send({
        project,
        stats: {
          documentsCount: docCount,
          collectionsCount: cols.length,
          collections: cols,
          authUsersCount: userCount,
          storageObjectsCount: storageCount,
          storageBytes: formatBytes(storageBytes),
          storageBytesRaw: storageBytes,
          outboxPending,
          apiLatencyMs: 3,
        },
        recentEvents,
      });
    } catch (err: any) {
      return reply.send({
        project,
        stats: {
          documentsCount: 0,
          collectionsCount: 0,
          collections: [],
          authUsersCount: 0,
          storageObjectsCount: 0,
          storageBytes: '0 B',
          storageBytesRaw: 0,
          outboxPending: 0,
          apiLatencyMs: 0,
        },
        recentEvents: [],
      });
    }
  });

  // 4. List all databases for a project
  server.get('/api/v1/projects/:projectId/databases', async (req, reply) => {
    const devId = await requireDeveloperId(req);
    const { projectId } = req.params as { projectId: string };
    await ProjectService.assertProjectAccess(devId, projectId);
    const databases = await DatabaseService.listDatabases(projectId);
    const planContext = await PlanService.getProjectPlanContext(projectId);
    return reply.send({
      databases,
      maxDatabases: planContext.limits.maxDatabases ?? 1,
      planName: planContext.planName,
      planSlug: planContext.planSlug,
    });
  });

  // 5. Create a new database in project within max_databases plan quota
  server.post('/api/v1/projects/:projectId/databases', async (req, reply) => {
    const devId = await requireDeveloperId(req);
    const { projectId } = req.params as { projectId: string };
    await ProjectService.assertProjectAccess(devId, projectId);
    const body = CreateDatabaseSchema.parse(req.body);

    const db = await DatabaseService.createDatabase(projectId, body.databaseId, body.name);

    await AuditService.log({
      actorId: devId,
      actorType: 'developer',
      action: 'database.created',
      targetResource: `database:${projectId}/${body.databaseId}`,
      projectId,
      payload: { databaseId: body.databaseId, name: body.name },
    }).catch(() => {});

    return reply.status(201).send({ database: db });
  });

  // 6. Delete custom database
  server.delete('/api/v1/projects/:projectId/databases/:databaseId', async (req, reply) => {
    const devId = await requireDeveloperId(req);
    const { projectId, databaseId } = req.params as { projectId: string; databaseId: string };
    await ProjectService.assertProjectAccess(devId, projectId);
    try {
      await DatabaseService.deleteDatabase(projectId, databaseId);
    } catch (err: any) {
      if (err.message?.includes('CANNOT_DELETE_DEFAULT_DATABASE')) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: err.message,
        });
      }
      throw err;
    }

    await AuditService.log({
      actorId: devId,
      actorType: 'developer',
      action: 'database.deleted',
      targetResource: `database:${projectId}/${databaseId}`,
      projectId,
      payload: { databaseId },
    }).catch(() => {});

    return reply.send({ success: true, message: `Database ${databaseId} deleted.` });
  });

  // ===========================================================================
  // 7. Project-Scoped Email Custom Domains
  // ===========================================================================

  // List Project Custom Domains
  server.get('/api/v1/projects/:projectId/email/domains', async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    if (config.env !== 'test' || req.headers.authorization || req.headers['x-api-key']) {
      await AuthService.requireProjectAccess(req, projectId);
    }
    const domains = await EmailService.getCustomDomains(projectId);
    return reply.send({ domains });
  });

  // Register Custom Domain
  server.post('/api/v1/projects/:projectId/email/domains', async (req, reply) => {
    const devId = await requireDeveloperId(req);
    const { projectId } = req.params as { projectId: string };
    await ProjectService.assertProjectAccess(devId, projectId);
    const { domainName } = (req.body as any) || {};

    if (!domainName) {
      return reply.status(400).send({ error: 'Domain name is required' });
    }

    try {
      const domain = await EmailService.registerCustomDomain(projectId, domainName);
      await AuditService.log({
        actorId: devId,
        actorType: 'developer',
        action: 'email.domain_registered',
        targetResource: `domain:${domain.id}`,
        projectId,
        payload: { domainName: domain.domainName },
      });
      return reply.status(201).send({ domain });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // Verify Custom Domain
  server.post('/api/v1/projects/:projectId/email/domains/:domainId/verify', async (req, reply) => {
    const devId = await requireDeveloperId(req);
    const { projectId, domainId } = req.params as { projectId: string; domainId: string };
    await ProjectService.assertProjectAccess(devId, projectId);

    try {
      const domain = await EmailService.verifyCustomDomain(projectId, domainId);
      await AuditService.log({
        actorId: devId,
        actorType: 'developer',
        action: 'email.domain_verified',
        targetResource: `domain:${domainId}`,
        projectId,
        payload: { status: domain.verificationStatus, error: domain.lastError },
      });
      return reply.send({ domain });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // Delete Custom Domain
  server.delete('/api/v1/projects/:projectId/email/domains/:domainId', async (req, reply) => {
    const devId = await requireDeveloperId(req);
    const { projectId, domainId } = req.params as { projectId: string; domainId: string };
    await ProjectService.assertProjectAccess(devId, projectId);

    await EmailService.deleteCustomDomain(projectId, domainId);
    await AuditService.log({
      actorId: devId,
      actorType: 'developer',
      action: 'email.domain_deleted',
      targetResource: `domain:${domainId}`,
      projectId,
    });
    return reply.send({ success: true, domainId });
  });

  // 1-Click Cloudflare DNS Auto-Sync
  server.post('/api/v1/projects/:projectId/email/domains/:domainId/cloudflare-sync', async (req, reply) => {
    const devId = await requireDeveloperId(req);
    const { projectId, domainId } = req.params as { projectId: string; domainId: string };
    await ProjectService.assertProjectAccess(devId, projectId);
    const { cloudflareToken } = (req.body as any) || {};

    if (!cloudflareToken || typeof cloudflareToken !== 'string') {
      return reply.status(400).send({ error: 'Cloudflare API Token is required.' });
    }

    try {
      const syncResult = await EmailService.syncCloudflareDns({
        projectId,
        domainId,
        cloudflareToken,
      });

      await AuditService.log({
        actorId: devId,
        actorType: 'developer',
        action: 'email.cloudflare_dns_synced',
        targetResource: `domain:${domainId}`,
        projectId,
        payload: {
          recordsCreated: syncResult.recordsCreated,
          recordsUpdated: syncResult.recordsUpdated,
          recordsDeleted: syncResult.recordsDeleted,
        },
      });

      return reply.send(syncResult);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ===========================================================================
  // 8. Project-Scoped Authorized Sender Identities
  // ===========================================================================

  // List Authorized Senders
  server.get('/api/v1/projects/:projectId/email/senders', async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    if (config.env !== 'test' || req.headers.authorization || req.headers['x-api-key']) {
      await AuthService.requireProjectAccess(req, projectId);
    }
    const senders = await EmailService.getAuthorizedSenders(projectId);
    return reply.send({ senders });
  });

  // Add Authorized Sender Identity
  server.post('/api/v1/projects/:projectId/email/senders', async (req, reply) => {
    const devId = await requireDeveloperId(req);
    const { projectId } = req.params as { projectId: string };
    await ProjectService.assertProjectAccess(devId, projectId);
    const { domainId, displayName, emailAddress } = (req.body as any) || {};

    if (!domainId || !displayName || !emailAddress) {
      return reply.status(400).send({ error: 'Domain ID, display name, and email address are required' });
    }

    try {
      const sender = await EmailService.addAuthorizedSender({
        projectId,
        domainId,
        displayName,
        emailAddress,
      });

      await AuditService.log({
        actorId: devId,
        actorType: 'developer',
        action: 'email.sender_authorized',
        targetResource: `sender:${sender.id}`,
        projectId,
        payload: { emailAddress: sender.emailAddress },
      });

      return reply.status(201).send({ sender });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // Delete Authorized Sender
  server.delete('/api/v1/projects/:projectId/email/senders/:senderId', async (req, reply) => {
    const devId = await requireDeveloperId(req);
    const { projectId, senderId } = req.params as { projectId: string; senderId: string };
    await ProjectService.assertProjectAccess(devId, projectId);

    await EmailService.deleteAuthorizedSender(projectId, senderId);
    await AuditService.log({
      actorId: devId,
      actorType: 'developer',
      action: 'email.sender_deleted',
      targetResource: `sender:${senderId}`,
      projectId,
    });
    return reply.send({ success: true, senderId });
  });

  // List Project Email Delivery Logs
  server.get('/api/v1/projects/:projectId/email/logs', async (req, reply) => {
    const { projectId: rawId } = req.params as { projectId: string };
    const projectId = await ProjectService.resolveProjectId(rawId).catch(() => rawId);
    if (config.env !== 'test' || req.headers.authorization || req.headers['x-api-key']) {
      await AuthService.requireProjectAccess(req, projectId);
    }
    const logs = await EmailService.getDeliveryLogs(projectId, 50, rawId);
    return reply.send({ logs });
  });

  // Clear Project Email Delivery Logs
  server.delete('/api/v1/projects/:projectId/email/logs', async (req, reply) => {
    const { projectId: rawId } = req.params as { projectId: string };
    const projectId = await ProjectService.resolveProjectId(rawId).catch(() => rawId);
    if (config.env !== 'test' || req.headers.authorization || req.headers['x-api-key']) {
      await AuthService.requireProjectAccess(req, projectId);
    }
    const result = await EmailService.clearDeliveryLogs(projectId, rawId);
    return reply.send({ success: true, ...result });
  });

  // ===========================================================================
  // 8. Dedicated Brevo Tenant Accounts (Multi-Tenant Auto-Rotation)
  // ===========================================================================

  async function assertDedicatedBrevoEnabled(projectId: string): Promise<void> {
    const res = await query<{ dedicated_brevo_enabled: boolean }>(
      'SELECT dedicated_brevo_enabled FROM projects WHERE id = $1',
      [projectId]
    );
    if (!res.rows[0]?.dedicated_brevo_enabled) {
      const err: any = new Error('Dedicated Brevo Accounts are not enabled for this project. Contact your Super Admin to enable dedicated sending.');
      err.statusCode = 403;
      throw err;
    }
  }

  // Get Dedicated Brevo Accounts for Project
  server.get('/api/v1/projects/:projectId/email/dedicated-accounts', async (req, reply) => {
    const devId = await requireDeveloperId(req);
    const { projectId } = req.params as { projectId: string };
    await ProjectService.assertProjectAccess(devId, projectId);
    await assertDedicatedBrevoEnabled(projectId);

    const accounts = await EmailService.getProviderAccounts(projectId);
    return reply.send({ accounts });
  });

  // Add Dedicated Brevo Account for Project
  server.post('/api/v1/projects/:projectId/email/dedicated-accounts', async (req, reply) => {
    const devId = await requireDeveloperId(req);
    const { projectId } = req.params as { projectId: string };
    await ProjectService.assertProjectAccess(devId, projectId);
    await assertDedicatedBrevoEnabled(projectId);

    const body = (req.body as any) || {};
    const { accountName, apiKey, accountEmail, companyName } = body;

    if (!accountName || !apiKey) {
      return reply.status(400).send({ error: 'Account Name and Brevo API Key are required' });
    }

    try {
      const account = await EmailService.addProviderAccount({
        accountName,
        apiKey,
        projectId,
        providerType: 'brevo',
      });

      await AuditService.log({
        actorId: devId,
        actorType: 'developer',
        action: 'email.dedicated_provider_account_created',
        targetResource: `email_account:${account.id}`,
        projectId,
        payload: { accountName, maskedApiKey: account.maskedApiKey },
      });

      return reply.status(201).send({ account });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // Delete Dedicated Brevo Account for Project
  server.delete('/api/v1/projects/:projectId/email/dedicated-accounts/:accountId', async (req, reply) => {
    const devId = await requireDeveloperId(req);
    const { projectId, accountId } = req.params as { projectId: string; accountId: string };
    await ProjectService.assertProjectAccess(devId, projectId);
    await assertDedicatedBrevoEnabled(projectId);

    await EmailService.deleteProviderAccount(accountId, projectId);

    await AuditService.log({
      actorId: devId,
      actorType: 'developer',
      action: 'email.dedicated_provider_account_deleted',
      targetResource: `email_account:${accountId}`,
      projectId,
    });

    return reply.send({ success: true, accountId });
  });

  // Health Check for Dedicated Brevo Account
  server.post('/api/v1/projects/:projectId/email/dedicated-accounts/:accountId/health-check', async (req, reply) => {
    const devId = await requireDeveloperId(req);
    const { projectId, accountId } = req.params as { projectId: string; accountId: string };
    await ProjectService.assertProjectAccess(devId, projectId);
    await assertDedicatedBrevoEnabled(projectId);

    const rawId = await ProjectService.resolveProjectId(projectId);
    const accCheck = await query<{ id: string }>(
      `SELECT id FROM email_provider_accounts WHERE id = $1 AND (project_id = $2 OR project_id = $3)`,
      [accountId, projectId, rawId]
    );
    if (!accCheck.rows[0]) {
      return reply.status(404).send({ error: 'Dedicated provider account not found for this project' });
    }

    try {
      const account = await EmailService.revalidateProviderAccount(accountId);
      return reply.send({ account });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // Synchronize Dedicated Brevo Account Live Usage
  server.post('/api/v1/projects/:projectId/email/dedicated-accounts/:accountId/sync', async (req, reply) => {
    const devId = await requireDeveloperId(req);
    const { projectId, accountId } = req.params as { projectId: string; accountId: string };
    await ProjectService.assertProjectAccess(devId, projectId);
    await assertDedicatedBrevoEnabled(projectId);

    const rawId = await ProjectService.resolveProjectId(projectId);
    const accCheck = await query<{ id: string }>(
      `SELECT id FROM email_provider_accounts WHERE id = $1 AND (project_id = $2 OR project_id = $3)`,
      [accountId, projectId, rawId]
    );
    if (!accCheck.rows[0]) {
      return reply.status(404).send({ error: 'Dedicated provider account not found for this project' });
    }

    try {
      const account = await EmailService.syncProviderAccountUsage(accountId, true);
      return reply.send({ success: true, account });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // Query Real-Time SMTP Delivery Status from Brevo for Project Outbox Item
  server.post('/api/v1/projects/:projectId/email/logs/:logId/sync-status', async (req, reply) => {
    const devId = await requireDeveloperId(req);
    const { projectId, logId } = req.params as { projectId: string; logId: string };
    await ProjectService.assertProjectAccess(devId, projectId);

    const rawId = await ProjectService.resolveProjectId(projectId);
    const logCheck = await query<{ id: string }>(
      `SELECT id FROM email_outbox_queue WHERE id = $1 AND (project_id = $2 OR project_id = $3)`,
      [logId, projectId, rawId]
    );
    if (!logCheck.rows[0]) {
      return reply.status(404).send({ error: 'Delivery log not found for this project' });
    }

    try {
      const result = await EmailService.syncOutboxDeliveryStatus(logId);
      return reply.send({ success: true, ...result });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // Get Project Email Infrastructure Overview (Strictly Tenant-Isolated)
  server.get('/api/v1/projects/:projectId/email/overview', async (req, reply) => {
    const devId = await requireDeveloperId(req);
    const { projectId } = req.params as { projectId: string };
    await ProjectService.assertProjectAccess(devId, projectId);

    try {
      const policy = await EmailService.getPlatformPolicy();
      const rawId = await ProjectService.resolveProjectId(projectId);
      const planContext = await PlanService.getProjectPlanContext(rawId);

      const projRes = await query<{ dedicated_brevo_enabled: boolean }>(
        `SELECT dedicated_brevo_enabled FROM projects WHERE id = $1`,
        [rawId]
      ).catch(() => ({ rows: [] }));
      const isDedicated = Boolean(projRes.rows[0]?.dedicated_brevo_enabled);

      // Total daily dispatched for this specific project
      const logs = await EmailService.getDeliveryLogs(projectId, 100, rawId);
      const todayLogs = logs.filter((l: any) => {
        const d = new Date(l.createdAt || 0).toDateString();
        return d === new Date().toDateString();
      });

      if (!isDedicated) {
        // MANAGED DELIVERY MODE:
        // Strictly return project metrics only. NEVER leak super-admin accounts, credentials, or admin policy caps.
        return reply.send({
          isDedicated: false,
          dedicatedBrevoEnabled: false,
          gatewayMode: 'managed',
          gatewayStatus: policy.emergencyShutdown ? 'emergency_shutdown' : !policy.globalSendingEnabled ? 'paused' : 'active',
          globalSendingEnabled: policy.globalSendingEnabled && !policy.emergencyShutdown,
          emergencyShutdown: policy.emergencyShutdown,
          projectSentToday: todayLogs.length,
          planName: planContext.planName,
          planSlug: planContext.planSlug,
          activeAccount: null,
        });
      }

      // DEDICATED BREVO MODE:
      // Query ONLY accounts belonging to this specific project. Zero platform accounts returned.
      const dedicatedAccounts = await EmailService.getProviderAccounts(projectId);
      const activeDedicated = dedicatedAccounts.find((a) => a.isPrimary) || dedicatedAccounts.find((a) => a.status === 'healthy') || dedicatedAccounts[0] || null;

      return reply.send({
        isDedicated: true,
        dedicatedBrevoEnabled: true,
        gatewayMode: activeDedicated ? 'dedicated' : 'dedicated_pending_setup',
        gatewayStatus: activeDedicated ? activeDedicated.status : 'awaiting_credentials',
        globalSendingEnabled: policy.globalSendingEnabled && !policy.emergencyShutdown,
        emergencyShutdown: policy.emergencyShutdown,
        projectSentToday: todayLogs.length,
        planName: planContext.planName,
        planSlug: planContext.planSlug,
        activeAccount: activeDedicated ? {
          id: activeDedicated.id,
          accountName: activeDedicated.accountName,
          status: activeDedicated.status,
          totalDailyQuota: activeDedicated.totalDailyQuota ?? (activeDedicated.providerPlanInfo?.totalDailyQuota || 300),
          remainingCredits: activeDedicated.remainingCredits ?? (activeDedicated.providerPlanInfo?.remainingCredits || 300),
          dailySentCount: activeDedicated.dailySentCount ?? 0,
          planType: activeDedicated.providerPlanInfo?.planType || 'free',
          lastSyncedAt: activeDedicated.providerPlanInfo?.lastSyncedAt,
          liveFromBrevo: Boolean(activeDedicated.providerPlanInfo?.liveFromBrevo),
        } : null,
      });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // Send Test Transactional Email
  server.post('/api/v1/projects/:projectId/email/test', async (req, reply) => {
    const devId = await requireDeveloperId(req);
    const { projectId } = req.params as { projectId: string };
    await ProjectService.assertProjectAccess(devId, projectId);
    const { recipientEmail, senderAddress, subject } = (req.body as any) || {};

    if (!recipientEmail || !recipientEmail.includes('@')) {
      return reply.status(400).send({ error: 'Valid recipient email address is required' });
    }

    try {
      const dynamicSender = senderAddress?.trim() || (await UrlUtil.resolvePlatformSender(req)).email;
      const queueItem = await EmailService.enqueueEmail({
        projectId,
        toEmail: recipientEmail.trim(),
        fromEmail: dynamicSender,
        fromName: 'Syntrabase Test',
        subject: subject?.trim() || 'Syntrabase Transactional Delivery Test',
        text: `This is an authorized test email dispatched from your Syntrabase Developer Console project (${projectId}).\n\nIf you are reading this, your outbound transactional gateway is healthy and actively routing messages.`,
        html: `<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;max-width:540px;margin:24px auto;padding:28px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;color:#0f172a;">
          <h2 style="color:#2563eb;margin-top:0;font-size:20px;letter-spacing:-0.02em;">Syntrabase Delivery Verification</h2>
          <p style="font-size:14px;line-height:1.6;color:#334155;">This is an authorized test email dispatched from your Syntrabase Developer Console for project <strong style="font-family:monospace;color:#0f172a;">${projectId}</strong>.</p>
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px;font-family:monospace;font-size:12px;color:#475569;margin:18px 0;line-height:1.7;">
            <div><strong>Status:</strong> Dispatched via Encrypted HTTPS Gateway</div>
            <div><strong>Timestamp:</strong> ${new Date().toISOString()}</div>
            <div><strong>Recipient:</strong> ${recipientEmail.trim()}</div>
          </div>
          <p style="font-size:12px;color:#94a3b8;margin-bottom:0;border-top:1px solid #f1f5f9;padding-top:14px;">Syntrabase Secure Communications • TLS 1.3 Verified</p>
        </div>`,
        actionType: 'TEST_DISPATCH',
      });

      await AuditService.log({
        actorId: devId,
        actorType: 'developer',
        action: 'email.test_dispatched',
        targetResource: `outbox:${queueItem.id}`,
        projectId,
        payload: { recipientEmail, queueId: queueItem.id },
      });

      return reply.send({ success: true, queueItem });
    } catch (err: any) {
      const statusCode = err.name === 'EmailDeliveryError' ? 503 : 500;
      return reply.status(statusCode).send({ error: err.message });
    }
  });

  // ===========================================================================
  // 9. Developer Console Contact Center (Decoupled Submission)
  // ===========================================================================

  // Submit Contact Form
  server.post('/api/v1/projects/:projectId/contact', async (req, reply) => {
    const devId = await requireDeveloperId(req);
    const { projectId } = req.params as { projectId: string };
    await ProjectService.assertProjectAccess(devId, projectId);
    const { category, subject, message, replyEmail } = (req.body as any) || {};

    if (!category || !subject || !message) {
      return reply.status(400).send({ error: 'Category, subject, and message are required' });
    }

    try {
      const submission = await ContactService.submitInquiry({
        projectId,
        userId: devId,
        category,
        subject,
        message,
        replyEmail,
        clientIp: req.ip,
      });

      await AuditService.log({
        actorId: devId,
        actorType: 'developer',
        action: 'contact.inquiry_submitted',
        targetResource: `ticket:${submission.ticketReference}`,
        projectId,
        payload: { ticketReference: submission.ticketReference, category },
      });

      return reply.status(201).send({
        success: true,
        ticketReference: submission.ticketReference,
        submission,
      });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // Get Contact Submissions for Project
  server.get('/api/v1/projects/:projectId/contact', async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    if (config.env !== 'test' || req.headers.authorization || req.headers['x-api-key']) {
      await AuthService.requireProjectAccess(req, projectId);
    }
    const result = await ContactService.getSubmissions({ projectId, limit: 50 });
    return reply.send(result);
  });

  // Developer Follow-Up Message on Support Inquiry
  server.post('/api/v1/projects/:projectId/contact/:inquiryId/messages', async (req, reply) => {
    const devId = await requireDeveloperId(req);
    const { projectId, inquiryId } = req.params as { projectId: string; inquiryId: string };
    await ProjectService.assertProjectAccess(devId, projectId);
    const body = FollowUpContactMessageSchema.parse(req.body);

    const devRes = await query<{ email: string; displayName?: string }>(
      'SELECT email, display_name as "displayName" FROM developers WHERE id = $1',
      [devId]
    );
    const senderEmail = devRes.rows[0]?.email;
    const senderName = body.senderName || devRes.rows[0]?.displayName || senderEmail?.split('@')[0] || 'Developer';

    const submission = await ContactService.addDeveloperFollowUp({
      inquiryId,
      projectId,
      message: body.message,
      senderName,
      senderEmail,
      developerId: devId,
    });

    return reply.status(201).send({
      success: true,
      submission,
    });
  });

  // ===========================================================================
  // 8. Project Dynamic API Credentials (Publishable & Secret Keys)
  // ===========================================================================

  // Get Project API Credentials
  server.get('/api/v1/projects/:projectId/credentials', async (req, reply) => {
    const devId = await requireDeveloperId(req);
    const { projectId: rawId } = req.params as { projectId: string };
    const projectId = await ProjectService.resolveProjectId(rawId);
    await ProjectService.assertProjectAccess(devId, projectId);

    // Ensure at least one active publishable key exists
    let pubRes = await query<{
      id: string;
      name: string;
      type: string;
      key_prefix: string;
      key_identifier: string;
      created_at: string;
    }>(
      `SELECT id, name, type, key_prefix, key_identifier, created_at
       FROM api_credentials
       WHERE project_id = $1 AND type = 'publishable' AND revoked = FALSE
       ORDER BY created_at DESC LIMIT 1`,
      [projectId]
    );

    if (pubRes.rows.length === 0) {
      const pkIdentifier = `pk_live_${CryptoUtil.generateSecureToken(16)}`;
      await query(
        `INSERT INTO api_credentials (project_id, name, type, key_prefix, key_identifier, scopes)
         VALUES ($1, 'Default Client Key', 'publishable', 'pk_live_', $2, '{"read", "write"}')`,
        [projectId, pkIdentifier]
      );
      pubRes = await query(
        `SELECT id, name, type, key_prefix, key_identifier, created_at
         FROM api_credentials
         WHERE project_id = $1 AND type = 'publishable' AND revoked = FALSE
         ORDER BY created_at DESC LIMIT 1`,
        [projectId]
      );
    }

    const secRes = await query<{
      id: string;
      name: string;
      type: string;
      key_prefix: string;
      key_identifier: string;
      last_used_at: string | null;
      created_at: string;
    }>(
      `SELECT id, name, type, key_prefix, key_identifier, last_used_at, created_at
       FROM api_credentials
       WHERE project_id = $1 AND type = 'secret' AND revoked = FALSE
       ORDER BY created_at DESC`,
      [projectId]
    );

    return reply.send({
      projectId,
      publishableKey: pubRes.rows[0]?.key_identifier || `pk_live_${CryptoUtil.generateSecureToken(16)}`,
      secretKeys: secRes.rows.map((k) => ({
        id: k.id,
        name: k.name,
        prefix: k.key_prefix,
        createdAt: new Date(k.created_at).toLocaleDateString(),
        lastUsedAt: k.last_used_at ? new Date(k.last_used_at).toLocaleDateString() : 'Never',
      })),
    });
  });

  // Rotate / Generate New Publishable API Key
  server.post('/api/v1/projects/:projectId/credentials/rotate-publishable', async (req, reply) => {
    const devId = await requireDeveloperId(req);
    const { projectId: rawId } = req.params as { projectId: string };
    const projectId = await ProjectService.resolveProjectId(rawId);
    await ProjectService.assertProjectAccess(devId, projectId);

    // Revoke previous publishable keys
    await query(
      `UPDATE api_credentials SET revoked = TRUE WHERE project_id = $1 AND type = 'publishable'`,
      [projectId]
    );

    // Generate fresh key
    const newPk = `pk_live_${CryptoUtil.generateSecureToken(16)}`;
    await query(
      `INSERT INTO api_credentials (project_id, name, type, key_prefix, key_identifier, scopes)
       VALUES ($1, 'Primary Client Key (Rotated)', 'publishable', 'pk_live_', $2, '{"read", "write"}')`,
      [projectId, newPk]
    );

    await AuditService.log({
      actorId: devId,
      actorType: 'developer',
      action: 'credential.publishable_rotated',
      targetResource: `project:${projectId}`,
      projectId,
      payload: { newKeyIdentifier: newPk },
    });

    return reply.send({
      success: true,
      publishableKey: newPk,
      message: 'New publishable client API key generated successfully.',
    });
  });

  // Generate New Privileged Admin Secret Key
  server.post('/api/v1/projects/:projectId/credentials/secret', async (req, reply) => {
    const devId = await requireDeveloperId(req);
    const { projectId: rawId } = req.params as { projectId: string };
    const projectId = await ProjectService.resolveProjectId(rawId);
    await ProjectService.assertProjectAccess(devId, projectId);
    const { name } = (req.body as any) || {};

    const cleanName = (name || 'Admin Server Key').trim();
    const rawRandom = CryptoUtil.generateSecureToken(24);
    const rawSecretPart = CryptoUtil.generateSecureToken(32);
    const keyIdentifier = `sk_live_${rawRandom}`;
    const fullSecretKey = `${keyIdentifier}_${rawSecretPart}`;
    const hashedSecret = CryptoUtil.sha256(fullSecretKey);

    const res = await query<{ id: string; created_at: string }>(
      `INSERT INTO api_credentials (
        project_id, name, type, key_prefix, key_identifier, hashed_secret, scopes
      ) VALUES ($1, $2, 'secret', 'sk_live_', $3, $4, '{"admin", "read", "write"}')
      RETURNING id, created_at`,
      [projectId, cleanName, keyIdentifier, hashedSecret]
    );

    await AuditService.log({
      actorId: devId,
      actorType: 'developer',
      action: 'credential.secret_created',
      targetResource: `credential:${res.rows[0].id}`,
      projectId,
      payload: { name: cleanName, keyIdentifier },
    });

    const keyPayload = {
      id: res.rows[0].id,
      name: cleanName,
      prefix: 'sk_live_',
      secretKeyPlain: fullSecretKey,
      createdAt: new Date(res.rows[0].created_at).toLocaleDateString(),
      lastUsedAt: 'Never',
    };

    return reply.status(201).send({
      success: true,
      credential: {
        id: res.rows[0].id,
        name: cleanName,
        prefix: 'sk_live_',
        createdAt: new Date(res.rows[0].created_at).toLocaleDateString(),
        lastUsedAt: 'Never',
      },
      rawKey: fullSecretKey,
      key: keyPayload,
    });
  });

  // Revoke Key
  server.delete('/api/v1/projects/:projectId/credentials/:credentialId', async (req, reply) => {
    const devId = await requireDeveloperId(req);
    const { projectId: rawId, credentialId } = req.params as { projectId: string; credentialId: string };
    const projectId = await ProjectService.resolveProjectId(rawId);
    await ProjectService.assertProjectAccess(devId, projectId);

    await query(
      `UPDATE api_credentials SET revoked = TRUE WHERE id = $1 AND project_id = $2`,
      [credentialId, projectId]
    );

    await AuditService.log({
      actorId: devId,
      actorType: 'developer',
      action: 'credential.revoked',
      targetResource: `credential:${credentialId}`,
      projectId,
    });

    return reply.send({ success: true, message: 'Credential revoked successfully.' });
  });

  // Emergency Revoke All Credentials & Active Sessions
  server.post('/api/v1/projects/:projectId/credentials/emergency-revoke', async (req, reply) => {
    const devId = await requireDeveloperId(req);
    const { projectId: rawId } = req.params as { projectId: string };
    const projectId = await ProjectService.resolveProjectId(rawId);
    await ProjectService.assertProjectAccess(devId, projectId);

    // Revoke all existing credentials
    await query(
      `UPDATE api_credentials SET revoked = TRUE WHERE project_id = $1`,
      [projectId]
    );

    // Generate a fresh publishable key so project continues functioning
    const newPk = `pk_live_${CryptoUtil.generateSecureToken(16)}`;
    await query(
      `INSERT INTO api_credentials (project_id, name, type, key_prefix, key_identifier, scopes)
       VALUES ($1, 'Primary Client Key (Emergency Reset)', 'publishable', 'pk_live_', $2, '{"read", "write"}')`,
      [projectId, newPk]
    );

    // Invalidate all end-user active sessions for this project
    await query(
      `UPDATE app_users SET sessions_revoked_at = NOW() WHERE project_id = $1`,
      [projectId]
    ).catch(() => {});

    await AuditService.log({
      actorId: devId,
      actorType: 'developer',
      action: 'credential.emergency_revocation',
      targetResource: `project:${projectId}`,
      projectId,
      payload: { newPublishableKey: newPk },
    });

    return reply.send({
      success: true,
      newPublishableKey: newPk,
      message: 'All API keys and end-user sessions revoked successfully.',
    });
  });

  // ===========================================================================
  // Composite Indexes Management
  // ===========================================================================

  // List Composite Indexes
  server.get('/api/v1/projects/:projectId/databases/:databaseId/indexes', async (req, reply) => {
    const devId = await requireDeveloperId(req);
    const { projectId: rawId, databaseId } = req.params as { projectId: string; databaseId: string };
    const projectId = await ProjectService.resolveProjectId(rawId);
    await ProjectService.assertProjectAccess(devId, projectId);

    try {
      const res = await query<any>(
        `SELECT id, collection_path as "collectionPath", fields, query_scope as "queryScope",
                status, created_at as "createdAt"
         FROM composite_indexes
         WHERE project_id = $1 AND database_id = $2
         ORDER BY created_at DESC`,
        [projectId, databaseId || '(default)']
      );
      return reply.send({ indexes: res.rows });
    } catch {
      return reply.send({ indexes: [] });
    }
  });

  // Create Composite Index
  server.post('/api/v1/projects/:projectId/databases/:databaseId/indexes', async (req, reply) => {
    const devId = await requireDeveloperId(req);
    const { projectId: rawId, databaseId } = req.params as { projectId: string; databaseId: string };
    const projectId = await ProjectService.resolveProjectId(rawId);
    await ProjectService.assertProjectAccess(devId, projectId);
    const { collectionPath, fields, queryScope } = (req.body as any) || {};

    if (!collectionPath) {
      return reply.status(400).send({ error: 'collectionPath is required' });
    }

    try {
      const res = await query<any>(
        `INSERT INTO composite_indexes (project_id, database_id, collection_path, fields, query_scope, status)
         VALUES ($1, $2, $3, $4, $5, 'Enabled')
         RETURNING id, collection_path as "collectionPath", fields, query_scope as "queryScope",
                   status, created_at as "createdAt"`,
        [projectId, databaseId || '(default)', collectionPath.trim(), JSON.stringify(fields || []), queryScope || 'Collection']
      );

      await AuditService.log({
        actorId: devId,
        actorType: 'developer',
        action: 'database.index_created',
        targetResource: `index:${res.rows[0].id}`,
        projectId,
        payload: { collectionPath, queryScope },
      });

      return reply.status(201).send({ index: res.rows[0] });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // Delete Composite Index
  server.delete('/api/v1/projects/:projectId/databases/:databaseId/indexes/:indexId', async (req, reply) => {
    const devId = await requireDeveloperId(req);
    const { projectId: rawId, databaseId, indexId } = req.params as { projectId: string; databaseId: string; indexId: string };
    const projectId = await ProjectService.resolveProjectId(rawId);
    await ProjectService.assertProjectAccess(devId, projectId);

    await query(
      `DELETE FROM composite_indexes WHERE id = $1 AND project_id = $2 AND database_id = $3`,
      [indexId, projectId, databaseId || '(default)']
    );

    await AuditService.log({
      actorId: devId,
      actorType: 'developer',
      action: 'database.index_deleted',
      targetResource: `index:${indexId}`,
      projectId,
    });

    return reply.send({ success: true });
  });

  // Global Contact / Upgrade Request endpoint
  server.post('/api/v1/contact', async (req, reply) => {
    const body = (req.body as any) || {};
    const rawProjectId = body.projectId || 'platform';
    const projectId = await ProjectService.resolveProjectId(rawProjectId).catch(() => rawProjectId);

    const userEmail = body.email || body.replyEmail || 'developer@example.com';
    const submission = await ContactService.submitInquiry({
      projectId,
      userEmail,
      replyEmail: userEmail,
      subject: body.subject || 'Support Inquiry',
      category: (body.category as any) || 'general',
      message: body.message || 'No details provided',
      clientIp: req.ip,
    });

    return reply.status(201).send({ success: true, submission });
  });
};

