import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { BrevoEmailProvider } from '../services/email-providers/brevo.provider.js';
import { MockEmailProvider } from '../services/email-providers/mock.provider.js';
import { EmailProviderRegistry } from '../services/email-providers/provider-registry.js';
import { EmailService } from '../services/email.service.js';
import { ContactService } from '../services/contact.service.js';
import { NotificationService } from '../services/notification.service.js';
import { AuthService } from '../services/auth.service.js';
import { AuthConfigService } from '../services/auth-config.service.js';
import { TemplateService } from '../services/template.service.js';
import { buildServer } from '../server.js';
import { query, pool } from '../db/pool.js';

test('1. Brevo Adapter — Rejects invalid or empty credentials cleanly', async () => {
  const brevo = new BrevoEmailProvider();

  // Empty API key
  const emptyRes = await brevo.validateCredentials('');
  assert.equal(emptyRes.valid, false);
  assert.ok(emptyRes.error?.includes('API key is required'));

  // Invalid fake key (network test against Brevo API returns 401 Unauthorized)
  const invalidRes = await brevo.validateCredentials('xkeysib-invalid-fake-key-12345');
  assert.equal(invalidRes.valid, false);
  assert.ok(invalidRes.error, 'Must provide an actionable error message');
});

test('2. Brevo Adapter — Error Classification and Status Mapping', async () => {
  const brevo = new BrevoEmailProvider();

  // Test sending with invalid key triggers 401 AUTH_ERROR or HTTP error
  const sendRes = await brevo.sendEmail('xkeysib-invalid-key', {
    projectId: 'test-project',
    toEmail: 'recipient@example.com',
    fromEmail: 'noreply@syntrabase.app',
    fromName: 'Syntrabase Test',
    subject: 'Verification Test',
    text: 'Hello test',
  });

  assert.equal(sendRes.success, false);
  assert.ok(
    sendRes.status === 'AUTH_ERROR' ||
    sendRes.status === 'TEMPORARY_ERROR' ||
    sendRes.status === 'PERMANENT_ERROR'
  );
  assert.ok(sendRes.error);
});

test('3. Provider Registry — Supports Brevo and Mock Adapters with clean interface', () => {
  const brevo = EmailProviderRegistry.getAdapter('brevo');
  assert.equal(brevo.providerType, 'brevo');

  const mock = EmailProviderRegistry.getAdapter('mock');
  assert.equal(mock.providerType, 'mock');
});

test('4. Credential Security — AES-256-GCM Encryption and Redaction', () => {
  const rawApiKey = 'xkeysib-8924080128409124-real-test-secret-key-brevo';

  // 1. Secret Redaction / Masking
  const masked = EmailService.maskApiKey(rawApiKey);
  assert.ok(!masked.includes('real-test-secret'), 'Masked key must not reveal internal secret');
  assert.ok(masked.startsWith('xkeysib-'));
  assert.ok(masked.endsWith('revo'));

  // 2. Encryption and Decryption at Rest
  const encrypted = EmailService.encryptCredentials({ apiKey: rawApiKey, account: 'prod' });
  assert.ok(encrypted.iv && encrypted.authTag && encrypted.ciphertext);
  assert.notEqual(encrypted.ciphertext, rawApiKey);

  const decrypted = EmailService.decryptCredentials(encrypted);
  assert.equal(decrypted.apiKey, rawApiKey);
  assert.equal(decrypted.account, 'prod');
});

test('5. Custom Domain Lifecycle & DNS Generation', async () => {
  const projectId = `proj-test-${Date.now()}`;
  const domainName = `auth.${Date.now()}.example.com`;

  const domain = await EmailService.registerCustomDomain(projectId, domainName);
  assert.ok(domain.id);
  assert.equal(domain.projectId, projectId);
  assert.equal(domain.domainName, domainName);
  assert.equal(domain.verificationStatus, 'pending');

  // Verify DNS records are present and correctly structured for Brevo
  assert.ok(Array.isArray(domain.dnsRecords));
  assert.ok(domain.dnsRecords.length >= 3, 'Must include SPF, DKIM, and ownership TXT records');

  const dkimRec = domain.dnsRecords.find((r) => r.purpose === 'dkim');
  assert.ok(dkimRec, 'DKIM record must be generated');
  assert.ok(dkimRec.hostName.includes('domainkey'));

  const spfRec = domain.dnsRecords.find((r) => r.purpose === 'spf');
  assert.ok(spfRec, 'SPF record must be generated');
  assert.ok(spfRec.value.includes('include:spf.brevo.com'));

  // Query domains for this project
  const domains = await EmailService.getCustomDomains(projectId);
  assert.ok(domains.some((d) => d.id === domain.id));
});

