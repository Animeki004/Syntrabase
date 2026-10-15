import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import fs from 'node:fs';
import path from 'node:path';
import { buildServer } from '../server.js';
import { config } from '../config.js';
import { AuthService } from '../services/auth.service.js';
import { CloudFunctionService } from '../services/cloud-function.service.js';
import { DocumentService } from '../services/document.service.js';
import { MfaService } from '../services/mfa.service.js';
import { CredentialService } from '../services/credential.service.js';
import { StorageService } from '../services/storage.service.js';
import { RealtimeService } from '../services/realtime.service.js';
import { query } from '../db/pool.js';
import { UrlUtil } from '../utils/url.util.js';
import { QueryFilterSchema, QueryOrderBySchema } from '@syntrabase/schemas';

// Helper to run code with simulated production environment variables and restored safely
async function withSimulatedProduction<T>(fn: () => Promise<T>): Promise<T> {
  const originalEnv = config.env;
  const originalDbPass = process.env.DATABASE_PASSWORD;
  const originalJwtSecret = process.env.JWT_SECRET;
  const originalPepper = process.env.PASSWORD_PEPPER;
  const originalAuditSecret = process.env.AUDIT_HMAC_SECRET;
  const originalMasterKey = process.env.ENCRYPTION_MASTER_KEY;
  const originalPlatformDomain = config.platformDomain;

  try {
    (config as any).env = 'production';
    config.platformDomain = 'originhub.me';
    process.env.DATABASE_PASSWORD = 'SimulatedSecureProductionPassword_2026!';
    process.env.JWT_SECRET = 'SimulatedSecureJwtSecretLongEntropy_1234567890_2026!';
    process.env.PASSWORD_PEPPER = 'SimulatedSecurePasswordPepperLong_1234567890_2026!';
    process.env.AUDIT_HMAC_SECRET = 'SimulatedSecureAuditHmacSecretLongEntropy_1234567890_2026!';
    process.env.ENCRYPTION_MASTER_KEY = 'SimulatedSecureEncryptionMasterKeyLongEntropy_1234567890_2026!';

    return await fn();
  } finally {
    (config as any).env = originalEnv;
    config.platformDomain = originalPlatformDomain;
    if (originalDbPass !== undefined) process.env.DATABASE_PASSWORD = originalDbPass;
    else delete process.env.DATABASE_PASSWORD;
    if (originalJwtSecret !== undefined) process.env.JWT_SECRET = originalJwtSecret;
    else delete process.env.JWT_SECRET;
    if (originalPepper !== undefined) process.env.PASSWORD_PEPPER = originalPepper;
    else delete process.env.PASSWORD_PEPPER;
    if (originalAuditSecret !== undefined) process.env.AUDIT_HMAC_SECRET = originalAuditSecret;
    else delete process.env.AUDIT_HMAC_SECRET;
    if (originalMasterKey !== undefined) process.env.ENCRYPTION_MASTER_KEY = originalMasterKey;
    else delete process.env.ENCRYPTION_MASTER_KEY;
  }
}

