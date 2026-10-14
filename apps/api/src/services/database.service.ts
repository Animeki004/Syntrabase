import { query } from '../db/pool.js';
import { PlanService } from './plan.service.js';
import { ProjectService } from './project.service.js';
import { ProjectDatabase } from '@syntrabase/shared-types';

export class DatabaseService {
  /**
   * List all databases belonging to a project.
   */
  public static async listDatabases(projectId: string): Promise<ProjectDatabase[]> {
    const resolvedProjectId = await ProjectService.resolveProjectId(projectId);
    try {
      const res = await query<{
        id: string;
        project_id: string;
        database_id: string;
        name: string;
        engine: string;
        status: string;
        created_at: string;
        updated_at: string;
      }>(
        `SELECT id, project_id, database_id, name, engine, status, created_at, updated_at
         FROM databases
         WHERE project_id = $1
         ORDER BY created_at ASC`,
        [resolvedProjectId]
      );

      // If no database exists, ensure default is returned
      if (res.rows.length === 0) {
        return [
          {
            id: 'default-db-id',
            projectId: resolvedProjectId,
            databaseId: '(default)',
            name: 'Default Database',
            engine: 'syntrabase-jsonb',
            status: 'ready',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ];
      }

      return res.rows.map((r) => ({
        id: r.id,
        projectId: r.project_id,
        databaseId: r.database_id,
        name: r.name,
        engine: r.engine,
        status: r.status as 'ready',
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));
    } catch {
      // In-memory fallback
      return [
        {
          id: 'default-db-id',
          projectId: resolvedProjectId,
          databaseId: '(default)',
          name: 'Default Database',
          engine: 'syntrabase-jsonb',
          status: 'ready',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];
    }
  }

  /**
   * Create a new project-scoped database within plan limits.
   */
  public static async createDatabase(
    projectId: string,
    databaseId: string,
    name: string
  ): Promise<ProjectDatabase> {
    const resolvedProjectId = await ProjectService.resolveProjectId(projectId);
    // 1. Enforce max_databases quota
    await PlanService.assertDatabaseQuota(resolvedProjectId);

    // 2. Validate database ID
    const cleanId = databaseId.trim().toLowerCase();
    if (!cleanId || cleanId.length < 2 || cleanId.length > 50) {
      throw new Error('Database ID must be between 2 and 50 characters.');
    }

    // 3. Insert database record
    const res = await query<{
      id: string;
      project_id: string;
      database_id: string;
      name: string;
      engine: string;
      status: string;
      created_at: string;
      updated_at: string;
    }>(
      `INSERT INTO databases (project_id, database_id, name, engine, status)
       VALUES ($1, $2, $3, 'syntrabase-jsonb', 'ready')
       ON CONFLICT (project_id, database_id) DO UPDATE SET name = EXCLUDED.name, updated_at = NOW()
       RETURNING id, project_id, database_id, name, engine, status, created_at, updated_at`,
      [resolvedProjectId, cleanId, name.trim()]
    );

    const row = res.rows[0];
    return {
      id: row.id,
      projectId: row.project_id,
      databaseId: row.database_id,
      name: row.name,
      engine: row.engine,
      status: row.status as 'ready',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Delete a custom database (cannot delete (default)).
   */
  public static async deleteDatabase(projectId: string, databaseId: string): Promise<void> {
    if (databaseId === '(default)') {
      throw new Error('CANNOT_DELETE_DEFAULT_DATABASE: The (default) database is required and cannot be deleted.');
    }

    const resolvedProjectId = await ProjectService.resolveProjectId(projectId);

    await query(
      'DELETE FROM databases WHERE project_id = $1 AND database_id = $2',
      [resolvedProjectId, databaseId]
    );

    // Clean up documents in this database namespace
    await query(
      'DELETE FROM documents WHERE project_id = $1 AND database_id = $2',
      [resolvedProjectId, databaseId]
    ).catch(() => {});
  }
}