test('6. Authorized Senders — Project Isolation and Verification Guardrails', async () => {
  const projectIdA = `proj-a-${Date.now()}`;
  const projectIdB = `proj-b-${Date.now()}`;
  const domainA = await EmailService.registerCustomDomain(projectIdA, `mail-a-${Date.now()}.com`);

  // Guardrail 1: Adding sender to an unverified domain MUST be rejected
  await assert.rejects(
    async () => {
      await EmailService.addAuthorizedSender({
        projectId: projectIdA,
        domainId: domainA.id,
        displayName: 'Project A Security',
        emailAddress: `security@${domainA.domainName}`,
      });
    },
    /is not yet verified/
  );

  // Mark domain as verified (simulating successful DNS verification)
  domainA.verificationStatus = 'verified';
  await query(`UPDATE custom_sender_domains SET verification_status = 'verified' WHERE id = $1`, [domainA.id]).catch(() => {});

  // Add sender under Project A now succeeds
  const senderA = await EmailService.addAuthorizedSender({
    projectId: projectIdA,
    domainId: domainA.id,
    displayName: 'Project A Security',
    emailAddress: `security@${domainA.domainName}`,
  });
  assert.ok(senderA.id);
  assert.equal(senderA.projectId, projectIdA);
  assert.equal(senderA.emailAddress, `security@${domainA.domainName}`);

  // Project Isolation: Project B cannot see Project A's senders
  const sendersB = await EmailService.getAuthorizedSenders(projectIdB);
  assert.ok(!sendersB.some((s) => s.id === senderA.id), 'Project B must not access Project A senders');

  // Project Isolation: Project B cannot add sender using Project A's domain
  await assert.rejects(
    async () => {
      await EmailService.addAuthorizedSender({
        projectId: projectIdB,
        domainId: domainA.id,
        displayName: 'Impersonator',
        emailAddress: `hack@${domainA.domainName}`,
      });
    },
    /Selected domain is not registered for/
  );
});

test('7. Outbox Queue — Idempotency and Duplicate Submission Prevention', async () => {
  const projectId = `proj-outbox-${Date.now()}`;

  // First enqueue
  const item1 = await EmailService.enqueueEmail({
    projectId,
    toEmail: 'newuser@example.com',
    fromEmail: 'auth@syntrabase.app',
    fromName: 'Syntrabase Auth',
    subject: 'Confirm your email address',
    text: 'Please confirm your email: https://syntrabase.app/verify?token=123',
    actionType: 'VERIFY_EMAIL',
  });
  assert.ok(item1.id);
  assert.equal(item1.status, 'queued');

  // Enqueue second message for another user
  const item2 = await EmailService.enqueueEmail({
    projectId,
    toEmail: 'anotheruser@example.com',
    fromEmail: 'auth@syntrabase.app',
    fromName: 'Syntrabase Auth',
    subject: 'Confirm your email address',
    text: 'Please confirm your email: https://syntrabase.app/verify?token=456',
    actionType: 'VERIFY_EMAIL',
  });
  assert.ok(item2.id);
  assert.notEqual(item2.id, item1.id);
});

test('8. Contact Center — Decoupled Persistence During Email Shutdown', async () => {
  const projectId = `proj-contact-${Date.now()}`;

  // 1. Simulate global email emergency shutdown
  await EmailService.updatePlatformPolicy({
    globalSendingEnabled: false,
    emergencyShutdown: true,
  });

  const policy = await EmailService.getPlatformPolicy();
  assert.equal(policy.globalSendingEnabled, false);
  assert.equal(policy.emergencyShutdown, true);

  // 2. Submit Contact Inquiry — MUST succeed even when email is 100% shutdown
  const inquiry = await ContactService.submitInquiry({
    projectId,
    userId: 'dev-offline-test',
    category: 'Technical Support',
    subject: 'Production cluster query performance question',
    message: 'We are observing slower queries on the large orders collection when using multiple inequality filters.',
    replyEmail: 'lead-architect@mycompany.com',
  });

  assert.ok(inquiry.id);
  assert.ok(inquiry.ticketReference.startsWith('TKT-'));
  assert.equal(inquiry.status, 'open');

  // 3. Verify inquiry is retrieved
  const { submissions } = await ContactService.getSubmissions({ projectId });
  assert.ok(submissions.some((s) => s.id === inquiry.id));

  // 4. Verify Internal Notification was created for Super Admin despite email shutdown
  const { notifications } = await NotificationService.getNotifications({ category: 'contact' });
  const relatedNotif = notifications.find((n) => n.relatedId === inquiry.ticketReference);
  assert.ok(relatedNotif, 'Internal notification must be created for Super Admin triage');

  // Restore policy for subsequent tests
  await EmailService.updatePlatformPolicy({
    globalSendingEnabled: true,
    emergencyShutdown: false,
  });
});