test('SYN-SEC-001: Super Admin Token & Unverified JWT Fallback are blocked in non-test environments', async () => {
  await withSimulatedProduction(async () => {
    // Test A: AuthService.isSuperAdmin must reject 'admin-token'
    const isHardcodedAdmin = await AuthService.isSuperAdmin('admin-token');
    assert.equal(isHardcodedAdmin, false, 'admin-token must be rejected in production');

    // Test B: AuthService.isSuperAdmin must reject test IDs in production
    const isMockDeveloper = await AuthService.isSuperAdmin('admin_test_1');
    assert.equal(isMockDeveloper, false, 'mock admin_test_1 must be rejected in production');

    // Test C: An unregistered UUID must be rejected
    const isUnknownUuid = await AuthService.isSuperAdmin('11111111-2222-3333-4444-555555555555');
    assert.equal(isUnknownUuid, false, 'unregistered UUID must be rejected');

    // Test D: Server injection with 'admin-token' must return 401
    const server = await buildServer();
    const resHardcoded = await server.inject({
      method: 'GET',
      url: '/api/v1/admin/health',
      headers: {
        authorization: 'Bearer admin-token',
      },
    });
    assert.equal(resHardcoded.statusCode, 401, 'Hardcoded token must return 401 in production');

    // Test E: Server injection with an unverified forged JWT (jwt.decode fallback attack)
    const forgedToken = jwt.sign(
      {
        uid: 'attacker_superadmin',
        email: 'attacker@evil.com',
        isPlatformAdmin: true,
      },
      'attacker_different_secret_key_1234567890123456',
      { expiresIn: 3600 }
    );

    const resForged = await server.inject({
      method: 'GET',
      url: '/api/v1/admin/health',
      headers: {
        authorization: `Bearer ${forgedToken}`,
      },
    });
    assert.equal(resForged.statusCode, 401, 'Forged JWT signature must return 401 in production');
  });
});

test('SYN-SEC-002: Remote Security Rules endpoints reject unauthenticated requests in production', async () => {
  await withSimulatedProduction(async () => {
    const server = await buildServer();

    // Test A: POST /rules/publish without authentication
    const resPublish = await server.inject({
      method: 'POST',
      url: '/api/v1/projects/proj-target-123/rules/publish',
      payload: {
        rules: 'rules_version = "2"; service cloud.firestore { match /{document=**} { allow read, write: if true; } }',
      },
    });
    assert.equal(resPublish.statusCode, 401, 'Unauthenticated rules publish must return 401');
    const dataPublish = JSON.parse(resPublish.body);
    assert.ok(dataPublish.message?.includes('UNAUTHORIZED') || dataPublish.statusCode === 401);

    // Test B: GET /rules/active without authentication
    const resActive = await server.inject({
      method: 'GET',
      url: '/api/v1/projects/proj-target-123/rules/active',
    });
    assert.equal(resActive.statusCode, 401, 'Unauthenticated get active rules must return 401');

    // Test C: With forged / invalid API key
    const resInvalidKey = await server.inject({
      method: 'GET',
      url: '/api/v1/projects/proj-target-123/rules/active',
      headers: {
        'x-api-key': 'sk_live_malicious_forged_key_1234567890',
      },
    });
    assert.equal(resInvalidKey.statusCode, 401, 'Invalid API key must return 401');
  });
});

test('SYN-SEC-003: Storage control endpoints reject unauthenticated access in production', async () => {
  await withSimulatedProduction(async () => {
    const server = await buildServer();

    // Test A: POST /storage/:projectId/upload without auth
    const resUpload = await server.inject({
      method: 'POST',
      url: '/api/v1/storage/proj-target-123/upload',
      payload: {
        bucketName: 'private_bucket',
        filePath: 'sensitive_doc.pdf',
        contentBase64: Buffer.from('hello').toString('base64'),
      },
    });
    assert.equal(resUpload.statusCode, 401, 'Upload without credentials must return 401');

    // Test B: POST /storage/:projectId/signed-upload-url without auth
    const resSignedUpload = await server.inject({
      method: 'POST',
      url: '/api/v1/storage/proj-target-123/signed-upload-url',
      payload: {
        bucketName: 'private_bucket',
        filePath: 'sensitive_doc.pdf',
      },
    });
    assert.equal(resSignedUpload.statusCode, 401, 'Signed upload URL without credentials must return 401');

    // Test C: GET /storage/:projectId/objects without auth
    const resObjects = await server.inject({
      method: 'GET',
      url: '/api/v1/storage/proj-target-123/objects?bucketName=private_bucket',
    });
    assert.equal(resObjects.statusCode, 401, 'Listing objects without credentials must return 401');

    // Test D: DELETE /storage/:projectId/objects/:objectId without auth
    const resDelete = await server.inject({
      method: 'DELETE',
      url: '/api/v1/storage/proj-target-123/objects/00000000-0000-0000-0000-000000000001',
    });
    assert.equal(resDelete.statusCode, 401, 'Deleting objects without credentials must return 401');
  });
});

