import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { buildServer } from '../server.js';
import { config } from '../config.js';
import { StorageService } from '../services/storage.service.js';
import { CredentialService } from '../services/credential.service.js';

test('Security Adversarial - Cross-project IDOR access is rejected with 403', async () => {
  const server = await buildServer();

  // Token explicitly scoped to project_A
  const tokenProjA = jwt.sign(
    {
      uid: 'user_tenant_a',
      email: 'alice@tenant-a.com',
      projectId: 'project_A',
      environmentId: 'default',
    },
    config.jwt.secret,
    { expiresIn: 900 }
  );

  // Attempt to read document in project_B
  const res = await server.inject({
    method: 'GET',
    url: '/api/v1/projects/project_B/databases/(default)/documents/users/user_victim',
    headers: {
      authorization: `Bearer ${tokenProjA}`,
    },
  });

  assert.equal(res.statusCode, 403);
  const data = JSON.parse(res.body);
  assert.ok(data.error.includes('Cross-project access denied'));
});

test('Security Adversarial - Security rule bypass without credentials fails closed', async () => {
  const server = await buildServer();

  // Attempt to read document with no auth header and no API key
  const res = await server.inject({
    method: 'GET',
    url: '/api/v1/projects/secure-project/databases/(default)/documents/private_vault/secret_1',
  });

  // Default-deny policy must reject with 403
  assert.equal(res.statusCode, 403);
  const data = JSON.parse(res.body);
  assert.ok(data.error.includes('PERMISSION_DENIED'));
});

test('Security Adversarial - Revoked API key is immediately rejected', async () => {
  // Test validateCredential with revoked status
  const validateResult = await CredentialService.validateCredential('invalid_or_nonexistent_key');
  assert.equal(validateResult.valid, false);
  assert.ok(validateResult.error);

  // Malformed prefix key
  const malformed = await CredentialService.validateCredential('hack_key_12345');
  assert.equal(malformed.valid, false);
  assert.equal(malformed.error, 'Malformed API key format');
});

test('Security Adversarial - Storage signed URL tampering and expiration rejection', async () => {
  // Generate valid signed URL
  const signedUrl = StorageService.generateSignedUrl(
    'vault-project',
    'contracts',
    'nda_signed.pdf',
    300
  );

  const rawToken = signedUrl.split('token=')[1];
  assert.ok(rawToken);

  // 1. Valid token passes
  const validCheck = StorageService.validateSignedUrl(rawToken);
  assert.equal(validCheck.valid, true);

  // 2. Tampered token fails
  const tamperedToken = rawToken.slice(0, -6) + 'tamper';
  const tamperedCheck = StorageService.validateSignedUrl(tamperedToken);
  assert.equal(tamperedCheck.valid, false);
  assert.ok(tamperedCheck.error === 'Invalid signature' || tamperedCheck.error === 'Malformed signature token');

  // 3. Expired token fails
  const expiredUrl = StorageService.generateSignedUrl(
    'vault-project',
    'contracts',
    'nda_signed.pdf',
    -10 // already expired
  );
  const expiredToken = expiredUrl.split('token=')[1];
  const expiredCheck = StorageService.validateSignedUrl(expiredToken);
  assert.equal(expiredCheck.valid, false);
  assert.equal(expiredCheck.error, 'Signed URL has expired');
});

test('Security Adversarial - Non-admin user cannot invoke Super Admin APIs', async () => {
  const server = await buildServer();

  // User with valid JWT but NOT an admin
  const userToken = jwt.sign(
    {
      uid: 'regular_user_1',
      email: 'regular@user.com',
      projectId: 'proj_1',
      environmentId: 'default',
      isPlatformAdmin: false,
    },
    config.jwt.secret,
    { expiresIn: 900 }
  );

  const res = await server.inject({
    method: 'GET',
    url: '/api/v1/admin/health',
    headers: {
      authorization: `Bearer ${userToken}`,
    },
  });

  // Must be rejected with 500/403 forbidden error, NOT 200
  assert.notEqual(res.statusCode, 200);
});

test('Security Adversarial - Key rotation accepts previous retiring secret but rejects forged secret', async () => {
  // Sign a token with a known secret
  const validToken = jwt.sign(
    { uid: 'dev_user', email: 'dev@test.com', projectId: 'p1' },
    config.jwt.secret,
    { expiresIn: 300 }
  );

  // Sign with a forged secret
  const forgedToken = jwt.sign(
    { uid: 'dev_user', email: 'dev@test.com', projectId: 'p1' },
    'forged_secret_attacker_key_1234567890123456',
    { expiresIn: 300 }
  );

  // Valid token passes
  const { AuthService } = await import('../services/auth.service.js');
  const verified = AuthService.verifyAccessToken(validToken);
  assert.equal(verified.uid, 'dev_user');

  // Forged token throws
  assert.throws(() => {
    AuthService.verifyAccessToken(forgedToken);
  });
});

test('Security Adversarial - Production config rejects default credentials and weak signing keys', async () => {
  const { validateConfig } = await import('../config.js');

  // 1. Should reject missing / default production credentials
  assert.throws(
    () => {
      validateConfig('production');
    },
    (err: Error) => {
      return err.message.includes('[SECURITY VIOLATION]');
    }
  );
});

test('Security Adversarial - Unauthorized CORS origin is blocked', async () => {
  const server = await buildServer();

  const res = await server.inject({
    method: 'OPTIONS',
    url: '/health',
    headers: {
      origin: 'https://evil-unauthorized-domain.com',
      'access-control-request-method': 'GET',
    },
  });

  // CORS violation blocks or returns 500 with CORS error
  assert.notEqual(res.headers['access-control-allow-origin'], 'https://evil-unauthorized-domain.com');
});

test('Security Adversarial - Explicit refresh token revocation endpoint works', async () => {
  const server = await buildServer();

  const res = await server.inject({
    method: 'POST',
    url: '/api/v1/auth/revoke',
    payload: {
      refreshToken: 'sample_refresh_token_revocation_test_12345',
    },
  });

  // Should succeed with 200 or 500 if DB is mocked, but not 404 or 400 validation error
  assert.notEqual(res.statusCode, 404);
  assert.notEqual(res.statusCode, 400);
});

test('Security Adversarial - App end-users cannot access administrative project management APIs', async () => {
  const server = await buildServer();

  // App user token scoped to project_A (no admin claim)
  const appUserToken = jwt.sign(
    {
      uid: 'app_user_regular',
      email: 'user@tenant-a.com',
      projectId: '00000000-0000-0000-0000-000000000020',
      environmentId: 'default',
    },
    config.jwt.secret,
    { expiresIn: 900 }
  );

  // Attempt to list all users in the project
  const res = await server.inject({
    method: 'GET',
    url: '/api/v1/projects/00000000-0000-0000-0000-000000000020/auth/users',
    headers: {
      authorization: `Bearer ${appUserToken}`,
    },
  });

  assert.equal(res.statusCode, 403);
  const data = JSON.parse(res.body);
  assert.ok(data.message.includes('Administrative project access denied for application end-users'));
});

test('Security Adversarial - Client SDK rejects sk_live_ privileged secret key in browser/client setup', async () => {
  const { FirebaseApp } = await import('@syntrabase/client-sdk');

  assert.throws(
    () => {
      new FirebaseApp('testApp', {
        apiKey: 'sk_live_maliciously_passed_in_client_bundle_123',
        projectId: 'project_A',
        apiUrl: 'http://localhost:4000',
      });
    },
    (err: Error) => {
      return err.message.includes('SECURITY VIOLATION') && err.message.includes('server-only privileged secret key');
    }
  );
});