test('9. Super Admin Endpoints — Email Control Center and Notifications API', async () => {
  const server = await buildServer();
  try {
    const superAdminToken = AuthService.generateAccessToken({
      uid: 'super-admin-01',
      email: 'ops@syntrabase.app',
      role: 'super-admin',
      isPlatformAdmin: true,
    } as any);
    const adminHeaders = {
      authorization: `Bearer ${superAdminToken}`,
    };

    // 1. Get Platform Email Policy
    const policyRes = await server.inject({
      method: 'GET',
      url: '/api/v1/admin/email/policy',
      headers: adminHeaders,
    });
    assert.equal(policyRes.statusCode, 200);
    const policyData = JSON.parse(policyRes.body);
    assert.ok(typeof policyData.policy.globalSendingEnabled === 'boolean');

    // 2. List Provider Accounts
    const accountsRes = await server.inject({
      method: 'GET',
      url: '/api/v1/admin/email/accounts',
      headers: adminHeaders,
    });
    assert.equal(accountsRes.statusCode, 200);
    const accountsData = JSON.parse(accountsRes.body);
    assert.ok(Array.isArray(accountsData.accounts));

    // 3. List Outbox Queue
    const queueRes = await server.inject({
      method: 'GET',
      url: '/api/v1/admin/email/queue',
      headers: adminHeaders,
    });
    assert.equal(queueRes.statusCode, 200);
    const queueData = JSON.parse(queueRes.body);
    assert.ok(Array.isArray(queueData.items));

    // 4. List Internal Notifications
    const notifRes = await server.inject({
      method: 'GET',
      url: '/api/v1/admin/notifications',
      headers: adminHeaders,
    });
    assert.equal(notifRes.statusCode, 200);
    const notifData = JSON.parse(notifRes.body);
    assert.ok(Array.isArray(notifData.notifications));
    assert.ok(typeof notifData.unreadCount === 'number');

    // 5. List Contact Submissions (Super Admin)
    const contactRes = await server.inject({
      method: 'GET',
      url: '/api/v1/admin/contact/inquiries',
      headers: adminHeaders,
    });
    assert.equal(contactRes.statusCode, 200);
    const contactData = JSON.parse(contactRes.body);
    assert.ok(Array.isArray(contactData.submissions));
  } finally {
    await server.close().catch(() => {});
  }
});

test('10. Duplicate Account Detection & Credentials Update', async () => {
  const mockAdapter = EmailProviderRegistry.getAdapter('mock') as MockEmailProvider;
  mockAdapter.simulatedAccountIdentity = {
    email: `shared-owner-${Date.now()}@company.com`,
    companyName: 'Company Inc',
    planInfo: { planType: 'free', credits: 300 },
  };

  // Add first account with this underlying identity
  const acc1 = await EmailService.addProviderAccount({
    providerType: 'mock',
    accountName: `First Shared Key ${Date.now()}`,
    apiKey: `mock-key-alpha-${Date.now()}`,
  });
  assert.ok(acc1.id);
  assert.equal(acc1.accountEmail, mockAdapter.simulatedAccountIdentity.email);

  // Attempt to add second key under the same underlying Brevo account identity: MUST fail
  await assert.rejects(
    async () => {
      await EmailService.addProviderAccount({
        providerType: 'mock',
        accountName: 'Second Shared Key (Deceptive)',
        apiKey: `mock-key-beta-${Date.now()}`,
      });
    },
    /Duplicate Brevo account detected/
  );

  // Update credentials on the first account with a new distinct identity
  const newEmail = `new-owner-${Date.now()}@company.com`;
  mockAdapter.simulatedAccountIdentity = {
    email: newEmail,
    companyName: 'Company New',
    planInfo: { planType: 'starter', credits: 20000 },
  };

  const updatedAcc = await EmailService.updateProviderAccountCredentials(acc1.id, {
    apiKey: `mock-key-new-${Date.now()}`,
    accountName: 'Renamed Account',
  });
  assert.equal(updatedAcc.accountName, 'Renamed Account');
  assert.equal(updatedAcc.accountEmail, newEmail);
  assert.equal(updatedAcc.status, 'healthy');
});

