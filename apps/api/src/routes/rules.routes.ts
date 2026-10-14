import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { query } from '../db/pool.js';
import { AuditService } from '../services/audit.service.js';
import { ProjectService } from '../services/project.service.js';
import { compileRules, evaluateRules } from '@syntrabase/rules-engine';
import { PublishSecurityRulesSchema, SimulateRuleSchema } from '@syntrabase/schemas';

export const rulesRoutes: FastifyPluginAsync = async (server: FastifyInstance) => {
  // Publish new version of security rules
  server.post('/api/v1/projects/:projectId/rules/publish', async (req, reply) => {
    const { projectId: rawId } = req.params as { projectId: string };
    const projectId = await ProjectService.resolveProjectId(rawId).catch(() => rawId);
    const body = PublishSecurityRulesSchema.parse(req.body);

    // 1. Validate AST syntax
    let ast;
    try {
      ast = compileRules(body.sourceCode);
    } catch (err) {
      return reply.status(400).send({
        error: 'Syntax validation failed',
        details: (err as Error).message,
      });
    }

    // 2. Fetch latest version number
    const verRes = await query<{ version_number: number }>(
      'SELECT version_number FROM security_rule_versions WHERE project_id = $1 OR project_id = $2 ORDER BY version_number DESC LIMIT 1',
      [projectId, rawId]
    );
    const nextVer = (verRes.rows[0]?.version_number || 0) + 1;

    // 3. Mark old active version as archived
    await query(
      "UPDATE security_rule_versions SET status = 'archived' WHERE project_id = $1 AND status = 'published'",
      [projectId]
    );

    // 4. Insert new published version
    const insertRes = await query<{ id: string; version_number: number; published_at: string }>(
      `INSERT INTO security_rule_versions (
        project_id, version_number, source_code, ast_json, status, published_at
      ) VALUES ($1, $2, $3, $4, 'published', NOW())
      RETURNING id, version_number, published_at`,
      [projectId, nextVer, body.sourceCode, ast]
    );

    await AuditService.log({
      actorId: 'developer',
      actorType: 'developer',
      action: 'rules.published',
      targetResource: `rules:${projectId}:v${nextVer}`,
      projectId,
      payload: { versionNumber: nextVer },
    });

    return reply.status(201).send({
      id: insertRes.rows[0].id,
      versionNumber: insertRes.rows[0].version_number,
      publishedAt: insertRes.rows[0].published_at,
    });
  });

  // Simulate security rules against test context
  server.post('/api/v1/projects/:projectId/rules/simulate', async (req, reply) => {
    const body = SimulateRuleSchema.parse(req.body);

    let ast;
    try {
      ast = compileRules(body.sourceCode);
    } catch (err) {
      return reply.status(400).send({
        error: 'Simulation failed: Invalid rule syntax',
        details: (err as Error).message,
      });
    }

    const result = evaluateRules(ast, body.path, {
      request: {
        auth: body.auth,
        time: new Date().toISOString(),
        method: body.method,
        resource: body.proposedData ? { data: body.proposedData } : undefined,
      },
      resource: body.resourceData ? { data: body.resourceData } : undefined,
      params: {},
    });

    return reply.send(result);
  });

  // Get active published rules
  server.get('/api/v1/projects/:projectId/rules/active', async (req, reply) => {
    const { projectId: rawId } = req.params as { projectId: string };
    const projectId = await ProjectService.resolveProjectId(rawId).catch(() => rawId);

    const res = await query<{
      id: string;
      version_number: number;
      source_code: string;
      published_at: string;
    }>(
      "SELECT id, version_number, source_code, published_at FROM security_rule_versions WHERE (project_id = $1 OR project_id = $2) AND status = 'published' ORDER BY version_number DESC LIMIT 1",
      [projectId, rawId]
    );

    const rule = res.rows[0];
    if (!rule) {
      return reply.status(404).send({ error: 'No published rules found for this project' });
    }

    return reply.send({
      id: rule.id,
      versionNumber: rule.version_number,
      sourceCode: rule.source_code,
      publishedAt: rule.published_at,
    });
  });
};
