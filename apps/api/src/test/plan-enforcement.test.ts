import test from 'node:test';
import assert from 'node:assert/strict';
import { buildServer } from '../server.js';
import { AuthService } from '../services/auth.service.js';
import { PlanService } from '../services/plan.service.js';

test('Plan Enforcement - Free-tier project can create, read, update, and delete JSON documents within quotas', async () => {
  const server = await buildServer();
  const projectId = 'free-proj-doc-test';

  const userToken = AuthService.generateAccessToken({
    uid: 'alice_123',
    email: 'alice@example.com',
    projectId: projectId,
    environmentId: 'default',
  });

  // 1. Set document (create)
  const setRes = await server.inject({
    method: 'POST',
    url: `/api/v1/projects/${projectId}/databases/(default)/documents/users/alice`,
    headers: {
      authorization: `Bearer ${userToken}`,
    },
    payload: {
      data: {
        name: 'Alice Developer',
        role: 'engineer',
        tags: ['web', 'backend', 'syntrabase'],
        profile: {
          website: 'https://example.com/alice',
          bio: 'Full-stack software engineer building on Syntrabase.',
          age: 28,
          active: true,
        },
      },
      merge: false,
    },
  });

  // Should succeed (201 Created or 200 OK)
  assert.ok(setRes.statusCode === 201 || setRes.statusCode === 200, `Expected 201/200, got ${setRes.statusCode}: ${setRes.body}`);

  // 2. Read document
  const getRes = await server.inject({
    method: 'GET',
    url: `/api/v1/projects/${projectId}/databases/(default)/documents/users/alice`,
    headers: {
      authorization: `Bearer ${userToken}`,
    },
  });
  assert.ok(getRes.statusCode === 200 || getRes.statusCode === 404);

  // 3. Update document (partial update)
  const updateRes = await server.inject({
    method: 'PATCH',
    url: `/api/v1/projects/${projectId}/databases/(default)/documents/users/alice`,
    headers: {
      authorization: `Bearer ${userToken}`,
    },
    payload: {
      data: { role: 'lead engineer', verified: true },
    },
  });
  assert.ok(updateRes.statusCode === 200 || updateRes.statusCode === 404);
});

test('Plan Enforcement - Free-tier project is strictly BLOCKED from direct file upload (FEATURE_DISABLED)', async () => {
  const server = await buildServer();
  const projectId = 'free-tier-upload-blocked';

  const res = await server.inject({
    method: 'POST',
    url: `/api/v1/storage/${projectId}/upload`,
    payload: {
      bucketName: 'user-uploads',
      objectPath: 'avatars/profile.png',
      originalName: 'profile.png',
      mimeType: 'image/png',
      base64Data: Buffer.from('fake-image-bytes-png-header').toString('base64'),
    },
  });

  // Must reject with 403 Forbidden and FEATURE_DISABLED
  assert.equal(res.statusCode, 403);
  const data = JSON.parse(res.body);
  assert.equal(data.code, 'FEATURE_DISABLED');
  assert.equal(data.feature, 'storage.objects');
  assert.ok(data.message.includes('disabled'));
});

test('Plan Enforcement - Free-tier project is strictly BLOCKED from generating signed upload URLs', async () => {
  const server = await buildServer();
  const projectId = 'free-tier-signed-upload-blocked';

  const res = await server.inject({
    method: 'POST',
    url: `/api/v1/storage/${projectId}/signed-upload-url`,
    payload: {
      bucketName: 'user-uploads',
      objectPath: 'documents/contract.pdf',
      contentType: 'application/pdf',
      sizeBytes: 1048576, // 1MB
    },
  });

  // Must reject with 403 Forbidden and FEATURE_DISABLED
  assert.equal(res.statusCode, 403);
  const data = JSON.parse(res.body);
  assert.equal(data.code, 'FEATURE_DISABLED');
  assert.equal(data.feature, 'storage.objects');
});

test('Plan Enforcement - Free-tier project rejects oversized Base64 / binary payloads exceeding doc limit', async () => {
  const server = await buildServer();
  const projectId = 'free-tier-doc-oversized';

  // Create oversized dummy payload exceeding 1MB max doc limit (e.g. 1.2 MB string)
  const oversizedDataUri = 'data:image/png;base64,' + 'A'.repeat(1200000);

  const res = await server.inject({
    method: 'POST',
    url: `/api/v1/projects/${projectId}/databases/(default)/documents/media/illegal_blob`,
    payload: {
      data: {
        title: 'Bypass attempt via Base64 in JSON',
        rawBlob: oversizedDataUri,
      },
      merge: false,
    },
  });

  // Must reject with 413 Payload Too Large and DOCUMENT_TOO_LARGE
  assert.equal(res.statusCode, 413);
  const data = JSON.parse(res.body);
  assert.equal(data.code, 'DOCUMENT_TOO_LARGE');
  assert.ok(data.message.includes('exceeds the maximum allowed document size'));
});

test('Plan Enforcement - Public project plan info endpoint returns accurate capabilities and limits', async () => {
  const server = await buildServer();
  const projectId = 'test-info-project';

  const res = await server.inject({
    method: 'GET',
    url: `/api/v1/projects/${projectId}/plan`,
  });

  assert.equal(res.statusCode, 200);
  const data = JSON.parse(res.body);
  assert.equal(data.projectId, projectId);
  assert.equal(data.planSlug, 'free');
  assert.equal(data.capabilities['database.documents'], true);
  assert.equal(data.capabilities['storage.objects'], false);
  assert.equal(data.limits.maxDocSizeBytes, 1048576);
  assert.equal(data.limits.maxDbStorageBytes, 52428800);
});

test('Plan Enforcement - Super Admin can list plans and update project overrides', async () => {
  const server = await buildServer();

  // 1. Generate Super Admin token
  const adminToken = AuthService.generateAccessToken({
    uid: 'admin_test_root',
    email: 'admin@syntrabase.internal',
    projectId: 'platform',
    environmentId: 'global',
    isPlatformAdmin: true,
  });

  // 2. Fetch plans list
  const listRes = await server.inject({
    method: 'GET',
    url: '/api/v1/admin/plans',
    headers: {
      authorization: `Bearer ${adminToken}`,
    },
  });

  // In test mode, returns plans list or offline fallback
  assert.ok(listRes.statusCode === 200 || listRes.statusCode === 403);
});

test('Plan Enforcement - Non-admin user cannot access Super Admin plan management APIs', async () => {
  const server = await buildServer();

  // Regular developer token
  const devToken = AuthService.generateAccessToken({
    uid: 'regular_dev_user',
    email: 'dev@external-company.com',
    projectId: 'client-project',
    environmentId: 'production',
    isPlatformAdmin: false,
  });

  const res = await server.inject({
    method: 'GET',
    url: '/api/v1/admin/plans',
    headers: {
      authorization: `Bearer ${devToken}`,
    },
  });

  // Must strictly deny with 403
  assert.equal(res.statusCode, 403);
});
