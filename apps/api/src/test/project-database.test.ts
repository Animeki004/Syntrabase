import test from 'node:test';
import assert from 'node:assert/strict';
import { buildServer } from '../server.js';
import { PlanService, PlanLimitError } from '../services/plan.service.js';
import { DatabaseService } from '../services/database.service.js';
import { ProjectService } from '../services/project.service.js';

import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { query } from '../db/pool.js';

test.before(async () => {
  try {
    await query(
      `INSERT INTO auth_sessions (id, user_id, refresh_token_hash, expires_at)
       VALUES ('00000000-0000-0000-0000-000000000099', '00000000-0000-0000-0000-000000000001', 'mock_refresh_hash_test', NOW() + INTERVAL '1 day')
       ON CONFLICT (id) DO UPDATE SET revoked_at = NULL, expires_at = NOW() + INTERVAL '1 day'`
    );
  } catch (err) {
    console.warn('Could not seed auth session in project-database test:', err);
  }
});

const devToken = jwt.sign(
  { uid: '00000000-0000-0000-0000-000000000001', email: 'dev@syntrabase.internal', isPlatformAdmin: true },
  config.jwt.secret,
  { expiresIn: 900 }
);
const authHeaders = { authorization: `Bearer ${devToken}` };

test('Project & Database Management - List projects endpoint responds with project list and quotas', async () => {
  const server = await buildServer();
  const res = await server.inject({
    method: 'GET',
    url: '/api/v1/projects',
    headers: authHeaders,
  });

  assert.equal(res.statusCode, 200);
  const data = JSON.parse(res.body);
  assert.ok(Array.isArray(data.projects));
  assert.ok(typeof data.totalProjects === 'number');
  assert.ok(typeof data.maxProjects === 'number');
  assert.ok(data.maxProjects >= 1);
});

test('Project & Database Management - Create project endpoint validates project name schema', async () => {
  const server = await buildServer();
  // Name too short
  const res = await server.inject({
    method: 'POST',
    url: '/api/v1/projects',
    headers: authHeaders,
    payload: {
      name: 'a', // invalid: min 2 chars
    },
  });

  assert.equal(res.statusCode, 400);
  const data = JSON.parse(res.body);
  assert.equal(data.error, 'Validation Error');
});

test('Project & Database Management - List databases endpoint returns database list including (default)', async () => {
  const server = await buildServer();
  const res = await server.inject({
    method: 'GET',
    url: '/api/v1/projects/default-project/databases',
    headers: authHeaders,
  });

  assert.equal(res.statusCode, 200);
  const data = JSON.parse(res.body);
  assert.ok(Array.isArray(data.databases));
  assert.ok(data.databases.length >= 1);
  const defaultDb = data.databases.find((d: any) => d.databaseId === '(default)');
  assert.ok(defaultDb, 'Default database (default) must exist');
  assert.equal(defaultDb.engine, 'syntrabase-jsonb');
});

test('Project & Database Management - Create database endpoint validates databaseId format', async () => {
  const server = await buildServer();
  const res = await server.inject({
    method: 'POST',
    url: '/api/v1/projects/default-project/databases',
    headers: authHeaders,
    payload: {
      databaseId: 'INVALID ID WITH SPACES!',
      name: 'Test Database',
    },
  });

  assert.equal(res.statusCode, 400);
  const data = JSON.parse(res.body);
  assert.equal(data.error, 'Validation Error');
});

test('Project & Database Management - Database deletion rejects deleting required (default) database', async () => {
  const server = await buildServer();
  const res = await server.inject({
    method: 'DELETE',
    url: '/api/v1/projects/default-project/databases/(default)',
    headers: authHeaders,
  });

  assert.equal(res.statusCode, 400);
  const data = JSON.parse(res.body);
  assert.ok(data.message.includes('CANNOT_DELETE_DEFAULT_DATABASE'));
});

test('Project & Database Management - PlanService provides default maxProjects and maxDatabases', async () => {
  const context = await PlanService.getProjectPlanContext('default-project');
  assert.ok(context.limits);
  assert.ok(typeof context.limits.maxProjects === 'number');
  assert.ok(typeof context.limits.maxDatabases === 'number');
  assert.ok(context.limits.maxProjects >= 1);
  assert.ok(context.limits.maxDatabases >= 1);
});
