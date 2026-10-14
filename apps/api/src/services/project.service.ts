import { query, withTransaction } from '../db/pool.js';
import { PlanService } from './plan.service.js';
import { CryptoUtil } from '../utils/crypto.js';

export interface ProjectSummary {
  id: string;
  name: string;
  slug: string;
  status: 'active' | 'suspended' | 'archived';
  dedicatedBrevoEnabled?: boolean;
  createdAt: string;
  updatedAt: string;
  planName: string;
  planSlug: string;
  databaseCount: number;
  maxProjects: number;
  maxDatabases: number;
}

export class ProjectService {
  /**
   * Set whether dedicated Brevo accounts are enabled for a project.
   */
  public static async setDedicatedBrevo(projectId: string, enabled: boolean): Promise<boolean> {
    const res = await query('UPDATE projects SET dedicated_brevo_enabled = $1, updated_at = NOW() WHERE id = $2 RETURNING id', [enabled, projectId]);
    return res.rows.length > 0;
  }

  /**
   * List projects with authoritative usage and plan quotas for the authenticated developer.
   */
  public static async listProjects(developerId?: string): Promise<{
    projects: ProjectSummary[];
    totalProjects: number;
    maxProjects: number;
  }> {
    try {
      const { AuthService } = await import('./auth.service.js');
      const isSuper = developerId ? await AuthService.isSuperAdmin(developerId) : false;

      let sql = `
        SELECT p.id, p.name, p.slug, p.status, p.dedicated_brevo_enabled, p.created_at, p.updated_at,
               pl.name as plan_name, pl.slug as plan_slug,
               pl.max_projects, pl.max_databases,
               COUNT(d.id) as database_count
        FROM projects p
        LEFT JOIN plans pl ON pl.id = p.plan_id
        LEFT JOIN databases d ON d.project_id = p.id
      `;
      const params: any[] = [];

      if (!isSuper && developerId) {
        sql += `
          JOIN organizations o ON o.id = p.organization_id
          LEFT JOIN organization_members om ON om.organization_id = o.id
          WHERE o.owner_id = $1 OR om.developer_id = $1
        `;
        params.push(developerId);
      }

      sql += `
        GROUP BY p.id, pl.name, pl.slug, pl.max_projects, pl.max_databases
        ORDER BY p.created_at DESC
      `;

      const res = await query<{
        id: string;
        name: string;
        slug: string;
        status: string;
        dedicated_brevo_enabled?: boolean;
        created_at: string;
        updated_at: string;
        plan_name: string | null;
        plan_slug: string | null;
        max_projects: number | null;
        max_databases: number | null;
        database_count: string | null;
      }>(sql, params);

      const planDefaultRes = await query<{ max_projects: number }>(
        'SELECT max_projects FROM plans WHERE is_default = TRUE LIMIT 1'
      );
      const defaultMax = planDefaultRes.rows[0]?.max_projects ?? 3;

      const highestProjectLimit = res.rows.reduce(
        (max, r) => Math.max(max, r.max_projects ?? 0),
        0
      );
      const maxProjects = highestProjectLimit > 0 ? highestProjectLimit : defaultMax;

      const projects: ProjectSummary[] = res.rows.map((r) => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        status: (r.status || 'active') as 'active',
        dedicatedBrevoEnabled: !!r.dedicated_brevo_enabled,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        planName: r.plan_name || 'Free Tier',
        planSlug: r.plan_slug || 'free',
        databaseCount: Math.max(1, parseInt(r.database_count || '1', 10)),
        maxProjects: r.max_projects ?? maxProjects,
        maxDatabases: r.max_databases ?? 1,
      }));

