import test from 'node:test';
import assert from 'node:assert/strict';
import { buildServer } from '../server.js';
import { StorageService } from '../services/storage.service.js';

test('API Integration - Liveness probe responds 200 OK', async () => {
  const server = await buildServer();
  const res = await server.inject({
    method: 'GET',
    url: '/health',
  });

  assert.equal(res.statusCode, 200);
  const data = JSON.parse(res.body);
  assert.equal(data.status, 'ok');
  assert.ok(data.timestamp);
});

test('API Integration - Rules Simulator allows authorized user and denies unauthorized access', async () => {
  const server = await buildServer();
  const sampleRules = `
    rules_version = '2';
    service cloud.firestore {
      match /databases/{database}/documents/profiles/{uid} {
        allow read: if request.auth != null && request.auth.uid == uid;
      }
    }
  `;

  // Authorized attempt
  const allowedRes = await server.inject({
    method: 'POST',
    url: '/api/v1/projects/test-proj/rules/simulate',
    payload: {
      sourceCode: sampleRules,
      path: '/databases/(default)/documents/profiles/user_42',
      method: 'get',
      auth: { uid: 'user_42', email: 'user@example.com' },
    },
  });

  assert.equal(allowedRes.statusCode, 200);
  const allowedData = JSON.parse(allowedRes.body);
  assert.equal(allowedData.allowed, true);

  // Unauthorized attempt
  const deniedRes = await server.inject({
    method: 'POST',
    url: '/api/v1/projects/test-proj/rules/simulate',
    payload: {
      sourceCode: sampleRules,
      path: '/databases/(default)/documents/profiles/user_42',
      method: 'get',
      auth: { uid: 'attacker_99', email: 'hacker@example.com' },
    },
  });

  assert.equal(deniedRes.statusCode, 200);
  const deniedData = JSON.parse(deniedRes.body);
  assert.equal(deniedData.allowed, false);
});

test('API Integration - Signed URL generation and token verification', async () => {
  const server = await buildServer();
  const res = await server.inject({
    method: 'POST',
    url: '/api/v1/storage/test-proj/signed-url',
    payload: {
      bucketName: 'public-assets',
      objectPath: 'images/logo.png',
      expiresInSeconds: 300,
    },
  });

  assert.equal(res.statusCode, 200);
  const data = JSON.parse(res.body);
  assert.ok(data.signedUrl);

  const token = data.signedUrl.split('token=')[1];
  assert.ok(token);

  const validation = StorageService.validateSignedUrl(token);
  assert.equal(validation.valid, true);
  assert.equal(validation.projectId, 'test-proj');
  assert.equal(validation.bucketName, 'public-assets');
  assert.equal(validation.objectPath, 'images/logo.png');
});

test('API Integration - Autonomous Threat Defense simulations work correctly', async () => {
  const server = await buildServer();
  // Generate a valid mock admin token for the test
  const jwt = await import('jsonwebtoken');
  const { config } = await import('../config.js');

  const adminToken = jwt.default.sign(
    { uid: 'admin_test_1', email: 'admin@platform.com', projectId: 'platform', environmentId: 'global', isPlatformAdmin: true },
    config.jwt.secret,
    { expiresIn: 900 }
  );

  const res = await server.inject({
    method: 'POST',
    url: '/api/v1/admin/security/simulate',
    headers: {
      authorization: `Bearer ${adminToken}`,
    },
    payload: {
      scenario: 'brute_force_login',
    },
  });

  assert.equal(res.statusCode, 200);
  const data = JSON.parse(res.body);
  assert.equal(data.policySelected, 'LEVEL_1_THROTTLE');
  assert.ok(data.expectedOutcome.includes('throttled'));
});