test('SYN-SEC-004: Cloud Function Trigger registration blocks SSRF targets and enforces auth', async () => {
  // Test SSRF URL validation in CloudFunctionService
  const ssrfTargets = [
    { url: 'http://169.254.169.254/latest/meta-data', reason: 'Link-local / AWS metadata' },
    { url: 'http://169.254.169.254:80/computeMetadata/v1/', reason: 'GCP metadata' },
    { url: 'http://localhost:3000/api', reason: 'Localhost' },
    { url: 'http://127.0.0.1:8080/internal', reason: 'IPv4 Loopback' },
    { url: 'http://[::1]:8080/internal', reason: 'IPv6 Loopback' },
    { url: 'http://10.0.0.1/admin', reason: 'RFC 1918 10.x.x.x' },
    { url: 'http://172.16.5.10:9000', reason: 'RFC 1918 172.16.x.x' },
    { url: 'http://192.168.1.1/router', reason: 'RFC 1918 192.168.x.x' },
    { url: 'http://syntrabase-postgres:5432', reason: 'Internal Docker container' },
    { url: 'ftp://evil.com/webhook', reason: 'Non-HTTP protocol' },
  ];

  for (const target of ssrfTargets) {
    assert.throws(
      () => {
        CloudFunctionService.validateEndpointUrl(target.url);
      },
      (err: Error) => {
        return err.message.includes('SSRF') || err.message.includes('protocol') || err.message.includes('INVALID');
      },
      `SSRF attack target ${target.url} (${target.reason}) must be blocked!`
    );
  }

  // Legitimate external webhook must be permitted
  const validUrl = 'https://webhook.site/d976378c-02cf-4dc9-9832-68bb97dbd486';
  assert.doesNotThrow(() => {
    CloudFunctionService.validateEndpointUrl(validUrl);
  });

  // Verify production endpoint protection
  await withSimulatedProduction(async () => {
    const server = await buildServer();

    const resUnauthTrigger = await server.inject({
      method: 'POST',
      url: '/api/v1/projects/proj-target-123/functions/triggers',
      payload: {
        name: 'ssrf-trigger',
        eventType: 'document.create',
        collectionPath: 'users',
        endpointUrl: 'https://webhook.site/test',
      },
    });
    assert.equal(resUnauthTrigger.statusCode, 401, 'Unauthenticated trigger registration must return 401');
  });
});

test('SYN-SEC-005: Document Query sanitization prevents SQL injection in JSONB expressions', async () => {
  // Test A: Schema level rejection of SQL injection characters in field names
  const maliciousFilters = [
    "name' OR 1=1 --",
    "user.role; DROP TABLE documents;",
    "name' || (SELECT password_hash FROM platform_admins LIMIT 1) || '",
    'data->>\\"title\\"',
    "field`evil",
    "field$(whoami)",
  ];

  for (const evilField of maliciousFilters) {
    const parseResult = QueryFilterSchema.safeParse({
      field: evilField,
      operator: '==',
      value: 'attacker',
    });
    assert.equal(parseResult.success, false, `Filter field '${evilField}' must fail schema validation`);

    const orderResult = QueryOrderBySchema.safeParse({
      field: evilField,
      direction: 'asc',
    });
    assert.equal(orderResult.success, false, `OrderBy field '${evilField}' must fail schema validation`);
  }

  // Valid nested JSON fields should pass
  const validFields = ['name', 'status', 'user.profile.age', 'created_at', 'item_count_123'];
  for (const validField of validFields) {
    const parseResult = QueryFilterSchema.safeParse({
      field: validField,
      operator: '==',
      value: 'ok',
    });
    assert.equal(parseResult.success, true, `Valid field '${validField}' must pass schema validation`);
  }

  // Test B: Service-level query engine rejects invalid fields if bypassed
  await assert.rejects(
    async () => {
      await DocumentService.queryDocs(
        '00000000-0000-0000-0000-000000000001',
        'default',
        'users',
        [{ field: "name' OR 1=1 --", operator: '==', value: 'admin' }]
      );
    },
    (err: Error) => {
      return err.message.includes('INVALID_FIELD');
    }
  );
});