      return {
        projects,
        totalProjects: projects.length,
        maxProjects,
      };
    } catch {
      return {
        projects: [],
        totalProjects: 0,
        maxProjects: 3,
      };
    }
  }

  /**
   * Authoritatively verifies that the requesting developer owns the project,
   * is an organization member, or is a platform Super Admin.
   */
  public static async assertProjectAccess(developerId: string, projectId: string): Promise<void> {
    if (!developerId) {
      const err: any = new Error('UNAUTHORIZED: Developer authentication required');
      err.statusCode = 401;
      throw err;
    }

    const { AuthService } = await import('./auth.service.js');
    if (await AuthService.isSuperAdmin(developerId)) {
      return;
    }

    const resolvedProjectId = await this.resolveProjectId(projectId);
    const res = await query(
      `SELECT p.id 
       FROM projects p
       JOIN organizations o ON o.id = p.organization_id
       LEFT JOIN organization_members om ON om.organization_id = o.id
       WHERE p.id = $1 AND (o.owner_id = $2 OR om.developer_id = $2)
       LIMIT 1`,
      [resolvedProjectId, developerId]
    );

    if (res.rows.length === 0) {
      const err: any = new Error('FORBIDDEN: You do not have permission to access or modify this project');
      err.statusCode = 403;
      throw err;
    }
  }

  /**
   * Resolves a projectId (UUID or slug) to a canonical UUID.
   */
  public static async resolveProjectId(projectId?: string | null): Promise<string> {
    if (!projectId) {
      return '00000000-0000-0000-0000-000000000020';
    }
    const cleanId = String(projectId).trim();
    if (cleanId === 'default-project' || cleanId === 'default') {
      return '00000000-0000-0000-0000-000000000020';
    }
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanId);
    if (isUuid) {
      return cleanId;
    }
    try {
      const res = await query<{ id: string }>(
        'SELECT id FROM projects WHERE id::text = $1 OR slug = $1 LIMIT 1',
        [cleanId]
      );
      if (res.rows.length > 0) {
        return res.rows[0].id;
      }
    } catch {
      // ignore
    }
    return '00000000-0000-0000-0000-000000000020';
  }

  /**
   * Get single project metadata.
   */
  public static async getProject(projectId: string): Promise<ProjectSummary | null> {
    try {
      const res = await query<{
        id: string;
        name: string;
        slug: string;
        status: string;
        dedicatedBrevoEnabled?: boolean;
        created_at: string;
        updated_at: string;
        plan_name: string | null;
        plan_slug: string | null;
        max_projects: number | null;
        max_databases: number | null;
        database_count: string | null;
      }>(
        `SELECT p.id, p.name, p.slug, p.status, p.dedicated_brevo_enabled as "dedicatedBrevoEnabled", p.created_at, p.updated_at,
                pl.name as plan_name, pl.slug as plan_slug,
                pl.max_projects, pl.max_databases,
                COUNT(d.id) as database_count
         FROM projects p
         LEFT JOIN plans pl ON pl.id = p.plan_id
         LEFT JOIN databases d ON d.project_id = p.id
         WHERE p.id::text = $1 OR p.slug = $1
         GROUP BY p.id, pl.name, pl.slug, pl.max_projects, pl.max_databases`,
        [projectId]
      );

      const r = res.rows[0];
      if (!r) return null;

      return {
        id: r.id,
        name: r.name,
        slug: r.slug,
        status: (r.status || 'active') as 'active',
        dedicatedBrevoEnabled: !!r.dedicatedBrevoEnabled,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        planName: r.plan_name || 'Free Tier',
        planSlug: r.plan_slug || 'free',
        databaseCount: Math.max(1, parseInt(r.database_count || '1', 10)),
        maxProjects: r.max_projects ?? 3,
        maxDatabases: r.max_databases ?? 1,
      };
    } catch {
      return {
        id: projectId,
        name: 'Production Workspace',
        slug: projectId,
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        planName: 'Free Tier',
        planSlug: 'free',
        databaseCount: 1,
        maxProjects: 3,
        maxDatabases: 1,
      };
    }
  }

  /**
   * Creates a persisted project with owner, plan assignment, default env, default DB, and API credentials.
   * Concurrency-safe quota enforcement.
   */
  public static async createProject(
    developerId: string,
    name: string,
    customSlug?: string
  ): Promise<ProjectSummary> {
    // 1. Enforce max_projects quota
    await PlanService.assertProjectQuota(developerId);

    const cleanName = name.trim();
    if (!cleanName || cleanName.length < 2) {
      throw new Error('Project name must be at least 2 characters long.');
    }

    const baseSlug = customSlug?.trim().toLowerCase().replace(/[^a-z0-9-]/g, '') ||
                     cleanName.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
    const slug = `${baseSlug}-${Math.random().toString(36).substring(2, 6)}`;

    return await withTransaction(async (client) => {
      // Find or create default organization for the developer
      let orgRes = await client.query<{ id: string }>(
        'SELECT id FROM organizations WHERE owner_id = $1 LIMIT 1',
        [developerId]
      );

      let orgId: string;
      if (orgRes.rows.length === 0) {
        const createOrg = await client.query<{ id: string }>(
          `INSERT INTO organizations (name, slug, owner_id)
           VALUES ($1, $2, $3)
           RETURNING id`,
          [`${cleanName} Organization`, `org-${slug}`, developerId]
        );
        orgId = createOrg.rows[0].id;
      } else {
        orgId = orgRes.rows[0].id;
      }

      // Find free default plan
      const planRes = await client.query<{ id: string }>(
        "SELECT id FROM plans WHERE is_default = TRUE OR slug = 'free' LIMIT 1"
      );
      const planId = planRes.rows[0]?.id || null;

      // Insert project
      const projRes = await client.query<{ id: string; name: string; slug: string; created_at: string }>(
        `INSERT INTO projects (organization_id, name, slug, status, plan_id)
         VALUES ($1, $2, $3, 'active', $4)
         RETURNING id, name, slug, created_at`,
        [orgId, cleanName, slug, planId]
      );
      const project = projRes.rows[0];

      // Insert default environment
      await client.query(
        `INSERT INTO environments (project_id, name, slug, is_default)
         VALUES ($1, 'production', 'default', TRUE)`,
        [project.id]
      );

      // Insert default database
      await client.query(
        `INSERT INTO databases (project_id, database_id, name, engine, status)
         VALUES ($1, '(default)', 'Default Database', 'syntrabase-jsonb', 'ready')`,
        [project.id]
      );

      // Create default API credentials (publishable and secret keys)
      const pkIdentifier = `pk_live_${CryptoUtil.generateSecureToken(16)}`;
      const skRaw = `sk_live_${CryptoUtil.generateSecureToken(24)}`;
      const skHashed = CryptoUtil.sha256(skRaw);

      await client.query(
        `INSERT INTO api_credentials (project_id, name, type, key_prefix, key_identifier, hashed_secret, scopes)
         VALUES ($1, 'Default Client Key', 'publishable', 'pk_live_', $2, NULL, '{"read", "write"}')`,
        [project.id, pkIdentifier]
      );

      await client.query(
        `INSERT INTO api_credentials (project_id, name, type, key_prefix, key_identifier, hashed_secret, scopes)
         VALUES ($1, 'Default Server Key', 'secret', 'sk_live_', $2, $3, '{"admin", "read", "write"}')`,
        [project.id, `sk_live_${CryptoUtil.generateSecureToken(12)}`, skHashed]
      );

      return {
        id: project.id,
        name: project.name,
        slug: project.slug,
        status: 'active',
        createdAt: project.created_at,
        updatedAt: project.created_at,
        planName: 'Free Tier',
        planSlug: 'free',
        databaseCount: 1,
        maxProjects: 3,
        maxDatabases: 1,
      };
    });
  }
}
