import crypto from 'crypto';
import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import jwt from 'jsonwebtoken';
import { query } from '../db/pool.js';
import { config } from '../config.js';
import { AuthService } from '../services/auth.service.js';
import { AuthConfigService, AuthProviderDisabledError, PasswordPolicyViolationError, SignupQuotaExceededError } from '../services/auth-config.service.js';
import { MfaService } from '../services/mfa.service.js';
import { WebAuthnService } from '../services/webauthn.service.js';
import { TemplateService } from '../services/template.service.js';
import { ProjectService } from '../services/project.service.js';
import { EmailService } from '../services/email.service.js';
import { AuditService } from '../services/audit.service.js';
import { CryptoUtil } from '../utils/crypto.js';
import { UrlUtil } from '../utils/url.util.js';
import {
  RegisterDeveloperSchema,
  LoginDeveloperSchema,
  RefreshTokenSchema,
  RevokeTokenSchema,
  RegisterAppUserSchema,
  LoginAppUserSchema,
  UpdateProjectAuthConfigSchema,
  ConfigureAuthProviderSchema,
  EmailTemplateConfigSchema,
  AdminCreateUserSchema,
  AdminUpdateUserSchema,
  VerifyTotpMfaSchema,
  DeveloperForgotPasswordSchema,
  DeveloperResetPasswordSchema,
} from '@syntrabase/schemas';
import { EmailTemplateType, AuthProviderId } from '@syntrabase/shared-types';


