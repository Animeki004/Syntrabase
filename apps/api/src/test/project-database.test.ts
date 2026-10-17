import test from 'node:test';
import assert from 'node:assert/strict';
import { buildServer } from '../server.js';
import { PlanService, PlanLimitError } from '../services/plan.service.js';
import { DatabaseService } from '../services/database.service.js';
import { ProjectService } from '../services/project.service.js';
import { FirestoreImporterService } from '../services/firestore-importer.service.js';

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

test('Firestore Importer - decodeFirestoreFields parses typed REST objects to JSON', () => {
  const firestoreRaw = {
    title: { stringValue: 'SyntraBase Enterprise' },
    count: { integerValue: '42' },
    ratio: { doubleValue: 98.75 },
    active: { booleanValue: true },
    empty: { nullValue: null },
    tags: { arrayValue: { values: [{ stringValue: 'cloud' }, { stringValue: 'realtime' }] } },
    metadata: {
      mapValue: {
        fields: {
          author: { stringValue: 'Security Team' },
          version: { stringValue: '1.2.3' },
        },
      },
    },
    location: {
      geoPointValue: { latitude: 37.7749, longitude: -122.4194 },
    },
  };

  const decoded = FirestoreImporterService.decodeFirestoreFields(firestoreRaw);
  assert.equal(decoded.title, 'SyntraBase Enterprise');
  assert.equal(decoded.count, 42);
  assert.equal(decoded.ratio, 98.75);
  assert.equal(decoded.active, true);
  assert.equal(decoded.empty, null);
  assert.deepEqual(decoded.tags, ['cloud', 'realtime']);
  assert.deepEqual(decoded.metadata, { author: 'Security Team', version: '1.2.3' });
  assert.deepEqual(decoded.location, { _type: 'GeoPoint', latitude: 37.7749, longitude: -122.4194 });
});

test('Firestore Migration Endpoint - Rejects requests with no migration source', async () => {
  const server = await buildServer();
  const res = await server.inject({
    method: 'POST',
    url: '/api/v1/projects/default-project/databases/(default)/migrate/firestore',
    headers: authHeaders,
    payload: {},
  });

  assert.equal(res.statusCode, 400);
  const data = JSON.parse(res.body);
  assert.equal(data.error, 'NO_MIGRATION_SOURCE');
});

test('Firestore Migration Endpoint - Gracefully catches truncated/malformed service account key', async () => {
  const server = await buildServer();
  const res = await server.inject({
    method: 'POST',
    url: '/api/v1/projects/default-project/databases/(default)/migrate/firestore',
    headers: authHeaders,
    payload: {
      serviceAccount: {
        type: 'service_account',
        project_id: 'test-firebase-proj',
        client_email: 'test@test-firebase-proj.iam.gserviceaccount.com',
        private_key: '-----BEGIN PRIVATE KEY-----\nNOT_A_VALID_OR_TRUNCATED_KEY\n-----END PRIVATE KEY-----\n',
      },
    },
  });

  assert.equal(res.statusCode, 400);
  const data = JSON.parse(res.body);
  assert.equal(data.error, 'FIRESTORE_IMPORT_ERROR');
  assert.ok(data.message.includes('INVALID_SERVICE_ACCOUNT_KEY'));
});

test('Firestore Migration Endpoint - Test mode dryRun simulates and validates sample documents', async () => {
  const server = await buildServer();
  const res = await server.inject({
    method: 'POST',
    url: '/api/v1/projects/default-project/databases/(default)/migrate/firestore',
    headers: authHeaders,
    payload: {
      testMode: true,
      batchSize: 50,
      dryRun: true,
    },
  });

  assert.equal(res.statusCode, 200);
  const data = JSON.parse(res.body);
  assert.equal(data.success, true);
  assert.equal(data.dryRun, true);
  assert.equal(data.testMode, true);
  assert.ok(data.totalDocuments >= 4);
  assert.equal(data.committedDocuments, 0); // 0 written in dry-run
  assert.ok(data.collections.includes('users'));
  assert.ok(data.collections.includes('products'));
  assert.ok(data.message.includes('Dry run validated'));
});
