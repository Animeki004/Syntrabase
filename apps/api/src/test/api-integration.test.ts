import test from 'node:test';
import assert from 'node:assert/strict';
import { buildServer } from '../server.js';
import { StorageService } from '../services/storage.service.js';
import { EmailService } from '../services/email.service.js';
import { query } from '../db/pool.js';

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
  assert.ok(validation.projectId === 'test-proj' || validation.projectId === '00000000-0000-0000-0000-000000000020');
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
  assert.ok(data.expectedOutcome.toLowerCase().includes('throttle'));
});

test('Developer Password Reset - Unknown email returns 404 ACCOUNT_NOT_FOUND', async () => {
  const server = await buildServer();

  const res = await server.inject({
    method: 'POST',
    url: '/api/v1/auth/developer/forgot-password',
    payload: {
      email: 'nonexistent_dev_404@nowhere.internal',
    },
  });

  assert.equal(res.statusCode, 404);
  const data = JSON.parse(res.body);
  assert.equal(data.success, false);
  assert.equal(data.error, 'ACCOUNT_NOT_FOUND');
  assert.ok(data.message.includes('No developer account found'));
});

test('Developer Password Reset - Flooding triggers 429 TOO_MANY_REQUESTS', async () => {
  const server = await buildServer();
  const testEmail = 'flood_target@test.internal';

  // Dispatch requests up to and exceeding the limit
  let lastStatus = 0;
  for (let i = 0; i < 6; i++) {
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/auth/developer/forgot-password',
      headers: {
        'x-forwarded-for': '198.51.100.42',
      },
      payload: {
        email: testEmail,
      },
    });
    lastStatus = res.statusCode;
  }

  assert.equal(lastStatus, 429);
});

test('Email Template Test Dispatch - Dispatches test email without legacy SMTP error', async () => {
  const server = await buildServer();
  const projectId = '00000000-0000-0000-0000-000000000020';

  // Seed verified domain and active authorized sender
  const domain = await EmailService.registerCustomDomain(projectId, `test-template-${Date.now()}.com`);
  await query(`UPDATE custom_sender_domains SET verification_status = 'verified' WHERE id = $1`, [domain.id]);
  domain.verificationStatus = 'verified';

  const sender = await EmailService.addAuthorizedSender({
    projectId,
    domainId: domain.id,
    displayName: 'Test Auth Gateway',
    emailAddress: `verify@${domain.domainName}`,
  });

  try {
    const res = await server.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/auth/templates/verify_email/test`,
      payload: {
        testEmail: 'developer_tester@example.com',
      },
    });

    assert.equal(res.statusCode, 200);
    const data = JSON.parse(res.body);
    assert.equal(data.success, true);
    assert.ok(data.message.includes('developer_tester@example.com'));
  } finally {
    await EmailService.deleteAuthorizedSender(sender.id, projectId).catch(() => {});
    await EmailService.deleteCustomDomain(domain.id, projectId).catch(() => {});
  }
});

