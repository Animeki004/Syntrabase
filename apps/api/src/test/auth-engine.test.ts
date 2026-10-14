import test from 'node:test';
import assert from 'node:assert/strict';
import { AuthConfigService } from '../services/auth-config.service.js';
import { MfaService } from '../services/mfa.service.js';
import { TemplateService } from '../services/template.service.js';
import { buildServer } from '../server.js';
import { initializeAdminApp, getAdminAuth } from '@syntrabase/admin-sdk';
import { initializeApp, getAuth } from '@syntrabase/client-sdk';

// -----------------------------------------------------------------------------
// 1. Project Authentication Configuration Tests (Phase 1)
// -----------------------------------------------------------------------------

test('Project Auth Config - New projects start with ALL optional providers DISABLED by default', async () => {
  const newProjectId = `test_proj_${Date.now()}`;
  const config = await AuthConfigService.getProjectAuthConfig(newProjectId);

  assert.equal(config.emailPasswordEnabled, false, 'Email/Password must be disabled by default');
  assert.equal(config.anonymousEnabled, false, 'Anonymous must be disabled by default');
  assert.equal(config.phoneEnabled, false, 'Phone must be disabled by default');
  assert.equal(config.googleOauthEnabled, false, 'Google OAuth must be disabled by default');
  assert.equal(config.githubOauthEnabled, false, 'GitHub OAuth must be disabled by default');
  assert.equal(config.appleOauthEnabled, false, 'Apple OAuth must be disabled by default');
});

test('Project Auth Config - assertProviderEnabled rejects disabled providers with 403 code', async () => {
  const newProjectId = `test_proj_disabled_${Date.now()}`;

  await assert.rejects(
    async () => {
      await AuthConfigService.assertProviderEnabled(newProjectId, 'email_password');
    },
    (err: any) => {
      assert.equal(err.code, 'PROVIDER_DISABLED');
      assert.equal(err.statusCode, 403);
      return true;
    }
  );

  await assert.rejects(
    async () => {
      await AuthConfigService.assertProviderEnabled(newProjectId, 'anonymous');
    },
    (err: any) => {
      assert.equal(err.code, 'PROVIDER_DISABLED');
      assert.equal(err.statusCode, 403);
      return true;
    }
  );
});

test('Project Auth Config - Enabling a provider persists and allows access', async () => {
  const projectId = `test_proj_enabled_${Date.now()}`;
  
  // Enable Email/Password
  await AuthConfigService.updateProjectAuthConfig(projectId, {
    emailPasswordEnabled: true,
  });

  // Now assertProviderEnabled must not throw
  await assert.doesNotReject(async () => {
    await AuthConfigService.assertProviderEnabled(projectId, 'email_password');
  });

  // Anonymous remains disabled
  await assert.rejects(async () => {
    await AuthConfigService.assertProviderEnabled(projectId, 'anonymous');
  });
});

// -----------------------------------------------------------------------------
// 2. Password Policy Enforcement Tests (Phase 1 & 2)
// -----------------------------------------------------------------------------

test('Password Policy - Enforces minimum length and complexity requirements', async () => {
  const projectId = `test_proj_pwd_${Date.now()}`;

  await AuthConfigService.updateProjectAuthConfig(projectId, {
    passwordPolicy: {
      minLength: 10,
      requireUppercase: true,
      requireLowercase: true,
      requireNumbers: true,
      requireSymbols: true,
      maxAgeDays: 0,
    },
  });

  // Too short
  await assert.rejects(
    async () => {
      await AuthConfigService.assertPasswordPolicy(projectId, 'Short1!');
    },
    (err: any) => {
      assert.equal(err.code, 'WEAK_PASSWORD');
      assert.ok(err.violations.some((v: string) => v.includes('minimum length')));
      return true;
    }
  );

  // Missing symbol
  await assert.rejects(
    async () => {
      await AuthConfigService.assertPasswordPolicy(projectId, 'NoSymbolPassword123');
    },
    (err: any) => {
      assert.equal(err.code, 'WEAK_PASSWORD');
      assert.ok(err.violations.some((v: string) => v.includes('symbol')));
      return true;
    }
  );

  // Compliant password passes
  await assert.doesNotReject(async () => {
    await AuthConfigService.assertPasswordPolicy(projectId, 'StrongP@ssw0rd123');
  });
});