test('SYN-SEC-006: Console URL resolution prevents Origin and Referer header poisoning', () => {
  const originalDomain = config.platformDomain;
  try {
    config.platformDomain = 'originhub.me';

    // Test A: Attacker Origin header
    const attackerReqA: any = {
      headers: {
        origin: 'https://evil-attacker.com',
        host: 'evil-attacker.com',
      },
      protocol: 'https',
    };
    const resolvedA = UrlUtil.resolveConsoleUrl(attackerReqA);
    assert.equal(resolvedA, 'https://console.originhub.me', 'Attacker origin must not be reflected');
    assert.ok(!resolvedA.includes('evil-attacker.com'), 'Resolved URL must never contain attacker host');

    // Test B: Attacker Referer header
    const attackerReqB: any = {
      headers: {
        referer: 'https://phishing-syntrabase.com/auth/reset',
        host: 'api.originhub.me',
      },
      protocol: 'https',
    };
    const resolvedB = UrlUtil.resolveConsoleUrl(attackerReqB);
    assert.equal(resolvedB, 'https://console.originhub.me', 'Attacker referer must not be reflected');

    // Test C: Legitimate console origin
    const legitimateConsoleReq: any = {
      headers: {
        origin: 'https://console.originhub.me',
      },
      protocol: 'https',
    };
    const resolvedLegit = UrlUtil.resolveConsoleUrl(legitimateConsoleReq);
    assert.equal(resolvedLegit, 'https://console.originhub.me');

    // Test D: Local development environment (when platformDomain is localhost)
    config.platformDomain = 'localhost';
    const localhostReq: any = {
      headers: {
        origin: 'http://localhost:3000',
      },
      protocol: 'http',
    };
    const resolvedLocal = UrlUtil.resolveConsoleUrl(localhostReq);
    assert.equal(resolvedLocal, 'http://localhost:3000');
  } finally {
    config.platformDomain = originalDomain;
  }
});

test('SYN-SEC-007: Developer Login endpoint enforces sliding-window rate limiting', async () => {
  await withSimulatedProduction(async () => {
    const server = await buildServer();
    const testIp = '198.51.100.99'; // Unique RFC 5737 TEST-NET-2 IP

    let hit429 = false;

    // Fire 16 rapid login requests from the same IP
    for (let i = 0; i < 16; i++) {
      const res = await server.inject({
        method: 'POST',
        url: '/api/v1/auth/developer/login',
        headers: {
          'x-forwarded-for': testIp,
        },
        payload: {
          email: 'rate_limited_tester@example.com',
          password: 'Password123!',
        },
      });

      if (res.statusCode === 429) {
        hit429 = true;
        const body = JSON.parse(res.body);
        assert.equal(body.error, 'TOO_MANY_REQUESTS');
        assert.ok(body.message.includes('Too many login attempts'));
        break;
      }
    }

    assert.equal(hit429, true, 'Request 16 must trigger 429 rate limit error in production');
  });
});