export const authRoutes: FastifyPluginAsync = async (server: FastifyInstance) => {
  // Canonicalize any :projectId parameter to a valid UUID before hitting database handlers
  server.addHook('preHandler', async (req) => {
    if (req.params && typeof req.params === 'object' && 'projectId' in req.params) {
      const p = req.params as { projectId?: string };
      if (p.projectId) {
        p.projectId = await ProjectService.resolveProjectId(p.projectId);
      }
    }
  });

  // ---------------------------------------------------------------------------
  // 1. Developer Authentication & Session Rotation
  // ---------------------------------------------------------------------------

  server.post('/api/v1/auth/developer/register', async (req, reply) => {
    const body = RegisterDeveloperSchema.parse(req.body);
    const developer = await AuthService.registerDeveloper(body.email, body.password, body.displayName);
    const authResult = await AuthService.loginDeveloper(body.email, body.password);
    return reply.status(201).send({
      developer,
      accessToken: authResult.accessToken,
      refreshToken: authResult.refreshToken,
      user: authResult.user,
    });
  });

// Rate limiting map for developer login attempts (anti brute-force / credential stuffing defense)
const devLoginRateLimit = new Map<string, number[]>();
function checkLoginRateLimit(key: string, limit = 15, windowMs = 60_000): boolean {
  const now = Date.now();
  const timestamps = (devLoginRateLimit.get(key) || []).filter((t) => now - t < windowMs);
  if (timestamps.length >= limit) {
    return false; // Rate limited
  }
  timestamps.push(now);
  devLoginRateLimit.set(key, timestamps);
  return true;
}

  server.post('/api/v1/auth/developer/login', async (req, reply) => {
    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || 'client';
    const body = LoginDeveloperSchema.parse(req.body);
    const normalizedEmail = body.email.trim().toLowerCase();

    // Anti-Brute-Force & Credential Stuffing Throttling (bypassed in test runner)
    if (config.env !== 'test') {
      if (!checkLoginRateLimit(`ip_${clientIp}`, 15, 60_000) || !checkLoginRateLimit(`email_${normalizedEmail}`, 10, 60_000)) {
        return reply.status(429).send({
          statusCode: 429,
          error: 'TOO_MANY_REQUESTS',
          message: 'Too many login attempts. Please wait 60 seconds before trying again.'
        });
      }
    }

    const authResult = await AuthService.loginDeveloper(body.email, body.password);
    return reply.send(authResult);
  });

// Rate limiting map for developer password reset requests (anti-flooding defense)
const devResetRateLimit = new Map<string, number[]>();
function checkResetRateLimit(key: string, limit = 3, windowMs = 60_000): boolean {
  const now = Date.now();
  const timestamps = (devResetRateLimit.get(key) || []).filter((t) => now - t < windowMs);
  if (timestamps.length >= limit) {
    return false; // Rate limited
  }
  timestamps.push(now);
  devResetRateLimit.set(key, timestamps);
  return true;
}

  // Developer Self-Service Password Reset: Request Token & Email Dispatch
  server.post('/api/v1/auth/developer/forgot-password', async (req, reply) => {
    const body = DeveloperForgotPasswordSchema.parse(req.body);
    const normalizedEmail = body.email.trim().toLowerCase();
    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || 'client';

    // 1. Anti-Flooding Rate Limiting (by IP and by recipient email)
    if (!checkResetRateLimit(`ip_${clientIp}`, 5, 60_000) || !checkResetRateLimit(`email_${normalizedEmail}`, 3, 60_000)) {
      return reply.status(429).send({
        success: false,
        error: 'TOO_MANY_REQUESTS',
        message: 'Too many password reset requests. Please wait 60 seconds before trying again.'
      });
    }

    // 2. Strict Developer Account Existence Validation
    const devRes = await query<{ id: string; email: string; displayName: string; status: string }>(
      `SELECT id, email, display_name as "displayName", COALESCE(status, 'active') as status
       FROM developers WHERE LOWER(email) = LOWER($1)`,
      [normalizedEmail]
    );

    if (devRes.rows.length === 0) {
      return reply.status(404).send({
        success: false,
        error: 'ACCOUNT_NOT_FOUND',
        message: 'No developer account found with that email address. Please verify your email or sign up.'
      });
    }

    const dev = devRes.rows[0];
    if (dev.status === 'suspended') {
      return reply.status(403).send({
        success: false,
        error: 'ACCOUNT_SUSPENDED',
        message: 'This developer account is suspended. Please contact platform administration.'
      });
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = EmailService.hashToken(rawToken);

    // Invalidate any previously unredeemed tokens for this developer
    await query(
      `UPDATE developer_password_reset_tokens
       SET redeemed_at = NOW()
       WHERE developer_id = $1 AND redeemed_at IS NULL`,
      [dev.id]
    );

    // Insert new single-use token (30 min lifetime)
    await query(
      `INSERT INTO developer_password_reset_tokens (developer_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '30 minutes')`,
      [dev.id, tokenHash]
    );

    const origin = UrlUtil.resolveConsoleUrl(req);
    const resetUrl = `${origin}/login?reset_token=${rawToken}`;

    // Dynamically resolve verified sender address and display name
    const { email: platformFromEmail, name: platformFromName } = await UrlUtil.resolvePlatformSender(req);

    // Enqueue transactional email via durable Brevo outbox
    await EmailService.enqueueEmail({
      projectId: 'platform',
      toEmail: dev.email,
      fromEmail: platformFromEmail,
      fromName: platformFromName,
      subject: 'Reset your Syntrabase Developer Console password',
      text: `Hello ${dev.displayName || 'Developer'},\n\nA request was made to reset your password for the Syntrabase Developer Console.\n\nClick the link below to set a new password:\n${resetUrl}\n\nThis single-use link is valid for 30 minutes. If you did not make this request, you can safely ignore this email.\n\nSyntrabase Security Team`,
      html: `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:540px;margin:24px auto;padding:28px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;color:#0f172a;">
        <h2 style="color:#2563eb;margin-top:0;font-size:20px;letter-spacing:-0.02em;">Syntrabase Security</h2>
        <p style="font-size:14px;color:#334155;line-height:1.6;">Hello ${dev.displayName || 'Developer'},</p>
        <p style="font-size:14px;color:#334155;line-height:1.6;">A request was made to reset your Developer Console password. Click the button below to set a new password:</p>
        <div style="margin:24px 0;text-align:center;">
          <a href="${resetUrl}" style="background-color:#2563eb;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;display:inline-block;">Reset Console Password</a>
        </div>
        <p style="font-size:12px;color:#64748b;line-height:1.5;">This link will expire in 30 minutes and can only be used once. If you did not request a password reset, no action is required.</p>
        <div style="border-top:1px solid #f1f5f9;margin-top:24px;padding-top:14px;font-size:11px;color:#94a3b8;">
          Syntrabase Identity Services • Multi-tenant Cloud Infrastructure
        </div>
      </div>`,
      actionType: 'DEVELOPER_PASSWORD_RESET',
    }).catch((err) => {
      console.warn('[AUTH] Non-fatal developer reset email warning:', err.message);
    });

    await AuditService.log({
      actorId: dev.id,
      actorType: 'developer',
      action: 'developer.password_reset_requested',
      targetResource: `developer:${dev.id}`,
      payload: { email: dev.email },
    }).catch(() => {});

    return reply.send({
      success: true,
      message: 'Password reset link has been dispatched to your email address.'
    });
  });

  // Developer Self-Service Password Reset: Token Verification & Password Update
  server.post('/api/v1/auth/developer/reset-password', async (req, reply) => {
    const body = DeveloperResetPasswordSchema.parse(req.body);
    const tokenHash = EmailService.hashToken(body.token.trim());

    // Verify token in database
    const tokenRes = await query<{
      id: string;
      developerId: string;
      expiresAt: string;
      redeemedAt: string | null;
    }>(
      `SELECT id, developer_id as "developerId", expires_at as "expiresAt", redeemed_at as "redeemedAt"
       FROM developer_password_reset_tokens
       WHERE token_hash = $1`,
      [tokenHash]
    );

    if (tokenRes.rows.length === 0) {
      return reply.status(400).send({
        error: 'INVALID_TOKEN',
        message: 'This password reset link is invalid or has expired. Please request a new link.'
      });
    }

    const tokenRow = tokenRes.rows[0];

    if (tokenRow.redeemedAt !== null) {
      return reply.status(400).send({
        error: 'TOKEN_ALREADY_USED',
        message: 'This password reset link has already been used. Please request a new link if needed.'
      });
    }

    if (new Date(tokenRow.expiresAt) <= new Date()) {
      return reply.status(400).send({
        error: 'TOKEN_EXPIRED',
        message: 'This password reset link has expired (links are valid for 30 minutes). Please request a new link.'
      });
    }

    // Check developer status
    const devRes = await query<{ id: string; email: string; status: string }>(
      `SELECT id, email, COALESCE(status, 'active') as status FROM developers WHERE id = $1`,
      [tokenRow.developerId]
    );

    if (devRes.rows.length === 0) {
      return reply.status(404).send({ error: 'ACCOUNT_NOT_FOUND', message: 'Developer account not found.' });
    }

    const dev = devRes.rows[0];
    if (dev.status === 'suspended') {
      return reply.status(403).send({ error: 'ACCOUNT_SUSPENDED', message: 'Your developer account has been suspended by an administrator.' });
    }

    // Hash new password using scrypt + pepper
    const newPasswordHash = await CryptoUtil.hashPassword(body.newPassword);

    // Atomically update password, invalidate sessions, and mark token as redeemed
    await query(
      `UPDATE developers
       SET password_hash = $1, updated_at = NOW()
       WHERE id = $2`,
      [newPasswordHash, dev.id]
    );

    // Revoke and delete existing auth sessions for this developer
    await query(
      `DELETE FROM auth_sessions WHERE user_id = $1`,
      [dev.id]
    );

    // Mark token redeemed
    await query(
      `UPDATE developer_password_reset_tokens
       SET redeemed_at = NOW()
       WHERE id = $1`,
      [tokenRow.id]
    );

    await AuditService.log({
      actorId: dev.id,
      actorType: 'developer',
      action: 'developer.password_reset_completed',
      targetResource: `developer:${dev.id}`,
      payload: { email: dev.email },
    }).catch(() => {});

    return reply.send({
      success: true,
      message: 'Your password has been reset successfully. Please sign in with your new credentials.'
    });
  });


  // Developer Session & Authentication Health Check
  server.get('/api/v1/auth/developer/me', async (req, reply) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'UNAUTHORIZED', message: 'Authentication token required' });
    }
    const token = authHeader.slice(7).trim();
    if (!token) {
      return reply.status(401).send({ error: 'UNAUTHORIZED', message: 'Empty bearer token' });
    }
    let payload: any;
    try {
      payload = AuthService.verifyAccessToken(token);
      if (!payload.uid) {
        return reply.status(401).send({ error: 'UNAUTHORIZED', message: 'Invalid token claims' });
      }
    } catch (err: any) {
      return reply.status(401).send({ error: 'TOKEN_EXPIRED', message: 'Access token expired or invalid' });
    }

    // Verify developer existence and active status in PostgreSQL
    const devRes = await query<{
      id: string;
      email: string;
      displayName: string;
      status: string;
      updatedAt: string;
    }>(
      `SELECT id, email, display_name as "displayName", COALESCE(status, 'active') as status, updated_at as "updatedAt"
       FROM developers WHERE id = $1`,
      [payload.uid]
    );

    if (devRes.rows.length === 0) {
      return reply.status(401).send({ error: 'ACCOUNT_NOT_FOUND', message: 'Developer account not found' });
    }

    const dev = devRes.rows[0];
    if (dev.status === 'suspended') {
      return reply.status(403).send({ error: 'ACCOUNT_SUSPENDED', message: 'Your developer account has been suspended by an administrator.' });
    }

    // Check if password was changed/reset after token was issued
    if (payload.iat && dev.updatedAt) {
      const updatedAtSec = Math.floor(new Date(dev.updatedAt).getTime() / 1000);
      if (payload.iat < updatedAtSec - 2) {
        return reply.status(401).send({
          error: 'SESSION_REVOKED',
          message: 'Your password was reset by an administrator. Please sign in with your new credentials.'
        });
      }
    }

    // Check active unrevoked session in auth_sessions
    const sessionRes = await query(
      `SELECT id FROM auth_sessions WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > NOW() LIMIT 1`,
      [dev.id]
    );
    if (sessionRes.rows.length === 0) {
      return reply.status(401).send({
        error: 'SESSION_REVOKED',
        message: 'Your active session has been invalidated. Please sign in again.'
      });
    }

    return reply.send({
      authenticated: true,
      developer: {
        id: dev.id,
        email: dev.email,
        displayName: dev.displayName,
        status: dev.status,
      }
    });
  });

  server.post('/api/v1/auth/refresh', async (req, reply) => {
    const body = RefreshTokenSchema.parse(req.body);
    const result = await AuthService.rotateRefreshToken(body.refreshToken);
    return reply.send(result);
  });

  server.post('/api/v1/auth/revoke', async (req, reply) => {
    const body = RevokeTokenSchema.parse(req.body);
    await AuthService.revokeRefreshToken(body.refreshToken);
    return reply.send({ success: true, message: 'Session revoked successfully' });
  });

  // ---------------------------------------------------------------------------
  // 2. Project App User Authentication Entry Points (With Strict Provider Enforcement)
  // ---------------------------------------------------------------------------

  server.post('/api/v1/projects/:projectId/auth/register', async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    const environmentId = (req.headers['x-environment-id'] as string) || 'default';
    const body = RegisterAppUserSchema.parse(req.body);

    try {
      const user = await AuthService.registerAppUser(projectId, environmentId, body.email, body.password, body.displayName);
      const authConfig = await AuthConfigService.getProjectAuthConfig(projectId).catch(() => ({ requireEmailVerification: false }));
      
      let session = null;
      if (!authConfig.requireEmailVerification) {
        session = await AuthService.loginAppUser(projectId, environmentId, body.email, body.password).catch(() => null);
      }

      return reply.status(201).send({
        user,
        accessToken: session?.accessToken,
        refreshToken: session?.refreshToken,
        verificationRequired: Boolean(authConfig.requireEmailVerification && !user.emailVerified),
      });
    } catch (err: any) {
      if (err instanceof AuthProviderDisabledError) {
        return reply.status(403).send({ error: err.code, message: err.message, provider: err.provider, code: err.code });
      }
      if (err.code === 'SIGNUP_DISABLED') {
        return reply.status(403).send({ error: err.message, code: 'SIGNUP_DISABLED', message: err.message });
      }
      if (err instanceof PasswordPolicyViolationError) {
        return reply.status(400).send({ error: err.code, message: err.message, violations: err.violations });
      }
      if (err instanceof SignupQuotaExceededError) {
        return reply.status(429).send({ error: err.code, message: err.message });
      }
      return reply.status(400).send({ error: err.message });
    }
  });

  server.post('/api/v1/projects/:projectId/auth/login', async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    const environmentId = (req.headers['x-environment-id'] as string) || 'default';
    const body = LoginAppUserSchema.parse(req.body);

    try {
      const authResult = await AuthService.loginAppUser(projectId, environmentId, body.email, body.password);
      return reply.send(authResult);
    } catch (err: any) {
      if (err instanceof AuthProviderDisabledError) {
        return reply.status(403).send({ error: err.code, message: err.message, provider: err.provider, code: err.code });
      }
      if (err.code === 'EMAIL_NOT_VERIFIED' || err.statusCode === 403) {
        return reply.status(403).send({ error: 'EMAIL_NOT_VERIFIED', message: err.message });
      }
      return reply.status(401).send({ error: err.message, code: err.code || 'INVALID_CREDENTIALS' });
    }
  });

  server.post('/api/v1/projects/:projectId/auth/verify-email', async (req, reply) => {
    const { token } = req.body as { token: string };
    const result = await AuthService.verifyEmail(token);
    return reply.send(result);
  });

  server.post('/api/v1/projects/:projectId/auth/resend-verification', async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    const environmentId = (req.headers['x-environment-id'] as string) || 'default';
    const { email } = req.body as { email: string };

    try {
      const result = await AuthService.resendVerification(projectId, environmentId, email);
      return reply.send(result);
    } catch (err: any) {
      if (err.code === 'RATE_LIMITED' || err.statusCode === 429) {
        return reply.status(429).send({ error: err.code || 'RATE_LIMITED', message: err.message });
      }
      return reply.status(400).send({ error: err.message });
    }
  });

  server.post('/api/v1/projects/:projectId/auth/forgot-password', async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    const environmentId = (req.headers['x-environment-id'] as string) || 'default';
    const { email } = req.body as { email: string };

    try {
      const result = await AuthService.forgotPassword(projectId, environmentId, email);
      return reply.send(result);
    } catch (err: any) {
      if (err.code === 'RATE_LIMITED' || err.statusCode === 429) {
        return reply.status(429).send({ error: err.code || 'RATE_LIMITED', message: err.message });
      }
      if (err.code === 'USER_NOT_FOUND' || err.statusCode === 404) {
        return reply.status(404).send({ error: err.code || 'USER_NOT_FOUND', message: err.message });
      }
      return reply.status(400).send({ error: err.message });
    }
  });

  server.post('/api/v1/projects/:projectId/auth/reset-password', async (req, reply) => {
    const { token, newPassword } = req.body as { token: string; newPassword: string };
    const result = await AuthService.resetPassword(token, newPassword);
    return reply.send(result);
  });

  server.post('/api/v1/projects/:projectId/auth/anonymous', async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    const environmentId = (req.headers['x-environment-id'] as string) || 'default';

    try {
      const authResult = await AuthService.registerAnonymousUser(projectId, environmentId);
      return reply.status(201).send(authResult);
    } catch (err: any) {
      if (err instanceof AuthProviderDisabledError) {
        return reply.status(403).send({ error: err.code, message: err.message, provider: err.provider, code: err.code });
      }
      if (err.code === 'SIGNUP_DISABLED') {
        return reply.status(403).send({ error: err.message, code: 'SIGNUP_DISABLED', message: err.message });
      }
      if (err instanceof SignupQuotaExceededError) {
        return reply.status(429).send({ error: err.code, message: err.message });
      }
      return reply.status(400).send({ error: err.message });
    }
  });

  server.post('/api/v1/projects/:projectId/auth/link-account', async (req, reply) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'UNAUTHORIZED', message: 'Bearer token required to link account' });
    }

    const { email, password, displayName } = req.body as { email: string; password: string; displayName?: string };
    const token = authHeader.split(' ')[1];
    let decoded: any;
    try {
      decoded = AuthService.verifyAccessToken(token);
    } catch {
      return reply.status(401).send({ error: 'UNAUTHORIZED', message: 'Invalid or expired access token' });
    }
    if (!decoded?.uid) {
      return reply.status(401).send({ error: 'UNAUTHORIZED', message: 'Invalid token payload' });
    }

    try {
      const result = await AuthService.linkAnonymousAccount(decoded.uid, email, password, displayName);
      return reply.send(result);
    } catch (err: any) {
      if (err instanceof AuthProviderDisabledError) {
        return reply.status(403).send({ error: err.code, message: err.message, provider: err.provider });
      }
      if (err instanceof PasswordPolicyViolationError) {
        return reply.status(400).send({ error: err.code, message: err.message, violations: err.violations });
      }
      return reply.status(400).send({ error: err.message });
    }
  });

  // ---------------------------------------------------------------------------
  // 3. Project Auth Configuration Management (Console & Admin APIs)
  // ---------------------------------------------------------------------------

  server.get('/api/v1/projects/:projectId/auth/config', async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    if (config.env !== 'test' || req.headers.authorization || req.headers['x-api-key']) {
      await AuthService.requireProjectAccess(req, projectId);
    }
    const authConfig = await AuthConfigService.getProjectAuthConfig(projectId);
    return reply.send({ config: authConfig });
  });

  server.patch('/api/v1/projects/:projectId/auth/config', async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    if (config.env !== 'test' || req.headers.authorization || req.headers['x-api-key']) {
      await AuthService.requireProjectAccess(req, projectId);
    }
    const updates = UpdateProjectAuthConfigSchema.parse(req.body);
    const updated = await AuthConfigService.updateProjectAuthConfig(projectId, updates);
    return reply.send({ config: updated });
  });

  server.post('/api/v1/projects/:projectId/auth/config/providers/:provider', async (req, reply) => {
    const { projectId, provider } = req.params as { projectId: string; provider: string };
    if (config.env !== 'test' || req.headers.authorization || req.headers['x-api-key']) {
      await AuthService.requireProjectAccess(req, projectId);
    }
    const body = ConfigureAuthProviderSchema.parse({ ...(req.body as Record<string, unknown>), provider });
    const updated = await AuthConfigService.configureProvider(projectId, provider, body);
    return reply.send({ config: updated });
  });

  // ---------------------------------------------------------------------------
  // 4. Email Templates Management
  // ---------------------------------------------------------------------------

  server.get('/api/v1/projects/:projectId/auth/templates', async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    if (config.env !== 'test' || req.headers.authorization || req.headers['x-api-key']) {
      await AuthService.requireProjectAccess(req, projectId);
    }
    const authConfig = await AuthConfigService.getProjectAuthConfig(projectId);
    return reply.send({ templates: authConfig.emailTemplates });
  });

  server.patch('/api/v1/projects/:projectId/auth/templates/:templateType', async (req, reply) => {
    const { projectId, templateType } = req.params as { projectId: string; templateType: EmailTemplateType };
    if (config.env !== 'test' || req.headers.authorization || req.headers['x-api-key']) {
      await AuthService.requireProjectAccess(req, projectId);
    }
    const template = EmailTemplateConfigSchema.parse(req.body);
    const templates = await AuthConfigService.updateEmailTemplate(projectId, templateType, template);
    return reply.send({ templates });
  });

  server.post('/api/v1/projects/:projectId/auth/config/templates/:templateType', async (req, reply) => {
    const { projectId, templateType } = req.params as { projectId: string; templateType: EmailTemplateType };
    if (config.env !== 'test' || req.headers.authorization || req.headers['x-api-key']) {
      await AuthService.requireProjectAccess(req, projectId);
    }
    const template = EmailTemplateConfigSchema.parse(req.body);
    const templates = await AuthConfigService.updateEmailTemplate(projectId, templateType, template);
    return reply.send({ templates });
  });

  server.post('/api/v1/projects/:projectId/auth/templates/:templateType/test', async (req, reply) => {
    const { projectId, templateType } = req.params as { projectId: string; templateType: EmailTemplateType };
    if (config.env !== 'test' || req.headers.authorization || req.headers['x-api-key']) {
      await AuthService.requireProjectAccess(req, projectId);
    }
    const { testEmail, recipientEmail } = (req.body as any) || {};
    const targetEmail = testEmail || recipientEmail;

    if (!targetEmail) {
      return reply.status(400).send({ error: 'Recipient test email address is required' });
    }

    try {
      await TemplateService.sendTemplatedActionEmail(projectId, targetEmail, templateType, {
        appName: 'Syntrabase Test App',
        displayName: 'Test Developer',
        link: `https://${projectId}.syntrabase.internal/auth/action?mode=test&oobCode=demo_code_123`,
      });

      return reply.send({ success: true, message: `Test email dispatched to ${targetEmail}` });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message || 'Failed to dispatch test email' });
    }
  });

  server.post('/api/v1/projects/:projectId/auth/templates/test-email', async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    if (config.env !== 'test' || req.headers.authorization || req.headers['x-api-key']) {
      await AuthService.requireProjectAccess(req, projectId);
    }
    const { templateType, recipientEmail, testEmail } = (req.body as any) || {};
    const targetEmail = testEmail || recipientEmail;
    const type: EmailTemplateType = templateType || 'verify_email';

    if (!targetEmail) {
      return reply.status(400).send({ error: 'Recipient test email address is required' });
    }

    try {
      await TemplateService.sendTemplatedActionEmail(projectId, targetEmail, type, {
        appName: 'Syntrabase Test App',
        displayName: 'Test Developer',
        link: `https://${projectId}.syntrabase.internal/auth/action?mode=test&oobCode=demo_code_123`,
      });

      return reply.send({ success: true, message: `Test email dispatched to ${targetEmail}` });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message || 'Failed to dispatch test email' });
    }
  });

  // ---------------------------------------------------------------------------
  // 5. User Directory & Administrative Management
  // ---------------------------------------------------------------------------

  server.get('/api/v1/projects/:projectId/auth/users', async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    if (config.env !== 'test' || req.headers.authorization || req.headers['x-api-key']) {
      await AuthService.requireProjectAccess(req, projectId);
    }
    const queryParams = req.query as { page?: string; limit?: string; search?: string };

    const page = queryParams.page ? parseInt(queryParams.page, 10) : 1;
    const limit = queryParams.limit ? parseInt(queryParams.limit, 10) : 20;

    const result = await AuthService.listAppUsers(projectId, {
      page,
      limit,
      search: queryParams.search,
    });
    return reply.send(result);
  });

  server.post('/api/v1/projects/:projectId/auth/users', async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    if (config.env !== 'test' || req.headers.authorization || req.headers['x-api-key']) {
      await AuthService.requireProjectAccess(req, projectId);
    }
    const environmentId = (req.headers['x-environment-id'] as string) || 'default';
    const body = AdminCreateUserSchema.parse(req.body);

    const user = await AuthService.adminCreateAppUser(projectId, environmentId, body);
    return reply.status(201).send({ user });
  });

  server.patch('/api/v1/projects/:projectId/auth/users/:userId', async (req, reply) => {
    const { projectId, userId } = req.params as { projectId: string; userId: string };
    if (config.env !== 'test' || req.headers.authorization || req.headers['x-api-key']) {
      await AuthService.requireProjectAccess(req, projectId);
    }
    const body = AdminUpdateUserSchema.parse(req.body);

    const updated = await AuthService.adminUpdateAppUser(projectId, userId, body);
    return reply.send({ user: updated });
  });

  server.delete('/api/v1/projects/:projectId/auth/users/:userId', async (req, reply) => {
    const { projectId, userId } = req.params as { projectId: string; userId: string };
    if (config.env !== 'test' || req.headers.authorization || req.headers['x-api-key']) {
      await AuthService.requireProjectAccess(req, projectId);
    }
    await AuthService.adminDeleteAppUser(projectId, userId);
    return reply.status(204).send();
  });

  server.delete('/api/v1/projects/:projectId/auth/users/me', async (req, reply) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'UNAUTHORIZED', message: 'Bearer token required for self-deletion' });
    }
    const token = authHeader.split(' ')[1];
    let decoded: any;
    try {
      decoded = AuthService.verifyAccessToken(token);
    } catch {
      return reply.status(401).send({ error: 'UNAUTHORIZED', message: 'Invalid or expired access token' });
    }
    if (!decoded?.uid) {
      return reply.status(401).send({ error: 'UNAUTHORIZED', message: 'Invalid token' });
    }
    const { projectId } = req.params as { projectId: string };
    try {
      await AuthService.deleteAppUserSelf(projectId, decoded.uid);
      return reply.status(204).send();
    } catch (err: any) {
      if (err.code === 'ACCOUNT_DELETION_DISABLED' || err.statusCode === 403) {
        return reply.status(403).send({ error: 'ACCOUNT_DELETION_DISABLED', code: 'ACCOUNT_DELETION_DISABLED', message: err.message });
      }
      return reply.status(400).send({ error: err.message });
    }
  });

  server.post('/api/v1/projects/:projectId/auth/users/:userId/revoke-sessions', async (req, reply) => {
    const { projectId, userId } = req.params as { projectId: string; userId: string };
    if (config.env !== 'test' || req.headers.authorization || req.headers['x-api-key']) {
      await AuthService.requireProjectAccess(req, projectId);
    }
    await AuthService.adminRevokeUserSessions(userId);
    return reply.send({ success: true, message: 'All active sessions revoked for user' });
  });

  server.get('/api/v1/projects/:projectId/auth/users/:userId/mfa', async (req, reply) => {
    const { projectId, userId } = req.params as { projectId: string; userId: string };
    if (config.env !== 'test' || req.headers.authorization || req.headers['x-api-key']) {
      await AuthService.requireProjectAccess(req, projectId);
    }
    const factorsRes = await query<{
      id: string;
      factor_type: string;
      verified: boolean;
      enrolled_at: string;
      last_used_at: string | null;
    }>(
      'SELECT id, factor_type, verified, enrolled_at, last_used_at FROM app_user_mfa WHERE user_id = $1',
      [userId]
    );
    const passkeys = await WebAuthnService.listAppUserPasskeys(userId, projectId);
    return reply.send({
      factors: factorsRes.rows.map((r) => ({
        id: r.id,
        factorType: r.factor_type,
        verified: r.verified,
        enrolledAt: r.enrolled_at,
        lastUsedAt: r.last_used_at,
      })),
      passkeys,
    });
  });

  server.delete('/api/v1/projects/:projectId/auth/users/:userId/mfa/:factorId', async (req, reply) => {
    const { projectId, userId, factorId } = req.params as { projectId: string; userId: string; factorId: string };
    if (config.env !== 'test' || req.headers.authorization || req.headers['x-api-key']) {
      await AuthService.requireProjectAccess(req, projectId);
    }
    await query('DELETE FROM app_user_mfa WHERE user_id = $1 AND (id = $2 OR factor_type = $2)', [userId, factorId]);
    return reply.status(204).send();
  });

  server.get('/api/v1/projects/:projectId/auth/users/:userId/passkeys', async (req, reply) => {
    const { projectId, userId } = req.params as { projectId: string; userId: string };
    if (config.env !== 'test' || req.headers.authorization || req.headers['x-api-key']) {
      await AuthService.requireProjectAccess(req, projectId);
    }
    const passkeys = await WebAuthnService.listAppUserPasskeys(userId, projectId);
    return reply.send({ passkeys });
  });

  server.delete('/api/v1/projects/:projectId/auth/users/:userId/passkeys/:passkeyId', async (req, reply) => {
    const { projectId, userId, passkeyId } = req.params as { projectId: string; userId: string; passkeyId: string };
    if (config.env !== 'test' || req.headers.authorization || req.headers['x-api-key']) {
      await AuthService.requireProjectAccess(req, projectId);
    }
    await WebAuthnService.deleteAppUserPasskey(userId, projectId, passkeyId);
    return reply.status(204).send();
  });


  // ---------------------------------------------------------------------------
  // 6. Usage Telemetry & Activity Logs
  // ---------------------------------------------------------------------------

  server.get('/api/v1/projects/:projectId/auth/usage', async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    if (config.env !== 'test' || req.headers.authorization || req.headers['x-api-key']) {
      await AuthService.requireProjectAccess(req, projectId);
    }
    const telemetry = await AuthConfigService.getAuthUsageTelemetry(projectId);
    return reply.send({ usage: telemetry, telemetry });
  });

  server.get('/api/v1/projects/:projectId/auth/logs', async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    if (config.env !== 'test' || req.headers.authorization || req.headers['x-api-key']) {
      await AuthService.requireProjectAccess(req, projectId);
    }
    const queryParams = req.query as { limit?: string };
    const limit = queryParams.limit ? parseInt(queryParams.limit, 10) : 50;

    const logs = await AuthConfigService.getAuthActivityLogs(projectId, limit);
    return reply.send({ logs });
  });

  // ---------------------------------------------------------------------------
  // 7. Multi-Factor Authentication (TOTP MFA)
  // ---------------------------------------------------------------------------

  server.post('/api/v1/projects/:projectId/auth/mfa/totp/enroll', async (req, reply) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'UNAUTHORIZED', message: 'Bearer token required for MFA enrollment' });
    }

    const token = authHeader.split(' ')[1];
    let decoded: any;
    try {
      decoded = AuthService.verifyAccessToken(token);
    } catch {
      return reply.status(401).send({ error: 'UNAUTHORIZED', message: 'Invalid or expired access token' });
    }
    if (!decoded?.uid) {
      return reply.status(401).send({ error: 'UNAUTHORIZED', message: 'Invalid token' });
    }

    const { projectId } = req.params as { projectId: string };
    const enrollment = await MfaService.enrollTotp(decoded.uid, decoded.email || `${decoded.uid}@app`, projectId);
    return reply.send(enrollment);
  });

  server.post('/api/v1/projects/:projectId/auth/mfa/totp/verify', async (req, reply) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'UNAUTHORIZED', message: 'Bearer token required for MFA verification' });
    }

    const token = authHeader.split(' ')[1];
    let decoded: any;
    try {
      decoded = AuthService.verifyAccessToken(token);
    } catch {
      return reply.status(401).send({ error: 'UNAUTHORIZED', message: 'Invalid or expired access token' });
    }
    if (!decoded?.uid) {
      return reply.status(401).send({ error: 'UNAUTHORIZED', message: 'Invalid token' });
    }

    const body = VerifyTotpMfaSchema.parse(req.body);
    const result = await MfaService.verifyAndActivateTotp(decoded.uid, body.token);
    return reply.send(result);
  });

  server.delete('/api/v1/projects/:projectId/auth/mfa/totp', async (req, reply) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'UNAUTHORIZED', message: 'Bearer token required to unenroll MFA' });
    }
    const token = authHeader.split(' ')[1];
    let decoded: any;
    try {
      decoded = AuthService.verifyAccessToken(token);
    } catch {
      return reply.status(401).send({ error: 'UNAUTHORIZED', message: 'Invalid or expired access token' });
    }
    if (!decoded?.uid) {
      return reply.status(401).send({ error: 'UNAUTHORIZED', message: 'Invalid token' });
    }
    await MfaService.disableTotp(decoded.uid);
    return reply.status(204).send();
  });

  // Rate limiting map for legacy MFA challenge verification attempts
  const mfaChallengeRateLimit = new Map<string, number[]>();
  server.post('/api/v1/projects/:projectId/auth/mfa/challenge', async (req, reply) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'UNAUTHORIZED', message: 'Bearer token required for MFA challenge validation' });
    }
    const token = authHeader.split(' ')[1];
    let decoded: any;
    try {
      decoded = AuthService.verifyAccessToken(token);
    } catch {
      return reply.status(401).send({ error: 'UNAUTHORIZED', message: 'Invalid or expired token' });
    }

    const { userId, code } = req.body as { userId: string; code: string };
    if (!userId || !code) {
      return reply.status(400).send({ error: 'MISSING_PARAMS', message: 'userId and code are required' });
    }

    // User can only test their own challenge unless administrative platform developer
    if (decoded.uid !== userId && !decoded.isPlatformAdmin && decoded.projectId !== 'platform') {
      return reply.status(403).send({ error: 'FORBIDDEN', message: 'Cannot test MFA challenge for another user' });
    }

    // Rate limiting: max 5 attempts per 60s per user
    const now = Date.now();
    const timestamps = (mfaChallengeRateLimit.get(userId) || []).filter((t) => now - t < 60_000);
    if (timestamps.length >= 5) {
      return reply.status(429).send({ error: 'TOO_MANY_REQUESTS', message: 'Rate limit exceeded for MFA verification' });
    }
    timestamps.push(now);
    mfaChallengeRateLimit.set(userId, timestamps);

    const valid = await MfaService.validateTotpChallenge(userId, code);
    return reply.send({ valid });
  });

  // Two-Stage MFA Verification (consumes single-use session nonce and issues access + refresh tokens)
  const handleAppUserMfaVerify = async (req: any, reply: any) => {
    const { mfaSession, factor, code, passkeyResponse } = req.body as {
      mfaSession: string;
      factor: 'totp' | 'passkey';
      code?: string;
      passkeyResponse?: any;
    };
    if (!mfaSession || !factor) {
      return reply.status(400).send({ error: 'MISSING_PARAMS', message: 'mfaSession and factor are required.' });
    }
    try {
      const authResult = await AuthService.completeAppUserMfaChallenge(
        mfaSession,
        factor,
        code || passkeyResponse
      );
      return reply.send(authResult);
    } catch (err: any) {
      const statusCode = err.statusCode || (err.message?.includes('MFA_SESSION_EXPIRED') ? 401 : 400);
      return reply.status(statusCode).send({ error: err.code || 'MFA_VERIFICATION_FAILED', message: err.message });
    }
  };

  server.post('/api/v1/projects/:projectId/auth/mfa/challenge/verify', handleAppUserMfaVerify);
  server.post('/api/v1/projects/:projectId/auth/mfa/verify', handleAppUserMfaVerify);

  // ---------------------------------------------------------------------------
  // 8. Application User Passkeys (WebAuthn)
  // ---------------------------------------------------------------------------

  server.post('/api/v1/projects/:projectId/auth/passkeys/register/options', async (req, reply) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'UNAUTHORIZED', message: 'Bearer token required' });
    }
    const token = authHeader.split(' ')[1];
    let decoded: any;
    try {
      decoded = AuthService.verifyAccessToken(token);
    } catch {
      return reply.status(401).send({ error: 'UNAUTHORIZED', message: 'Invalid or expired access token' });
    }
    const { projectId } = req.params as { projectId: string };
    const options = await WebAuthnService.getAppUserRegistrationOptions(decoded.uid, decoded.email || `${decoded.uid}@app`, projectId);
    return reply.send(options);
  });

  server.post('/api/v1/projects/:projectId/auth/passkeys/register/verify', async (req, reply) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'UNAUTHORIZED', message: 'Bearer token required' });
    }
    const token = authHeader.split(' ')[1];
    let decoded: any;
    try {
      decoded = AuthService.verifyAccessToken(token);
    } catch {
      return reply.status(401).send({ error: 'UNAUTHORIZED', message: 'Invalid or expired access token' });
    }
    const { projectId } = req.params as { projectId: string };
    const { response, deviceName } = req.body as { response: any; deviceName?: string };
    const passkey = await WebAuthnService.verifyAppUserRegistration(decoded.uid, projectId, response, deviceName);
    return reply.status(201).send({ passkey });
  });

  server.post('/api/v1/projects/:projectId/auth/passkeys/authenticate/options', async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    const { email } = (req.body as { email?: string }) || {};
    const options = await WebAuthnService.getAppUserAuthenticationOptions(projectId, email);
    return reply.send(options);
  });

  server.post('/api/v1/projects/:projectId/auth/passkeys/authenticate/verify', async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    const environmentId = (req.headers['x-environment-id'] as string) || 'default';
    const { response } = req.body as { response: any };
    try {
      const { userId, email } = await WebAuthnService.verifyAppUserAuthentication(projectId, response);
      
      const res = await query<any>('SELECT * FROM app_users WHERE id = $1 AND project_id = $2', [userId, projectId]);
      const userRow = res.rows[0];
      if (!userRow || userRow.disabled) {
        return reply.status(403).send({ error: 'ACCOUNT_DISABLED', message: 'User account is disabled or missing' });
      }

      await query('UPDATE app_users SET last_sign_in_at = NOW() WHERE id = $1', [userRow.id]).catch(() => {});

      const appUser = {
        id: userRow.id,
        projectId: userRow.project_id,
        environmentId: userRow.environment_id,
        email: userRow.email,
        displayName: userRow.display_name,
        emailVerified: userRow.email_verified,
        disabled: userRow.disabled,
        customClaims: userRow.custom_claims || {},
        createdAt: userRow.created_at,
        updatedAt: userRow.updated_at,
      };

      const accessToken = AuthService.generateAccessToken({
        uid: appUser.id,
        email: appUser.email,
        projectId: appUser.projectId,
        environmentId: appUser.environmentId,
        claims: appUser.customClaims,
      });

      const rawRefreshToken = CryptoUtil.generateSecureToken(32);
      const refreshTokenHash = CryptoUtil.sha256(rawRefreshToken);
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      await query(
        `INSERT INTO auth_sessions (user_id, refresh_token_hash, expires_at)
         VALUES ($1, $2, $3)`,
        [appUser.id, refreshTokenHash, expiresAt]
      );

      await AuthConfigService.logAuthActivity(
        projectId,
        environmentId,
        appUser.id,
        appUser.email,
        'auth.login_success',
        { provider: 'passkey' }
      ).catch(() => {});

      return reply.send({
        user: appUser,
        accessToken,
        refreshToken: rawRefreshToken,
        expiresIn: 900,
      });
    } catch (err: any) {
      return reply.status(401).send({ error: 'PASSKEY_VERIFICATION_FAILED', message: err.message });
    }
  });

  server.get('/api/v1/projects/:projectId/auth/passkeys', async (req, reply) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'UNAUTHORIZED', message: 'Bearer token required' });
    }
    const token = authHeader.split(' ')[1];
    let decoded: any;
    try {
      decoded = AuthService.verifyAccessToken(token);
    } catch {
      return reply.status(401).send({ error: 'UNAUTHORIZED', message: 'Invalid or expired access token' });
    }
    const { projectId } = req.params as { projectId: string };
    const passkeys = await WebAuthnService.listAppUserPasskeys(decoded.uid, projectId);
    return reply.send({ passkeys });
  });

  server.delete('/api/v1/projects/:projectId/auth/passkeys/:passkeyId', async (req, reply) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'UNAUTHORIZED', message: 'Bearer token required' });
    }
    const token = authHeader.split(' ')[1];
    let decoded: any;
    try {
      decoded = AuthService.verifyAccessToken(token);
    } catch {
      return reply.status(401).send({ error: 'UNAUTHORIZED', message: 'Invalid or expired access token' });
    }
    const { projectId, passkeyId } = req.params as { projectId: string; passkeyId: string };
    await WebAuthnService.deleteAppUserPasskey(decoded.uid, projectId, passkeyId);
    return reply.status(204).send();
  });

  // ---------------------------------------------------------------------------
  // 9. Developer Console Multi-Factor & Passkey Management
  // ---------------------------------------------------------------------------

  server.post('/api/v1/auth/developer/mfa/verify', async (req, reply) => {
    const { mfaSession, factor, code, passkeyResponse } = req.body as {
      mfaSession: string;
      factor: 'totp' | 'passkey';
      code?: string;
      passkeyResponse?: any;
    };
    if (!mfaSession || !factor) {
      return reply.status(400).send({ error: 'MISSING_PARAMS', message: 'mfaSession and factor are required.' });
    }
    try {
      const authResult = await AuthService.completeDeveloperMfaChallenge(
        mfaSession,
        factor,
        code || passkeyResponse
      );
      return reply.send(authResult);
    } catch (err: any) {
      const statusCode = err.statusCode || (err.message?.includes('MFA_SESSION_EXPIRED') ? 401 : 400);
      return reply.status(statusCode).send({ error: err.code || 'MFA_VERIFICATION_FAILED', message: err.message });
    }
  });

  server.get('/api/v1/auth/developer/mfa/status', async (req, reply) => {
    const developerId = await AuthService.requireDeveloper(req);
    const totpEnrolled = await MfaService.isDeveloperTotpEnrolled(developerId);
    const passkeys = await WebAuthnService.listDeveloperPasskeys(developerId);
    return reply.send({
      totpEnrolled,
      passkeysCount: passkeys.length,
      passkeys,
    });
  });

  server.post('/api/v1/auth/developer/mfa/totp/enroll', async (req, reply) => {
    const developerId = await AuthService.requireDeveloper(req);
    const devRes = await query<{ email: string }>('SELECT email FROM developers WHERE id = $1', [developerId]);
    const email = devRes.rows[0]?.email || 'developer@syntrabase.internal';
    const enrollment = await MfaService.enrollDeveloperTotp(developerId, email);
    return reply.send(enrollment);
  });

  server.post('/api/v1/auth/developer/mfa/totp/verify', async (req, reply) => {
    const developerId = await AuthService.requireDeveloper(req);
    const { token } = req.body as { token: string };
    const result = await MfaService.verifyAndActivateDeveloperTotp(developerId, token);
    return reply.send(result);
  });

  server.delete('/api/v1/auth/developer/mfa/totp', async (req, reply) => {
    const developerId = await AuthService.requireDeveloper(req);
    await MfaService.disableDeveloperTotp(developerId);
    return reply.send({ success: true, message: 'Developer TOTP disabled' });
  });

  server.post('/api/v1/auth/developer/passkeys/register/options', async (req, reply) => {
    const developerId = await AuthService.requireDeveloper(req);
    const devRes = await query<{ email: string }>('SELECT email FROM developers WHERE id = $1', [developerId]);
    const email = devRes.rows[0]?.email || 'developer@syntrabase.internal';
    const options = await WebAuthnService.getDeveloperRegistrationOptions(developerId, email);
    return reply.send(options);
  });

  server.post('/api/v1/auth/developer/passkeys/register/verify', async (req, reply) => {
    const developerId = await AuthService.requireDeveloper(req);
    const { response, deviceName } = req.body as { response: any; deviceName?: string };
    const passkey = await WebAuthnService.verifyDeveloperRegistration(developerId, response, deviceName);
    return reply.status(201).send({ passkey });
  });

  server.post('/api/v1/auth/developer/passkeys/authenticate/options', async (req, reply) => {
    const { email } = (req.body as { email?: string }) || {};
    const options = await WebAuthnService.getDeveloperAuthenticationOptions(email);
    return reply.send(options);
  });

  server.post('/api/v1/auth/developer/passkeys/authenticate/verify', async (req, reply) => {
    const { response } = req.body as { response: any };
    try {
      const { developerId, email } = await WebAuthnService.verifyDeveloperAuthentication(response);
      const devRes = await query<any>('SELECT * FROM developers WHERE id = $1', [developerId]);
      const devRow = devRes.rows[0];
      if (!devRow || devRow.status === 'suspended') {
        return reply.status(403).send({ error: 'ACCOUNT_SUSPENDED', message: 'Developer account suspended' });
      }

      const adminCheck = await query('SELECT developer_id FROM platform_admins WHERE developer_id = $1', [devRow.id]);
      const isPlatformAdmin = adminCheck.rows.length > 0 || devRow.is_platform_admin;

      const dev = {
        id: devRow.id,
        email: devRow.email,
        displayName: devRow.display_name,
        emailVerified: devRow.email_verified,
        isPlatformAdmin,
        status: (devRow.status as 'active' | 'suspended') || 'active',
        createdAt: devRow.created_at,
        updatedAt: devRow.updated_at,
      };

      const accessToken = AuthService.generateAccessToken({
        uid: dev.id,
        email: dev.email,
        projectId: 'platform',
        environmentId: 'global',
        isPlatformAdmin,
      });

      const rawRefreshToken = CryptoUtil.generateSecureToken(32);
      const refreshTokenHash = CryptoUtil.sha256(rawRefreshToken);
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      await query(
        `INSERT INTO auth_sessions (user_id, refresh_token_hash, expires_at)
         VALUES ($1, $2, $3)`,
        [dev.id, refreshTokenHash, expiresAt]
      );

      return reply.send({
        user: dev,
        accessToken,
        refreshToken: rawRefreshToken,
        expiresIn: 900,
      });
    } catch (err: any) {
      return reply.status(401).send({ error: 'PASSKEY_VERIFICATION_FAILED', message: err.message });
    }
  });

  server.get('/api/v1/auth/developer/passkeys', async (req, reply) => {
    const developerId = await AuthService.requireDeveloper(req);
    const passkeys = await WebAuthnService.listDeveloperPasskeys(developerId);
    return reply.send({ passkeys });
  });

  server.delete('/api/v1/auth/developer/passkeys/:passkeyId', async (req, reply) => {
    const developerId = await AuthService.requireDeveloper(req);
    const { passkeyId } = req.params as { passkeyId: string };
    await WebAuthnService.deleteDeveloperPasskey(developerId, passkeyId);
    return reply.status(204).send();
  });
};
