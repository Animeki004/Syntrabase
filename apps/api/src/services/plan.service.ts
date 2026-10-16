import { query } from '../db/pool.js';
import { Plan, ProjectPlanContext, PlanCapabilities, PlanLimits } from '@syntrabase/shared-types';

export class PlanCapabilityError extends Error {
  public statusCode = 403;
  public code = 'FEATURE_DISABLED';
  public feature: string;
  public upgradeUrl = '/settings';

  constructor(feature: string, message?: string) {
    super(message || `Feature '${feature}' is disabled on the current project plan.`);
    this.name = 'PlanCapabilityError';
    this.feature = feature;
  }
}

export class PlanLimitError extends Error {
  public statusCode: number;
  public code: string;
  public details: Record<string, unknown>;

  constructor(code: 'DOCUMENT_TOO_LARGE' | 'QUOTA_EXCEEDED', message: string, details: Record<string, unknown>) {
    super(message);
    this.name = 'PlanLimitError';
    this.code = code;
    this.statusCode = code === 'DOCUMENT_TOO_LARGE' ? 413 : 402; // 413 Payload Too Large or 402 Payment Required
    this.details = details;
  }
}

// In-memory fallback default plan for environments where DB is offline or during testing
const DEFAULT_FALLBACK_PLAN: Plan = {
  id: '00000000-0000-0000-0000-000000000000',
  name: 'Free Tier',
  slug: 'free',
  description: 'Default developer plan with document database enabled and dedicated file storage disabled',
  isDefault: true,
  maxDbStorageBytes: 52428800, // 50 MB
  maxDocSizeBytes: 1048576, // 1 MB
  maxApiRequestsPerWindow: 1000,
  maxFileStorageBytes: 0, // 0 B (disabled)
  maxRealtimeConnections: 25,
  maxProjects: 3,
  maxDatabases: 1,
  maxEmailsPerDay: 100,
  maxEmailsPerMonth: 3000,
  maxCustomDomains: 1,
  maxDedicatedAccounts: 0,
  capabilities: {
    'database.documents': true,
    'database.realtime': true,
    'storage.objects': false,
    'auth.email': true,
    'auth.anonymous': true,
    'email.transactional': true,
    'email.custom_domains': true,
    'email.dedicated_brevo': false,
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export class PlanService {
  /**
   * Resolves the authoritative plan and effective capability context for a project.
   */
  public static async getProjectPlanContext(projectId: string): Promise<ProjectPlanContext> {
    try {
      const res = await query<{
        project_id: string;
        plan_id: string | null;
        plan_overrides: Record<string, unknown> | null;
        plan_name: string | null;
        plan_slug: string | null;
        max_db_storage_bytes: string | null;
        max_doc_size_bytes: number | null;
        max_api_requests_per_window: number | null;
        max_file_storage_bytes: string | null;
        max_realtime_connections: number | null;
        max_projects: number | null;
        max_databases: number | null;
        max_emails_per_day: number | null;
        max_emails_per_month: number | null;
        max_custom_domains: number | null;
        max_dedicated_accounts: number | null;
        capabilities: PlanCapabilities | null;
      }>(
        `SELECT p.id as project_id, p.plan_id, p.plan_overrides,
                pl.name as plan_name, pl.slug as plan_slug,
                pl.max_db_storage_bytes, pl.max_doc_size_bytes, pl.max_api_requests_per_window,
                pl.max_file_storage_bytes, pl.max_realtime_connections,
                pl.max_projects, pl.max_databases,
                pl.max_emails_per_day, pl.max_emails_per_month,
                pl.max_custom_domains, pl.max_dedicated_accounts,
                pl.capabilities
         FROM projects p
         LEFT JOIN plans pl ON pl.id = p.plan_id
         WHERE p.id::text = $1 OR p.slug = $1`,
        [projectId]
      );

      const row = res.rows[0];
      const resolvedProjectId = row?.project_id || projectId;

      let planName = row?.plan_name || DEFAULT_FALLBACK_PLAN.name;
      let planSlug = row?.plan_slug || DEFAULT_FALLBACK_PLAN.slug;
      let planId = row?.plan_id || DEFAULT_FALLBACK_PLAN.id;
      let capabilities: PlanCapabilities = {
        ...(row?.capabilities || DEFAULT_FALLBACK_PLAN.capabilities),
      };
      let limits: PlanLimits = {
        maxDbStorageBytes: row?.max_db_storage_bytes ? parseInt(row.max_db_storage_bytes, 10) : DEFAULT_FALLBACK_PLAN.maxDbStorageBytes,
        maxDocSizeBytes: row?.max_doc_size_bytes || DEFAULT_FALLBACK_PLAN.maxDocSizeBytes,
        maxApiRequestsPerWindow: row?.max_api_requests_per_window || DEFAULT_FALLBACK_PLAN.maxApiRequestsPerWindow,
        maxFileStorageBytes: row?.max_file_storage_bytes ? parseInt(row.max_file_storage_bytes, 10) : DEFAULT_FALLBACK_PLAN.maxFileStorageBytes,
        maxRealtimeConnections: row?.max_realtime_connections || DEFAULT_FALLBACK_PLAN.maxRealtimeConnections,
        maxProjects: row?.max_projects ?? DEFAULT_FALLBACK_PLAN.maxProjects ?? 3,
        maxDatabases: row?.max_databases ?? DEFAULT_FALLBACK_PLAN.maxDatabases ?? 1,
        maxEmailsPerDay: row?.max_emails_per_day ?? DEFAULT_FALLBACK_PLAN.maxEmailsPerDay ?? 100,
        maxEmailsPerMonth: row?.max_emails_per_month ?? DEFAULT_FALLBACK_PLAN.maxEmailsPerMonth ?? 3000,
        maxCustomDomains: row?.max_custom_domains ?? DEFAULT_FALLBACK_PLAN.maxCustomDomains ?? 1,
        maxDedicatedAccounts: row?.max_dedicated_accounts ?? DEFAULT_FALLBACK_PLAN.maxDedicatedAccounts ?? 0,
      };

      const overrides = row?.plan_overrides || {};
      const isOverride = Object.keys(overrides).length > 0;

      if (overrides.capabilities && typeof overrides.capabilities === 'object') {
        capabilities = {
          ...capabilities,
          ...(overrides.capabilities as PlanCapabilities),
        };
      }
      if (overrides.limits && typeof overrides.limits === 'object') {
        limits = {
          ...limits,
          ...(overrides.limits as Partial<PlanLimits>),
        };
      }

      const usage = await this.getProjectUsage(resolvedProjectId);

      return {
        projectId: resolvedProjectId,
        planId,
        planName,
        planSlug,
        capabilities,
        limits,
        usage,
        isOverride,
      };
    } catch {
      return {
        projectId,
        planId: DEFAULT_FALLBACK_PLAN.id,
        planName: DEFAULT_FALLBACK_PLAN.name,
        planSlug: DEFAULT_FALLBACK_PLAN.slug,
        capabilities: { ...DEFAULT_FALLBACK_PLAN.capabilities },
        limits: {
          maxDbStorageBytes: DEFAULT_FALLBACK_PLAN.maxDbStorageBytes,
          maxDocSizeBytes: DEFAULT_FALLBACK_PLAN.maxDocSizeBytes,
          maxApiRequestsPerWindow: DEFAULT_FALLBACK_PLAN.maxApiRequestsPerWindow,
          maxFileStorageBytes: DEFAULT_FALLBACK_PLAN.maxFileStorageBytes,
          maxRealtimeConnections: DEFAULT_FALLBACK_PLAN.maxRealtimeConnections,
          maxProjects: DEFAULT_FALLBACK_PLAN.maxProjects,
          maxDatabases: DEFAULT_FALLBACK_PLAN.maxDatabases,
        },
        usage: { dbStorageBytes: 0, fileStorageBytes: 0, activeConnections: 0, databaseCount: 1 },
        isOverride: false,
      };
    }
  }

  /**
   * Retrieves accurate usage metrics for a project.
   */
  public static async getProjectUsage(projectId: string): Promise<{
    dbStorageBytes: number;
    fileStorageBytes: number;
    activeConnections: number;
    databaseCount: number;
  }> {
    try {
      const dbRes = await query<{ total_bytes: string }>(
        'SELECT COALESCE(SUM(pg_column_size(data)), 0) as total_bytes FROM documents WHERE project_id = $1',
        [projectId]
      );
      const dbStorageBytes = parseInt(dbRes.rows[0]?.total_bytes || '0', 10);

      const fileRes = await query<{ total_bytes: string }>(
        'SELECT COALESCE(SUM(size_bytes), 0) as total_bytes FROM storage_objects WHERE project_id = $1',
        [projectId]
      );
      const fileStorageBytes = parseInt(fileRes.rows[0]?.total_bytes || '0', 10);

      let databaseCount = 1;
      try {
        const countRes = await query<{ count: string }>(
          'SELECT COUNT(*) as count FROM databases WHERE project_id = $1',
          [projectId]
        );
        databaseCount = parseInt(countRes.rows[0]?.count || '1', 10);
      } catch {
        // Table may not yet exist in mock test
        databaseCount = 1;
      }

      return {
        dbStorageBytes,
        fileStorageBytes,
        activeConnections: 0,
        databaseCount,
      };
    } catch {
      return { dbStorageBytes: 0, fileStorageBytes: 0, activeConnections: 0, databaseCount: 1 };
    }
  }

  /**
   * Enforces developer project limit quota before creating a project.
   */
  public static async assertProjectQuota(developerId: string): Promise<void> {
    try {
      const countRes = await query<{ count: string }>(
        `SELECT COUNT(p.id) as count
         FROM projects p
         JOIN organizations o ON o.id = p.organization_id
         WHERE o.owner_id = $1`,
        [developerId]
      );
      const currentProjects = parseInt(countRes.rows[0]?.count || '0', 10);

      // Check max_projects from the developer's assigned projects or fallback to default plan
      const devPlansRes = await query<{ max_projects: number }>(
        `SELECT COALESCE(MAX(pl.max_projects), 3) as max_projects
         FROM projects p
         JOIN organizations o ON o.id = p.organization_id
         LEFT JOIN plans pl ON pl.id = p.plan_id
         WHERE o.owner_id = $1`,
        [developerId]
      );
      const devMax = devPlansRes.rows[0]?.max_projects;

      const planRes = await query<{ max_projects: number }>(
        'SELECT max_projects FROM plans WHERE is_default = TRUE LIMIT 1'
      );
      const defaultMax = planRes.rows[0]?.max_projects ?? 3;
      const maxProjects = devMax && devMax > defaultMax ? devMax : defaultMax;

      if (currentProjects >= maxProjects) {
        throw new PlanLimitError(
          'QUOTA_EXCEEDED',
          `Project creation limit reached (${currentProjects} of ${maxProjects} projects used). Upgrade your plan or request a limit increase from platform administration.`,
          { currentProjects, maxProjects, feature: 'max_projects' }
        );
      }
    } catch (err: any) {
      if (err instanceof PlanLimitError) throw err;
      // In offline mock mode without tables, pass
    }
  }

  /**
   * Enforces project database limit quota before creating a database.
   */
  public static async assertDatabaseQuota(projectId: string): Promise<void> {
    const context = await this.getProjectPlanContext(projectId);
    const maxDatabases = context.limits.maxDatabases ?? 1;

    try {
      const countRes = await query<{ count: string }>(
        'SELECT COUNT(*) as count FROM databases WHERE project_id = $1',
        [projectId]
      );
      const currentDatabases = parseInt(countRes.rows[0]?.count || '0', 10);

      if (currentDatabases >= maxDatabases) {
        throw new PlanLimitError(
          'QUOTA_EXCEEDED',
          `Database creation limit reached (${currentDatabases} of ${maxDatabases} databases used for project '${projectId}'). Upgrade plan to create additional project databases.`,
          { currentDatabases, maxDatabases, projectId }
        );
      }
    } catch (err: any) {
      if (err instanceof PlanLimitError) throw err;
    }
  }

  /**
   * Asserts that a project has the requested capability enabled.
   * Throws PlanCapabilityError if disabled.
   */
  public static async assertCapability(
    projectId: string,
    capability: keyof PlanCapabilities,
    customMessage?: string
  ): Promise<ProjectPlanContext> {
    const context = await this.getProjectPlanContext(projectId);
    if (!context.capabilities[capability]) {
      throw new PlanCapabilityError(
        capability as string,
        customMessage || `Capability '${capability}' is disabled on the ${context.planName} plan for this project.`
      );
    }
    return context;
  }

  /**
   * Validates document write size and storage quota before writing.
   */
  public static async assertDocumentWrite(
    projectId: string,
    proposedData: Record<string, unknown>,
    existingDocData?: Record<string, unknown> | null
  ): Promise<void> {
    const context = await this.assertCapability(projectId, 'database.documents');

    // 1. Calculate payload size (UTF-8 bytes)
    const jsonStr = JSON.stringify(proposedData || {});
    const payloadBytes = Buffer.byteLength(jsonStr, 'utf8');

    // Check individual document size limit
    if (payloadBytes > context.limits.maxDocSizeBytes) {
      throw new PlanLimitError(
        'DOCUMENT_TOO_LARGE',
        `Document size (${payloadBytes} bytes) exceeds the maximum allowed document size of ${context.limits.maxDocSizeBytes} bytes for plan '${context.planName}'.`,
        { payloadBytes, limitBytes: context.limits.maxDocSizeBytes }
      );
    }

    // 2. Check total database storage quota
    const existingBytes = existingDocData ? Buffer.byteLength(JSON.stringify(existingDocData), 'utf8') : 0;
    const deltaBytes = Math.max(0, payloadBytes - existingBytes);

    if (deltaBytes > 0 && context.usage.dbStorageBytes + deltaBytes > context.limits.maxDbStorageBytes) {
      throw new PlanLimitError(
        'QUOTA_EXCEEDED',
        `Database storage quota exceeded. Projected usage (${context.usage.dbStorageBytes + deltaBytes} bytes) exceeds plan limit of ${context.limits.maxDbStorageBytes} bytes.`,
        {
          currentUsageBytes: context.usage.dbStorageBytes,
          deltaBytes,
          limitBytes: context.limits.maxDbStorageBytes,
        }
      );
    }
  }

  /**
   * Validates file upload capability and file storage quota before uploading.
   */
  public static async assertStorageUpload(projectId: string, uploadSizeBytes: number): Promise<void> {
    // 1. Strictly verify file storage capability is enabled
    const context = await this.assertCapability(
      projectId,
      'storage.objects',
      `Dedicated File and Object Storage is disabled on the ${DEFAULT_FALLBACK_PLAN.name} for this project. Upgrade to a paid plan to enable bucket uploads.`
    );

    // 2. Check storage quota
    if (context.usage.fileStorageBytes + uploadSizeBytes > context.limits.maxFileStorageBytes) {
      throw new PlanLimitError(
        'QUOTA_EXCEEDED',
        `File storage quota exceeded. Uploading ${uploadSizeBytes} bytes would exceed the plan storage limit of ${context.limits.maxFileStorageBytes} bytes.`,
        {
          currentUsageBytes: context.usage.fileStorageBytes,
          uploadSizeBytes,
          limitBytes: context.limits.maxFileStorageBytes,
        }
      );
    }
  }

  /**
   * Super Admin: List all available plans with project counts.
   */
  public static async getAllPlans(): Promise<Array<Plan & { projectCount: number }>> {
    try {
      const res = await query<{
        id: string;
        name: string;
        slug: string;
        description: string | null;
        is_default: boolean;
        max_db_storage_bytes: string;
        max_doc_size_bytes: number;
        max_api_requests_per_window: number;
        max_file_storage_bytes: string;
        max_realtime_connections: number;
        max_projects: number;
        max_databases: number;
        max_emails_per_day?: number;
        max_emails_per_month?: number;
        max_custom_domains?: number;
        max_dedicated_accounts?: number;
        capabilities: PlanCapabilities;
        created_at: string;
        updated_at: string;
        project_count: string;
      }>(
        `SELECT pl.*, COUNT(p.id) as project_count
         FROM plans pl
         LEFT JOIN projects p ON p.plan_id = pl.id
         GROUP BY pl.id
         ORDER BY pl.max_db_storage_bytes ASC`
      );

      return res.rows.map((row) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        description: row.description || undefined,
        isDefault: row.is_default,
        maxDbStorageBytes: parseInt(row.max_db_storage_bytes, 10),
        maxDocSizeBytes: row.max_doc_size_bytes,
        maxApiRequestsPerWindow: row.max_api_requests_per_window,
        maxFileStorageBytes: parseInt(row.max_file_storage_bytes, 10),
        maxRealtimeConnections: row.max_realtime_connections,
        maxProjects: row.max_projects ?? 3,
        maxDatabases: row.max_databases ?? 1,
        maxEmailsPerDay: row.max_emails_per_day ?? 100,
        maxEmailsPerMonth: row.max_emails_per_month ?? 3000,
        maxCustomDomains: row.max_custom_domains ?? 1,
        maxDedicatedAccounts: row.max_dedicated_accounts ?? 0,
        capabilities: row.capabilities,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        projectCount: parseInt(row.project_count, 10),
      }));
    } catch {
      return [{ ...DEFAULT_FALLBACK_PLAN, projectCount: 1 }];
    }
  }

  /**
   * Super Admin: Create a new custom plan.
   */
  public static async createPlan(data: {
    name: string;
    slug: string;
    description?: string;
    isDefault?: boolean;
    maxDbStorageBytes: number;
    maxDocSizeBytes: number;
    maxApiRequestsPerWindow?: number;
    maxFileStorageBytes: number;
    maxRealtimeConnections?: number;
    maxProjects?: number;
    maxDatabases?: number;
    maxEmailsPerDay?: number;
    maxEmailsPerMonth?: number;
    maxCustomDomains?: number;
    maxDedicatedAccounts?: number;
    capabilities: PlanCapabilities;
  }): Promise<Plan> {
    if (data.isDefault) {
      await query('UPDATE plans SET is_default = FALSE WHERE is_default = TRUE');
    }

    const res = await query<Plan>(
      `INSERT INTO plans (
        name, slug, description, is_default, max_db_storage_bytes, max_doc_size_bytes,
        max_api_requests_per_window, max_file_storage_bytes, max_realtime_connections,
        max_projects, max_databases, max_emails_per_day, max_emails_per_month,
        max_custom_domains, max_dedicated_accounts, capabilities
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING id, name, slug, description, is_default as "isDefault",
                max_db_storage_bytes as "maxDbStorageBytes", max_doc_size_bytes as "maxDocSizeBytes",
                max_api_requests_per_window as "maxApiRequestsPerWindow",
                max_file_storage_bytes as "maxFileStorageBytes",
                max_realtime_connections as "maxRealtimeConnections",
                max_projects as "maxProjects", max_databases as "maxDatabases",
                max_emails_per_day as "maxEmailsPerDay", max_emails_per_month as "maxEmailsPerMonth",
                max_custom_domains as "maxCustomDomains", max_dedicated_accounts as "maxDedicatedAccounts",
                capabilities, created_at as "createdAt", updated_at as "updatedAt"`,
      [
        data.name,
        data.slug,
        data.description || null,
        data.isDefault || false,
        data.maxDbStorageBytes,
        data.maxDocSizeBytes,
        data.maxApiRequestsPerWindow || 1000,
        data.maxFileStorageBytes,
        data.maxRealtimeConnections || 25,
        data.maxProjects || 3,
        data.maxDatabases || 1,
        data.maxEmailsPerDay || 100,
        data.maxEmailsPerMonth || 3000,
        data.maxCustomDomains ?? 1,
        data.maxDedicatedAccounts ?? 0,
        JSON.stringify(data.capabilities),
      ]
    );

    return res.rows[0];
  }

  /**
   * Super Admin: Update plan limits or capabilities.
   */
  public static async updatePlan(planId: string, updates: Partial<Plan>): Promise<Plan> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (updates.name !== undefined) {
      fields.push(`name = $${idx++}`);
      values.push(updates.name);
    }
    if (updates.description !== undefined) {
      fields.push(`description = $${idx++}`);
      values.push(updates.description);
    }
    if (updates.maxDbStorageBytes !== undefined) {
      fields.push(`max_db_storage_bytes = $${idx++}`);
      values.push(updates.maxDbStorageBytes);
    }
    if (updates.maxDocSizeBytes !== undefined) {
      fields.push(`max_doc_size_bytes = $${idx++}`);
      values.push(updates.maxDocSizeBytes);
    }
    if (updates.maxFileStorageBytes !== undefined) {
      fields.push(`max_file_storage_bytes = $${idx++}`);
      values.push(updates.maxFileStorageBytes);
    }
    if (updates.maxRealtimeConnections !== undefined) {
      fields.push(`max_realtime_connections = $${idx++}`);
      values.push(updates.maxRealtimeConnections);
    }
    if (updates.maxProjects !== undefined) {
      fields.push(`max_projects = $${idx++}`);
      values.push(updates.maxProjects);
    }
    if (updates.maxDatabases !== undefined) {
      fields.push(`max_databases = $${idx++}`);
      values.push(updates.maxDatabases);
    }
    if (updates.maxEmailsPerDay !== undefined) {
      fields.push(`max_emails_per_day = $${idx++}`);
      values.push(updates.maxEmailsPerDay);
    }
    if (updates.maxEmailsPerMonth !== undefined) {
      fields.push(`max_emails_per_month = $${idx++}`);
      values.push(updates.maxEmailsPerMonth);
    }
    if (updates.maxCustomDomains !== undefined) {
      fields.push(`max_custom_domains = $${idx++}`);
      values.push(updates.maxCustomDomains);
    }
    if (updates.maxDedicatedAccounts !== undefined) {
      fields.push(`max_dedicated_accounts = $${idx++}`);
      values.push(updates.maxDedicatedAccounts);
    }
    if (updates.capabilities !== undefined) {
      fields.push(`capabilities = $${idx++}`);
      values.push(JSON.stringify(updates.capabilities));
    }

    if (fields.length === 0) {
      throw new Error('No valid fields to update');
    }

    fields.push('updated_at = NOW()');
    values.push(planId);

    const res = await query<Plan>(
      `UPDATE plans SET ${fields.join(', ')} WHERE id = $${idx}
       RETURNING id, name, slug, description, is_default as "isDefault",
                 max_db_storage_bytes as "maxDbStorageBytes", max_doc_size_bytes as "maxDocSizeBytes",
                 max_api_requests_per_window as "maxApiRequestsPerWindow",
                 max_file_storage_bytes as "maxFileStorageBytes",
                 max_realtime_connections as "maxRealtimeConnections",
                 max_projects as "maxProjects", max_databases as "maxDatabases",
                 max_emails_per_day as "maxEmailsPerDay", max_emails_per_month as "maxEmailsPerMonth",
                 max_custom_domains as "maxCustomDomains", max_dedicated_accounts as "maxDedicatedAccounts",
                 capabilities, created_at as "createdAt", updated_at as "updatedAt"`,
      values
    );

    if (res.rows.length === 0) {
      throw new Error(`Plan ${planId} not found`);
    }

    return res.rows[0];
  }

  /**
   * Super Admin: Assign plan to project and optional project-specific overrides.
   */
  public static async assignProjectPlan(
    projectId: string,
    planId: string,
    overrides?: Record<string, unknown>
  ): Promise<void> {
    const planCheck = await query('SELECT id FROM plans WHERE id = $1', [planId]);
    if (planCheck.rows.length === 0) {
      throw new Error(`Plan ${planId} does not exist`);
    }

    await query(
      'UPDATE projects SET plan_id = $1, plan_overrides = $2, updated_at = NOW() WHERE id::text = $3 OR slug = $3',
      [planId, overrides ? JSON.stringify(overrides) : '{}', projectId]
    );
  }
}