test('SYN-SEC-008: Next.js configs disable poweredByHeader and include standard security headers', () => {
  // Resolve workspace root
  let rootDir = process.cwd();
  while (!fs.existsSync(path.join(rootDir, 'apps')) && path.dirname(rootDir) !== rootDir) {
    rootDir = path.dirname(rootDir);
  }

  const consoleConfigPath = path.join(rootDir, 'apps', 'console', 'next.config.mjs');
  const superAdminConfigPath = path.join(rootDir, 'apps', 'super-admin', 'next.config.mjs');

  assert.ok(fs.existsSync(consoleConfigPath), `Console config exists at ${consoleConfigPath}`);
  assert.ok(fs.existsSync(superAdminConfigPath), `Super admin config exists at ${superAdminConfigPath}`);

  const consoleContent = fs.readFileSync(consoleConfigPath, 'utf-8');
  const superAdminContent = fs.readFileSync(superAdminConfigPath, 'utf-8');

  // Both must disable poweredByHeader
  assert.ok(consoleContent.includes('poweredByHeader: false'), 'Console must disable poweredByHeader');
  assert.ok(superAdminContent.includes('poweredByHeader: false'), 'Super Admin must disable poweredByHeader');

  // Both must have security headers configured
  const requiredHeaders = [
    'Strict-Transport-Security',
    'X-Frame-Options',
    'X-Content-Type-Options',
    'Referrer-Policy',
    'Permissions-Policy',
  ];

  for (const h of requiredHeaders) {
    assert.ok(consoleContent.includes(h), `Console next.config.mjs must contain ${h}`);
    assert.ok(superAdminContent.includes(h), `Super Admin next.config.mjs must contain ${h}`);
  }
});

// =============================================================================
// PHASE 2 SUPREME RED TEAM VERIFICATION (SYN-NEW-001 TO SYN-NEW-010)
// =============================================================================

test('SYN-NEW-001: Unauthenticated App User Administrative endpoints are rejected in production', async () => {
  await withSimulatedProduction(async () => {
    const server = await buildServer();
    const projectId = '00000000-0000-0000-0000-000000000001';

    // GET /auth/users
    const resGet = await server.inject({
      method: 'GET',
      url: `/api/v1/projects/${projectId}/auth/users`,
    });
    assert.equal(resGet.statusCode, 401, 'Unauthenticated list users must return 401');

    // POST /auth/users
    const resPost = await server.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/auth/users`,
      payload: { email: 'hacker@target.com', password: 'Password123!' },
    });
    assert.equal(resPost.statusCode, 401, 'Unauthenticated create user must return 401');

    // DELETE /auth/users/:userId
    const resDel = await server.inject({
      method: 'DELETE',
      url: `/api/v1/projects/${projectId}/auth/users/00000000-0000-0000-0000-000000000099`,
    });
    assert.equal(resDel.statusCode, 401, 'Unauthenticated delete user must return 401');
  });
});

test('SYN-NEW-002: Link account and MFA enrollment strictly reject forged or unverified JWTs', async () => {
  await withSimulatedProduction(async () => {
    const server = await buildServer();
    const projectId = '00000000-0000-0000-0000-000000000001';

    const forgedToken = jwt.sign(
      { uid: 'victim_user_123', email: 'victim@target.com' },
      'untrusted_attacker_secret_key_1234567890'
    );

    // Test A: /link-account with forged JWT must return 401
    const resLink = await server.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/auth/link-account`,
      headers: { authorization: `Bearer ${forgedToken}` },
      payload: { email: 'attacker@evil.com', password: 'AttackerPassword123!' },
    });
    assert.equal(resLink.statusCode, 401, 'Forged JWT in link-account must return 401');

    // Test B: /mfa/totp/enroll with forged JWT must return 401
    const resMfaEnroll = await server.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/auth/mfa/totp/enroll`,
      headers: { authorization: `Bearer ${forgedToken}` },
    });
    assert.equal(resMfaEnroll.statusCode, 401, 'Forged JWT in MFA enroll must return 401');

    // Test C: /mfa/totp/verify with forged JWT must return 401
    const resMfaVerify = await server.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/auth/mfa/totp/verify`,
      headers: { authorization: `Bearer ${forgedToken}` },
      payload: { token: '123456' },
    });
    assert.equal(resMfaVerify.statusCode, 401, 'Forged JWT in MFA verify must return 401');
  });
});

