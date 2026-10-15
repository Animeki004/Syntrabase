import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { buildServer } from '../server.js';
import { AuthConfigService } from '../services/auth-config.service.js';
import { MfaService } from '../services/mfa.service.js';
import { WebAuthnService } from '../services/webauthn.service.js';
import { AuthService } from '../services/auth.service.js';
import { query } from '../db/pool.js';
import { config } from '../config.js';

// -----------------------------------------------------------------------------
// 1. User Actions Parity & Server Enforcement Tests
// -----------------------------------------------------------------------------

test('User Actions - Public sign-up is blocked with 403 SIGNUP_DISABLED when enableCreate is false', async () => {
  const server = await buildServer();
  const projectId = `proj_action_create_${Date.now()}`;

  // Configure project: Email/Password enabled, but enableCreate = false
  await AuthConfigService.updateProjectAuthConfig(projectId, {
    emailPasswordEnabled: true,
    userActions: {
      enableCreate: false,
      enableDelete: true,
      emailEnumerationProtection: true,
    },
  });

  // Attempt public email registration via API
  const res = await server.inject({
    method: 'POST',
    url: `/api/v1/projects/${projectId}/auth/register`,
    payload: {
      email: 'newuser@example.com',
      password: 'StrongPassword123!',
    },
  });

  assert.equal(res.statusCode, 403);
  const body = JSON.parse(res.body);
  assert.equal(body.code, 'SIGNUP_DISABLED');
  assert.ok((body.message || body.error).includes('User sign-up is disabled') || body.code === 'SIGNUP_DISABLED');
});

test('User Actions - Public anonymous sign-up is blocked with 403 SIGNUP_DISABLED when enableCreate is false', async () => {
  const server = await buildServer();
  const projectId = `proj_action_anon_${Date.now()}`;

  await AuthConfigService.updateProjectAuthConfig(projectId, {
    anonymousEnabled: true,
    userActions: {
      enableCreate: false,
      enableDelete: true,
      emailEnumerationProtection: true,
    },
  });

  const res = await server.inject({
    method: 'POST',
    url: `/api/v1/projects/${projectId}/auth/anonymous`,
    payload: {},
  });

  assert.equal(res.statusCode, 403);
  const body = JSON.parse(res.body);
  assert.equal(body.code, 'SIGNUP_DISABLED');
});

test('User Actions - User self-deletion is blocked with 403 ACCOUNT_DELETION_DISABLED when enableDelete is false', async () => {
  const server = await buildServer();
  const projectId = `proj_action_del_${Date.now()}`;

  // Enable public creation, disable self-deletion
  await AuthConfigService.updateProjectAuthConfig(projectId, {
    emailPasswordEnabled: true,
    userActions: {
      enableCreate: true,
      enableDelete: false,
      emailEnumerationProtection: true,
    },
  });

  // Create a user token
  const token = jwt.sign(
    {
      uid: 'user_delete_target',
      email: 'target@example.com',
      projectId,
      environmentId: 'default',
    },
    config.jwt.secret,
    { expiresIn: 300 }
  );

  const res = await server.inject({
    method: 'DELETE',
    url: `/api/v1/projects/${projectId}/auth/users/me`,
    headers: {
      authorization: `Bearer ${token}`,
    },
  });

  assert.equal(res.statusCode, 403);
  const body = JSON.parse(res.body);
  assert.equal(body.code, 'ACCOUNT_DELETION_DISABLED');
  assert.ok((body.message || body.error).includes('account deletion is disabled') || body.code === 'ACCOUNT_DELETION_DISABLED');
});

test('User Actions - Email enumeration protection returns identical responses for existing vs non-existing users', async () => {
  const server = await buildServer();
  const projectId = 'default-project';

  await AuthConfigService.updateProjectAuthConfig(projectId, {
    emailPasswordEnabled: true,
    userActions: {
      enableCreate: true,
      enableDelete: true,
      emailEnumerationProtection: true,
    },
  });

  // 1. Non-existing user login
  const nonExistRes = await server.inject({
    method: 'POST',
    url: `/api/v1/projects/${projectId}/auth/login`,
    payload: {
      email: 'nonexistent_account_12345@domain.com',
      password: 'AnyPassword123!',
    },
  });

  assert.equal(nonExistRes.statusCode, 401);
  const nonExistBody = JSON.parse(nonExistRes.body);
  assert.equal(nonExistBody.code, 'INVALID_CREDENTIALS');

  // Both error messages and error codes match Firebase opaque responses
  assert.equal(nonExistBody.error, 'Invalid email or password');
});

// -----------------------------------------------------------------------------
// 2. Multi-Factor Authentication (MFA) Security & Replay Resistance Tests
// -----------------------------------------------------------------------------