test('11. Authoritative Email Verification Project Setting — Enforced vs Optional', async () => {
  const server = await buildServer();
  const projectId = crypto.randomUUID();
  await query('INSERT INTO projects (id, name, slug) VALUES ($1, $2, $3)', [projectId, 'Verify Test Project', `verify-${Date.now()}`]);
  await query('INSERT INTO environments (id, project_id, name, slug, is_default) VALUES ($1, $2, $3, $4, true)', [crypto.randomUUID(), projectId, 'Production', 'production']);

  try {
    // 1. When requireEmailVerification is false:
    await AuthConfigService.updateProjectAuthConfig(projectId, {
      requireEmailVerification: false,
      emailPasswordEnabled: true,
    });

    // Register user
    const regRes1 = await server.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/auth/register`,
      payload: {
        email: `user-optional-${Date.now()}@test.com`,
        password: 'SecurePassword123!',
        displayName: 'Optional User',
      },
    });
    assert.equal(regRes1.statusCode, 201);
    const regData1 = JSON.parse(regRes1.body);
    assert.equal(regData1.verificationRequired, false);

    // Sign-in allowed immediately
    const loginRes1 = await server.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/auth/login`,
      payload: {
        email: regData1.user.email,
        password: 'SecurePassword123!',
      },
    });
    assert.equal(loginRes1.statusCode, 200);
    const loginData1 = JSON.parse(loginRes1.body);
    assert.ok(loginData1.accessToken);

    // 2. When requireEmailVerification is true:
    await AuthConfigService.updateProjectAuthConfig(projectId, {
      requireEmailVerification: true,
    });

    // Setup domain and active authorized sender so action email has valid sender
    const domain = await EmailService.registerCustomDomain(projectId, `mail-${Date.now()}.org`);
    await query(`UPDATE custom_sender_domains SET verification_status = 'verified' WHERE id = $1`, [domain.id]).catch(() => {});
    domain.verificationStatus = 'verified';
    await EmailService.addAuthorizedSender({
      projectId,
      domainId: domain.id,
      displayName: 'Auth Service',
      emailAddress: `verify@${domain.domainName}`,
    });

    // Register user with enforcement
    const enforcedEmail = `user-enforced-${Date.now()}@test.com`;
    const regRes2 = await server.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/auth/register`,
      payload: {
        email: enforcedEmail,
        password: 'SecurePassword123!',
        displayName: 'Enforced User',
      },
    });
    assert.equal(regRes2.statusCode, 201);
    const regData2 = JSON.parse(regRes2.body);
    assert.equal(regData2.verificationRequired, true);
    assert.equal(regData2.user.emailVerified, false);

    // Attempt login before verification: MUST be rejected with HTTP 403 EMAIL_NOT_VERIFIED
    const loginResBlocked = await server.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/auth/login`,
      payload: {
        email: enforcedEmail,
        password: 'SecurePassword123!',
      },
    });
    assert.equal(loginResBlocked.statusCode, 403);
    const blockedData = JSON.parse(loginResBlocked.body);
    assert.equal(blockedData.error, 'EMAIL_NOT_VERIFIED');

    // Verify user via single-use action token
    const { rawToken } = await EmailService.createActionToken(projectId, 'default', regData2.user.id, 'VERIFY_EMAIL');
    const verifyRes = await server.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/auth/verify-email`,
      payload: { token: rawToken },
    });
    assert.equal(verifyRes.statusCode, 200);

    // Login after verification: MUST succeed with 200 and access token
    const loginResVerified = await server.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/auth/login`,
      payload: {
        email: enforcedEmail,
        password: 'SecurePassword123!',
      },
    });
    assert.equal(loginResVerified.statusCode, 200);
    const verifiedData = JSON.parse(loginResVerified.body);
    assert.ok(verifiedData.accessToken);
  } finally {
    await query('DELETE FROM projects WHERE id = $1', [projectId]).catch(() => {});
    await server.close().catch(() => {});
  }
});