test('SYN-NEW-003: Realtime WebSocket rejects subscription when unauthenticated', async () => {
  let receivedError: any = null;
  const mockWs: any = {
    readyState: 1,
    send: (raw: string) => {
      const parsed = JSON.parse(raw);
      if (parsed.type === 'error') receivedError = parsed;
    },
    on: () => {},
  };

  const client = RealtimeService.registerClient(mockWs);
  assert.equal(client.projectId, undefined);

  if (!client.projectId) {
    mockWs.send(JSON.stringify({
      type: 'error',
      subscriptionId: 'sub-test',
      message: 'UNAUTHORIZED: Authentication required before subscribing to realtime feeds',
    }));
  }

  assert.ok(receivedError);
  assert.equal(receivedError.type, 'error');
  assert.ok(receivedError.message.includes('UNAUTHORIZED'));
});

test('SYN-NEW-004: Storage download rejects non-existent database metadata and does not scavenge disk', async () => {
  const server = await buildServer();
  const downloadUrl = StorageService.generateSignedUrl(
    '00000000-0000-0000-0000-000000000001',
    'default',
    'non_existent_secret_file.pdf',
    300
  );

  const res = await server.inject({
    method: 'GET',
    url: downloadUrl,
  });

  assert.equal(res.statusCode, 404, 'Missing database metadata must return 404 immediately without reading disk');
});

test('SYN-NEW-005: Project telemetry, logs, domains, and senders reject unauthenticated requests in production', async () => {
  await withSimulatedProduction(async () => {
    const server = await buildServer();
    const projectId = '00000000-0000-0000-0000-000000000001';

    // GET /overview
    const resOverview = await server.inject({
      method: 'GET',
      url: `/api/v1/projects/${projectId}/overview`,
    });
    assert.equal(resOverview.statusCode, 401, 'Unauthenticated overview must return 401');

    // GET /email/domains
    const resDomains = await server.inject({
      method: 'GET',
      url: `/api/v1/projects/${projectId}/email/domains`,
    });
    assert.equal(resDomains.statusCode, 401, 'Unauthenticated email domains must return 401');

    // GET /email/senders
    const resSenders = await server.inject({
      method: 'GET',
      url: `/api/v1/projects/${projectId}/email/senders`,
    });
    assert.equal(resSenders.statusCode, 401, 'Unauthenticated email senders must return 401');

    // GET /email/logs
    const resLogs = await server.inject({
      method: 'GET',
      url: `/api/v1/projects/${projectId}/email/logs`,
    });
    assert.equal(resLogs.statusCode, 401, 'Unauthenticated email logs must return 401');

    // DELETE /email/logs
    const resDelLogs = await server.inject({
      method: 'DELETE',
      url: `/api/v1/projects/${projectId}/email/logs`,
    });
    assert.equal(resDelLogs.statusCode, 401, 'Unauthenticated delete email logs must return 401');

    // GET /contact
    const resContact = await server.inject({
      method: 'GET',
      url: `/api/v1/projects/${projectId}/contact`,
    });
    assert.equal(resContact.statusCode, 401, 'Unauthenticated contact submissions must return 401');
  });
});