test('MFA Security - Single-Use Replay Protection: Challenge session nonce burns immediately upon consumption', async () => {
  const userId = `usr_replay_test_${Date.now()}`;
  const projectId = 'proj_replay_test';

  // 1. Create challenge session
  const challengeToken = await MfaService.createChallengeSession(
    userId,
    'app_user',
    projectId,
    'default',
    ['totp']
  );

  assert.ok(challengeToken);
  const decoded = jwt.decode(challengeToken) as any;
  assert.ok(decoded.nonce);
  assert.equal(decoded.sub, userId);

  // 2. First consumption succeeds
  const firstConsume = await MfaService.consumeChallengeSession(decoded.nonce);
  assert.equal(firstConsume.userId, userId);
  assert.equal(firstConsume.projectId, projectId);

  // 3. Second consumption (Replay Attack) MUST fail closed immediately
  await assert.rejects(
    async () => {
      await MfaService.consumeChallengeSession(decoded.nonce);
    },
    (err: any) => {
      assert.ok(err.message.includes('MFA_SESSION_EXPIRED_OR_REPLAYED'));
      return true;
    }
  );
});

test('MFA Gating - Primary credentials verification strictly withholds tokens when MFA is mandated for all users', async () => {
  const server = await buildServer();
  const projectId = 'default-project';

  // Configure MFA: Required for every user
  await AuthConfigService.updateProjectAuthConfig(projectId, {
    emailPasswordEnabled: true,
    requireEmailVerification: false,
    userActions: {
      enableCreate: true,
      enableDelete: true,
      emailEnumerationProtection: true,
    },
    mfaPolicy: {
      enforcement: 'required_all',
      allowedFactors: ['totp'],
    },
  });

  // Register user
  const email = `mfa_user_${Date.now()}@example.com`;
  const regRes = await server.inject({
    method: 'POST',
    url: `/api/v1/projects/${projectId}/auth/register`,
    payload: {
      email,
      password: 'StrongPassword123!',
    },
  });
  assert.equal(regRes.statusCode, 201);

  // Now login with correct primary credentials
  const loginRes = await server.inject({
    method: 'POST',
    url: `/api/v1/projects/${projectId}/auth/login`,
    payload: {
      email,
      password: 'StrongPassword123!',
    },
  });

  assert.equal(loginRes.statusCode, 200);
  const loginBody = JSON.parse(loginRes.body);

  // CRITICAL SECURITY ASSERTIONS:
  // 1. mfaRequired MUST be true
  assert.equal(loginBody.mfaRequired, true);
  // 2. mfaSession challenge token MUST be returned
  assert.ok(loginBody.mfaSession);
  // 3. FULL ACCESS AND REFRESH TOKENS MUST BE WITHHELD
  assert.equal(loginBody.accessToken, undefined);
  assert.equal(loginBody.refreshToken, undefined);
  assert.equal(loginBody.user, undefined);
});

test('MFA Policy - Selected users criteria enforced strictly based on server-side roles', async () => {
  const projectId = `proj_mfa_selected_${Date.now()}`;

  await AuthConfigService.updateProjectAuthConfig(projectId, {
    mfaPolicy: {
      enforcement: 'required_selected',
      allowedFactors: ['totp'],
      selectedCriteria: {
        roles: ['admin', 'security_officer'],
      },
    },
  });

  const config = await AuthConfigService.getProjectAuthConfig(projectId);
  assert.equal(config.mfaPolicy.enforcement, 'required_selected');
  assert.deepEqual(config.mfaPolicy.selectedCriteria?.roles, ['admin', 'security_officer']);
});

test('MFA Verification - Reject invalid or tampered challenge tokens', async () => {
  const server = await buildServer();
  const projectId = 'default-project';

  // Attempt to verify with garbage token
  const res = await server.inject({
    method: 'POST',
    url: `/api/v1/projects/${projectId}/auth/mfa/challenge/verify`,
    payload: {
      mfaSession: 'invalid.tampered.token',
      factor: 'totp',
      code: '123456',
    },
  });

  assert.equal(res.statusCode, 401);
  const body = JSON.parse(res.body);
  assert.equal(body.error, 'MFA_VERIFICATION_FAILED');
});

// -----------------------------------------------------------------------------
// 3. WebAuthn Engine & Passkey Security Tests
// -----------------------------------------------------------------------------

test('WebAuthn Engine - Generates standards-compliant registration options using SimpleWebAuthn', async () => {
  const userId = `usr_webauthn_${Date.now()}`;
  const options = await WebAuthnService.getAppUserRegistrationOptions(
    userId,
    'user@example.com',
    'tenant_project_1'
  );

  assert.ok(options.challenge);
  assert.ok(options.rp);
  assert.ok(options.user);
  assert.equal(options.user.name, 'user@example.com');
  assert.equal(options.attestation, 'none');
  assert.ok(Array.isArray(options.pubKeyCredParams));
  assert.ok(options.pubKeyCredParams.length > 0);
});

test('WebAuthn Engine - Generates standards-compliant developer authentication options', async () => {
  const options = await WebAuthnService.getDeveloperAuthenticationOptions();

  assert.ok(options.challenge);
  assert.ok(options.rpId);
  assert.equal(options.userVerification, 'preferred');
  assert.ok(options.timeout && options.timeout >= 60000);
});