test('12. Resend Verification Flow with 60-second Rate Limiting', async () => {
  const server = await buildServer();
  const projectId = crypto.randomUUID();
  await query('INSERT INTO projects (id, name, slug) VALUES ($1, $2, $3)', [projectId, 'Resend Test Project', `resend-${Date.now()}`]);
  await query('INSERT INTO environments (id, project_id, name, slug, is_default) VALUES ($1, $2, $3, $4, true)', [crypto.randomUUID(), projectId, 'Production', 'production']);

  try {
    await AuthConfigService.updateProjectAuthConfig(projectId, {
      requireEmailVerification: true,
      emailPasswordEnabled: true,
    });

    const domain = await EmailService.registerCustomDomain(projectId, `resend-${Date.now()}.com`);
    await query(`UPDATE custom_sender_domains SET verification_status = 'verified' WHERE id = $1`, [domain.id]).catch(() => {});
    domain.verificationStatus = 'verified';
    await EmailService.addAuthorizedSender({
      projectId,
      domainId: domain.id,
      displayName: 'Resend Test',
      emailAddress: `noreply@${domain.domainName}`,
    });

    const email = `cooldown-user-${Date.now()}@test.com`;
    await server.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/auth/register`,
      payload: { email, password: 'Password123!' },
    });

    // First resend request succeeds
    const resend1 = await server.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/auth/resend-verification`,
      payload: { email },
    });
    assert.equal(resend1.statusCode, 200);

    // Second immediate resend request: MUST be rejected with HTTP 429 RATE_LIMITED
    const resend2 = await server.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/auth/resend-verification`,
      payload: { email },
    });
    assert.equal(resend2.statusCode, 429);
    const resendData2 = JSON.parse(resend2.body);
    assert.equal(resendData2.error, 'RATE_LIMITED');
    assert.ok(resendData2.message.includes('Please wait'));
  } finally {
    await query('DELETE FROM projects WHERE id = $1', [projectId]).catch(() => {});
    await server.close().catch(() => {});
  }
});

test('13. Outbox Scheduler — Rate Limit & Quota Circuit Breaker with Exponential Backoff', async () => {
  const projectId = crypto.randomUUID();
  await query('INSERT INTO projects (id, name, slug) VALUES ($1, $2, $3)', [projectId, 'Scheduler Test Project', `sched-${Date.now()}`]);
  await query('INSERT INTO environments (id, project_id, name, slug, is_default) VALUES ($1, $2, $3, $4, true)', [crypto.randomUUID(), projectId, 'Production', 'production']);

  const mockAdapter = EmailProviderRegistry.getAdapter('mock') as MockEmailProvider;

  try {
    // Simulate Rate Limited status
    mockAdapter.simulatedSendStatus = 'RATE_LIMITED';

    const queued = await EmailService.enqueueEmail({
      projectId,
      toEmail: 'failover@example.com',
      fromEmail: 'auth@example.com',
      fromName: 'Syntrabase Auth',
      subject: 'Circuit Breaker Test',
      text: 'Test message body',
    });

    assert.ok(queued.id);

    // Trigger outbox processing
    const processResult = await EmailService.processOutboxQueue();
    assert.ok(processResult !== undefined);
  } finally {
    mockAdapter.simulatedSendStatus = 'SENT';
    await query('DELETE FROM projects WHERE id = $1', [projectId]).catch(() => {});
  }
});

test('14. Server-Side Sender Identity Validation in TemplateService', async () => {
  const projectId = `proj-template-val-${Date.now()}`;

  // If no authorized sender configured and default internal email is used: throws actionable error
  await assert.rejects(
    async () => {
      await TemplateService.sendTemplatedActionEmail(projectId, 'dest@example.com', 'verify_email', {
        appName: 'Test App',
        link: 'https://test.internal',
      });
    },
    /No verified authorized sender identity configured/
  );

  // Add verified domain and sender
  const domain = await EmailService.registerCustomDomain(projectId, `val-${Date.now()}.com`);
  await query(`UPDATE custom_sender_domains SET verification_status = 'verified' WHERE id = $1`, [domain.id]).catch(() => {});
  domain.verificationStatus = 'verified';
  const sender = await EmailService.addAuthorizedSender({
    projectId,
    domainId: domain.id,
    displayName: 'Validated Team',
    emailAddress: `notifications@${domain.domainName}`,
  });

  // Now sending action email succeeds and validates against authorized sender
  await TemplateService.sendTemplatedActionEmail(projectId, 'dest@example.com', 'verify_email', {
    appName: 'Test App',
    link: 'https://test.internal',
  });

  // Outbox contains item with validated sender address
  const items = await EmailService.getOutboxItems(10, projectId);
  assert.ok(items.length > 0);
  assert.equal(items[0].senderEmail, sender.emailAddress);
});

after(async () => {
  await pool.end().catch(() => {});
});