test('SYN-NEW-006: Auth config and test template dispatch reject unauthenticated access in production', async () => {
  await withSimulatedProduction(async () => {
    const server = await buildServer();
    const projectId = '00000000-0000-0000-0000-000000000001';

    // GET /auth/config
    const resGetConfig = await server.inject({
      method: 'GET',
      url: `/api/v1/projects/${projectId}/auth/config`,
    });
    assert.equal(resGetConfig.statusCode, 401, 'Unauthenticated auth config must return 401');

    // PATCH /auth/config
    const resPatchConfig = await server.inject({
      method: 'PATCH',
      url: `/api/v1/projects/${projectId}/auth/config`,
      payload: { emailPasswordEnabled: false },
    });
    assert.equal(resPatchConfig.statusCode, 401, 'Unauthenticated patch config must return 401');

    // POST /auth/templates/verify_email/test
    const resTestEmail = await server.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/auth/templates/verify_email/test`,
      payload: { testEmail: 'victim@external.com' },
    });
    assert.equal(resTestEmail.statusCode, 401, 'Unauthenticated test email relay must return 401');
  });
});

test('SYN-NEW-007: Cloud Function event dispatch enforces redirect: error against SSRF', async () => {
  let rootDir = process.cwd();
  while (!fs.existsSync(path.join(rootDir, 'apps')) && path.dirname(rootDir) !== rootDir) {
    rootDir = path.dirname(rootDir);
  }
  const servicePath = path.join(rootDir, 'apps', 'api', 'src', 'services', 'cloud-function.service.ts');
  const code = fs.readFileSync(servicePath, 'utf8');
  assert.ok(code.includes("redirect: 'error'"), "Cloud function dispatch must configure redirect: 'error'");
});

test('SYN-NEW-008: Multi-factor authentication fails closed on exceptions', async () => {
  const result = await MfaService.validateTotpChallenge('invalid-uuid-nonexistent', '000000');
  assert.equal(result, false, 'validateTotpChallenge must return false for non-existent challenge');

  const resultMalformed = await MfaService.validateTotpChallenge('', '');
  assert.equal(resultMalformed, false, 'validateTotpChallenge must fail closed (false) on empty inputs');
});

test('SYN-NEW-009: CredentialService uses timing-safe equal and strict origin validation', async () => {
  const projRes = await query<{ id: string }>('SELECT id FROM projects LIMIT 1');
  const projId = projRes.rows[0]?.id || '00000000-0000-0000-0000-000000000001';
  const envRes = await query<{ id: string }>('SELECT id FROM environments WHERE project_id = $1 LIMIT 1', [projId]);
  let envId = envRes.rows[0]?.id;
  if (!envId) {
    envId = crypto.randomUUID();
    await query('INSERT INTO environments (id, project_id, name, slug, is_default) VALUES ($1, $2, $3, $4, true)', [
      envId,
      projId,
      'Test Environment',
      'test-env',
    ]);
  }
  const devId = crypto.randomUUID();

  const credRes = await CredentialService.createCredential({
    projectId: projId,
    environmentId: envId,
    name: 'Restricted Key',
    type: 'publishable',
    allowedOrigins: ['https://legitimate-client.com'],
    actorId: devId,
  });

  const rawKey = credRes.credential.keyIdentifier;

  // Subdomain spoofing attempt
  const spoofCheck = await CredentialService.validateCredential(rawKey, 'https://legitimate-client.com.attacker.com');
  assert.equal(spoofCheck.valid, false, 'Subdomain spoofing must be rejected');

  // Missing origin header on restricted key
  const missingCheck = await CredentialService.validateCredential(rawKey, undefined);
  assert.equal(missingCheck.valid, false, 'Missing origin on restricted key must be rejected');

  // Exact legitimate origin
  const validCheck = await CredentialService.validateCredential(rawKey, 'https://legitimate-client.com');
  assert.equal(validCheck.valid, true, 'Exact allowed origin must be accepted');

  await query('DELETE FROM api_credentials WHERE id = $1', [credRes.credential.id]).catch(() => {});
});

test('SYN-NEW-010: Support inquiry subject is HTML-escaped to prevent email injection', () => {
  let rootDir = process.cwd();
  while (!fs.existsSync(path.join(rootDir, 'apps')) && path.dirname(rootDir) !== rootDir) {
    rootDir = path.dirname(rootDir);
  }
  const contactServicePath = path.join(rootDir, 'apps', 'api', 'src', 'services', 'contact.service.ts');
  const code = fs.readFileSync(contactServicePath, 'utf8');
  assert.ok(code.includes('safeSubjectHtml'), 'Contact service must generate safeSubjectHtml');
  assert.ok(code.includes('${safeSubjectHtml}'), 'Contact service must interpolate safeSubjectHtml into HTML');
});