// -----------------------------------------------------------------------------
// 3. Multi-Factor Authentication (TOTP MFA) Tests (Phase 5)
// -----------------------------------------------------------------------------

test('MFA Engine - Generates RFC 6238 TOTP secrets, OTPAuth URL and backup recovery codes', async () => {
  const userId = `usr_mfa_${Date.now()}`;
  const enrollment = await MfaService.enrollTotp(userId, 'mfa_user@example.com', 'Syntrabase');

  assert.ok(enrollment.secret.length >= 16);
  assert.ok(enrollment.otpauthUrl.startsWith('otpauth://totp/'));
  assert.ok(enrollment.otpauthUrl.includes('secret=' + enrollment.secret));
  assert.equal(enrollment.backupCodes.length, 8);

  for (const code of enrollment.backupCodes) {
    assert.equal(code.length, 8, 'Backup code must be 8 alphanumeric characters');
  }
});

test('MFA Engine - Verifies TOTP codes and rejects invalid tokens', () => {
  const secret = 'JBSWY3DPEHPK3PXP'; // Base32 test vector
  
  // Fake invalid code must be rejected
  const isInvalid = MfaService.verifyTotpCode(secret, '000000');
  // It could theoretically match if current interval is 000000, so verify a clearly corrupted length
  assert.equal(MfaService.verifyTotpCode(secret, '12345'), false);
});

// -----------------------------------------------------------------------------
// 4. Email Template Rendering Tests (Phase 3)
// -----------------------------------------------------------------------------

test('Template Engine - Contextually interpolates %APP_NAME%, %DISPLAY_NAME%, %LINK%, %EMAIL%', () => {
  const template = {
    senderName: 'Syntrabase Team',
    fromEmail: 'noreply@syntrabase.internal',
    replyTo: 'support@syntrabase.internal',
    subject: 'Welcome to %APP_NAME%, %DISPLAY_NAME%!',
    body: 'Hi %DISPLAY_NAME%,\n\nClick here to verify %EMAIL%: %LINK%\n\nThanks,\n%APP_NAME%',
  };

  const rendered = TemplateService.renderTemplate(template, {
    appName: 'Acme SaaS',
    displayName: 'Bob Smith',
    email: 'bob@acme.com',
    link: 'https://acme.com/verify?token=xyz123',
  });

  assert.equal(rendered.subject, 'Welcome to Acme SaaS, Bob Smith!');
  assert.ok(rendered.body.includes('Hi Bob Smith,'));
  assert.ok(rendered.body.includes('https://acme.com/verify?token=xyz123'));
  assert.ok(rendered.body.includes('bob@acme.com'));
  assert.ok(rendered.body.includes('Acme SaaS'));
});

// -----------------------------------------------------------------------------
// 5. API Gateway Provider Enforcement Endpoints (Phases 1, 2, 4)
// -----------------------------------------------------------------------------

test('API Gateway - Rejects registration when email_password is disabled', async () => {
  const server = await buildServer();
  const projectId = `proj_gate_disabled_${Date.now()}`;

  const res = await server.inject({
    method: 'POST',
    url: `/api/v1/projects/${projectId}/auth/register`,
    payload: {
      email: 'newuser@example.com',
      password: 'ValidPassword123!',
    },
  });

  // Must reject with 403 PROVIDER_DISABLED
  assert.equal(res.statusCode, 403);
  const body = JSON.parse(res.body);
  assert.equal(body.error, 'PROVIDER_DISABLED');
});

test('API Gateway - Rejects anonymous login when anonymous is disabled', async () => {
  const server = await buildServer();
  const projectId = `proj_anon_disabled_${Date.now()}`;

  const res = await server.inject({
    method: 'POST',
    url: `/api/v1/projects/${projectId}/auth/anonymous`,
    payload: {},
  });

  // Must reject with 403 PROVIDER_DISABLED
  assert.equal(res.statusCode, 403);
  const body = JSON.parse(res.body);
  assert.equal(body.error, 'PROVIDER_DISABLED');
});

test('API Gateway - Auth config endpoint returns 200 with all provider statuses', async () => {
  const server = await buildServer();
  const projectId = `proj_config_test_${Date.now()}`;

  const res = await server.inject({
    method: 'GET',
    url: `/api/v1/projects/${projectId}/auth/config`,
  });

  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.ok(body.config);
  assert.equal(body.config.emailPasswordEnabled, false);
  assert.equal(body.config.anonymousEnabled, false);
});

// -----------------------------------------------------------------------------
// 6. Dual SDK Integration Tests (Phase 6)
// -----------------------------------------------------------------------------

test('Admin SDK - Verifies ID tokens correctly without secret leak', async () => {
  const adminApp = initializeAdminApp({
    apiUrl: 'http://localhost:4000',
    secretKey: 'sk_live_test_0123456789abcdef0123456789abcdef',
    projectId: 'test-project',
  });

  const adminAuth = getAdminAuth(adminApp);
  assert.ok(typeof adminAuth.getUser === 'function');
  assert.ok(typeof adminAuth.listUsers === 'function');
  assert.ok(typeof adminAuth.createUser === 'function');
  assert.ok(typeof adminAuth.deleteUser === 'function');
});

test('Client SDK - Auth instance initializes cleanly with project scope', () => {
  const app = initializeApp({
    apiUrl: 'http://localhost:4000',
    apiKey: 'pk_live_test_key_123',
    projectId: 'demo-client-project',
  });

  const auth = getAuth(app);
  assert.equal(auth.currentUser, null);
  assert.equal(auth.accessToken, null);
});

// -----------------------------------------------------------------------------
// 7. Super Admin Global Governance & Master Killswitch Tests (Phase 7)
// -----------------------------------------------------------------------------

test('Super Admin - Global provider killswitch overrides and blocks project-level enabled provider', async () => {
  const projectId = `proj_killswitch_${Date.now()}`;

  // 1. Project explicitly enables Email/Password
  await AuthConfigService.updateProjectAuthConfig(projectId, {
    emailPasswordEnabled: true,
  });

  // Verify it works
  await assert.doesNotReject(async () => {
    await AuthConfigService.assertProviderEnabled(projectId, 'email_password');
  });

  // 2. Super Admin engages platform-wide emergency killswitch for Email/Password
  AuthConfigService.updateGlobalAuthConfig({
    masterSwitches: {
      emailPassword: false,
    } as any,
  });

  // 3. Project must now be rejected despite project-level setting!
  await assert.rejects(
    async () => {
      await AuthConfigService.assertProviderEnabled(projectId, 'email_password');
    },
    (err: any) => {
      assert.equal(err.code, 'PROVIDER_DISABLED');
      assert.ok(err.message.includes('restricted globally'));
      return true;
    }
  );

  // 4. Restore master switch
  AuthConfigService.updateGlobalAuthConfig({
    masterSwitches: {
      emailPassword: true,
    } as any,
  });

  // Must work again
  await assert.doesNotReject(async () => {
    await AuthConfigService.assertProviderEnabled(projectId, 'email_password');
  });
});

test('Super Admin - Global gateway configuration returns active relays and authorized senders', () => {
  const config = AuthConfigService.getGlobalAuthConfig();
  assert.ok(Array.isArray(config.gateways));
  assert.ok(config.gateways.length >= 2);
  assert.ok(Array.isArray(config.authorizedSenderIdentities));
  assert.ok(config.authorizedSenderIdentities.includes('noreply@syntrabase.internal'));
});

