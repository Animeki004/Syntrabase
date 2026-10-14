import crypto from 'crypto';
import { query } from '../db/pool.js';
import {
  EmailActionToken,
  EmailActionType,
  EmailProviderAccount,
  EmailProviderType,
  EmailPlatformPolicy,
  CustomSenderDomain,
  AuthorizedSenderIdentity,
  EmailOutboxItem,
  OutboundEmailParams,
  OutboundEmailResult,
} from '@syntrabase/shared-types';
import { EmailProviderRegistry } from './email-providers/provider-registry.js';
import { NotificationService } from './notification.service.js';

export class EmailDeliveryError extends Error {
  public statusCode = 502;
  public code = 'EMAIL_DELIVERY_FAILED';

  constructor(message: string) {
    super(message);
    this.name = 'EmailDeliveryError';
  }
}

// In-memory fallback stores for offline/unit test execution
const inMemoryActionTokens = new Map<string, EmailActionToken>();
const inMemoryProviderAccounts = new Map<string, EmailProviderAccount & { rawApiKey?: string }>();
const inMemoryCustomDomains = new Map<string, CustomSenderDomain>();
const inMemoryAuthorizedSenders = new Map<string, AuthorizedSenderIdentity>();
const inMemoryOutboxQueue = new Map<string, EmailOutboxItem>();
const inMemoryDeliveryLogs: Array<{
  projectId: string;
  recipientEmail: string;
  actionType: string;
  provider: string;
  status: 'sent' | 'failed';
  errorMessage?: string;
  createdAt: string;
}> = [];

let inMemoryPolicy: EmailPlatformPolicy = {
  id: 1,
  globalSendingEnabled: true,
  emergencyShutdown: false,
  dailyProjectCap: 500,
  maxRetryAttempts: 5,
  defaultProviderType: 'brevo',
  updatedAt: new Date().toISOString(),
};

// Encryption key for provider credentials (derived from env or constant for dev)
const ENCRYPTION_KEY = crypto
  .createHash('sha256')
  .update(process.env.CREDENTIALS_ENCRYPTION_KEY || 'syntrabase-default-dev-credential-key-32b')
  .digest();

function encryptCredentials(plain: string): { iv: string; authTag: string; ciphertext: string } {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  let ciphertext = cipher.update(plain, 'utf8', 'hex');
  ciphertext += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return { iv: iv.toString('hex'), authTag, ciphertext };
}

function decryptCredentials(encrypted: { iv: string; authTag: string; ciphertext: string }): string {
  const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, Buffer.from(encrypted.iv, 'hex'));
  decipher.setAuthTag(Buffer.from(encrypted.authTag, 'hex'));
  let plain = decipher.update(encrypted.ciphertext, 'hex', 'utf8');
  plain += decipher.final('utf8');
  return plain;
}

export class EmailService {
  // ===========================================================================
  // 1. CRYPTOGRAPHIC CREDENTIAL & TOKEN UTILITIES
  // ===========================================================================

  public static encryptCredentials(credentials: Record<string, any>): { iv: string; authTag: string; ciphertext: string } {
    return encryptCredentials(JSON.stringify(credentials));
  }

  public static decryptCredentials(encrypted: { iv: string; authTag: string; ciphertext: string }): Record<string, any> {
    const json = decryptCredentials(encrypted);
    return JSON.parse(json);
  }

  public static hashToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  }

  public static maskApiKey(apiKey: string): string {
    const trimmed = apiKey.trim();
    if (trimmed.length <= 8) return '****';
    const prefix = trimmed.slice(0, 8);
    const suffix = trimmed.slice(-4);
    return `${prefix}...${suffix}`;
  }

  // ===========================================================================
  // 2. AUTHENTICATION ACTION TOKENS (ATOMIC SINGLE-USE)
  // ===========================================================================

  public static async createActionToken(
    projectId: string,
    environmentId: string,
    userId: string,
    actionType: EmailActionType
  ): Promise<{ rawToken: string; actionToken: EmailActionToken }> {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const id = crypto.randomUUID();

    try {
      const res = await query<EmailActionToken>(
        `INSERT INTO email_action_tokens (id, project_id, environment_id, user_id, action_type, token_hash, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, project_id as "projectId", environment_id as "environmentId",
                   user_id as "userId", action_type as "actionType", token_hash as "tokenHash",
                   expires_at as "expiresAt", redeemed_at as "redeemedAt", created_at as "createdAt"`,
        [id, projectId, environmentId, userId, actionType, tokenHash, expiresAt]
      );
      return { rawToken, actionToken: res.rows[0] };
    } catch {
      const record: EmailActionToken = {
        id,
        projectId,
        environmentId,
        userId,
        actionType,
        tokenHash,
        expiresAt,
        createdAt: new Date().toISOString(),
      };
      inMemoryActionTokens.set(tokenHash, record);
      return { rawToken, actionToken: record };
    }
  }

  public static async redeemActionToken(
    rawToken: string,
    actionType: EmailActionType
  ): Promise<{ userId: string; projectId: string; environmentId: string }> {
    const tokenHash = this.hashToken(rawToken);

    try {
      const res = await query<{
        user_id: string;
        project_id: string;
        environment_id: string;
      }>(
        `UPDATE email_action_tokens
         SET redeemed_at = NOW()
         WHERE token_hash = $1
           AND action_type = $2
           AND redeemed_at IS NULL
           AND expires_at > NOW()
         RETURNING user_id, project_id, environment_id`,
        [tokenHash, actionType]
      );

      if (res.rowCount === 0) {
        throw new Error('TOKEN_EXPIRED_OR_ALREADY_USED');
      }

      return {
        userId: res.rows[0].user_id,
        projectId: res.rows[0].project_id,
        environmentId: res.rows[0].environment_id,
      };
    } catch (err: any) {
      if (err.message === 'TOKEN_EXPIRED_OR_ALREADY_USED') {
        throw err;
      }

      const token = inMemoryActionTokens.get(tokenHash);
      if (!token || token.actionType !== actionType) {
        throw new Error('TOKEN_EXPIRED_OR_ALREADY_USED');
      }
      if (token.redeemedAt || new Date(token.expiresAt) <= new Date()) {
        throw new Error('TOKEN_EXPIRED_OR_ALREADY_USED');
      }

      token.redeemedAt = new Date().toISOString();
      return {
        userId: token.userId,
        projectId: token.projectId,
        environmentId: token.environmentId,
      };
    }
  }

  // ===========================================================================
  // 3. PROVIDER ACCOUNT MANAGEMENT (SUPER ADMIN)
  // ===========================================================================

  public static async addProviderAccount(params: {
    providerType: EmailProviderType;
    accountName: string;
    apiKey: string;
    projectId?: string;
  }): Promise<EmailProviderAccount> {
    const cleanKey = params.apiKey.trim();
    if (!cleanKey) {
      throw new Error('API key is required');
    }

    const adapter = EmailProviderRegistry.getAdapter(params.providerType);
    const validation = await adapter.validateCredentials(cleanKey);

    if (!validation.valid) {
      throw new Error(`Credential validation failed: ${validation.error || 'Invalid API key'}`);
    }

    const accountEmail = validation.accountIdentity?.email;
    const companyName = validation.accountIdentity?.companyName;

    // Reject duplicate API keys or keys belonging to the same underlying Brevo account
    if (accountEmail) {
      try {
        const existingAcc = await query<any>(
          `SELECT id, account_name, account_email FROM email_provider_accounts WHERE LOWER(account_email) = LOWER($1) LIMIT 1`,
          [accountEmail]
        );
        if (existingAcc.rows.length > 0) {
          throw new Error(
            `Duplicate Brevo account detected: Underlying account identity "${accountEmail}" is already registered (account: "${existingAcc.rows[0].account_name}"). Multiple keys belonging to the same underlying Brevo account share one quota pool and cannot be counted as independent quota pools.`
          );
        }
      } catch (err: any) {
        if (err.message?.includes('Duplicate Brevo account detected')) {
          throw err;
        }
        for (const acc of inMemoryProviderAccounts.values()) {
          if (acc.accountEmail?.toLowerCase() === accountEmail.toLowerCase()) {
            throw new Error(
              `Duplicate Brevo account detected: Underlying account identity "${accountEmail}" is already registered (account: "${acc.accountName}"). Multiple keys belonging to the same underlying Brevo account share one quota pool and cannot be counted as independent quota pools.`
            );
          }
        }
      }
    }

    const encrypted = this.encryptCredentials({ apiKey: cleanKey });
    const maskedKey = this.maskApiKey(cleanKey);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const planInfo = validation.accountIdentity?.planInfo || {};

    try {
      const res = await query<any>(
        `INSERT INTO email_provider_accounts (
           id, provider_type, account_name, encrypted_credentials, masked_api_key,
           is_enabled, status, account_email, company_name, last_health_check_at, provider_plan_info,
           daily_sent_count, monthly_sent_count, daily_reset_at, monthly_reset_at,
           project_id, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, TRUE, 'healthy', $6, $7, $8, $9, 0, 0, NOW() + INTERVAL '1 day', NOW() + INTERVAL '30 days', $10, $8, $8)
         RETURNING id, project_id as "projectId", provider_type as "providerType", account_name as "accountName",
                   masked_api_key as "maskedApiKey", is_enabled as "isEnabled", status,
                   account_email as "accountEmail", company_name as "companyName",
                   last_health_check_at as "lastHealthCheckAt", last_error as "lastError",
                   daily_sent_count as "dailySentCount", monthly_sent_count as "monthlySentCount",
                   daily_reset_at as "dailyResetAt", monthly_reset_at as "monthlyResetAt",
                   paused_until as "pausedUntil", provider_plan_info as "providerPlanInfo",
                   created_at as "createdAt", updated_at as "updatedAt"`,
        [
          id,
          params.providerType,
          params.accountName.trim(),
          JSON.stringify(encrypted),
          maskedKey,
          accountEmail || null,
          companyName || null,
          now,
          JSON.stringify(planInfo),
          params.projectId || null,
        ]
      );
      return res.rows[0];
    } catch {
      const acc: EmailProviderAccount & { rawApiKey?: string } = {
        id,
        projectId: params.projectId,
        providerType: params.providerType,
        accountName: params.accountName.trim(),
        maskedApiKey: maskedKey,
        isEnabled: true,
        status: 'healthy',
        accountEmail,
        companyName,
        lastHealthCheckAt: now,
        providerPlanInfo: planInfo,
        dailySentCount: 0,
        monthlySentCount: 0,
        createdAt: now,
        updatedAt: now,
        rawApiKey: cleanKey,
      };
      inMemoryProviderAccounts.set(id, acc);
      return acc;
    }
  }

  public static async updateProviderAccountCredentials(
    id: string,
    params: { apiKey: string; accountName?: string }
  ): Promise<EmailProviderAccount> {
    const cleanKey = params.apiKey.trim();
    if (!cleanKey) {
      throw new Error('API key is required');
    }

    let providerType: EmailProviderType = 'brevo';
    try {
      const existing = await query<any>('SELECT provider_type FROM email_provider_accounts WHERE id = $1', [id]);
      if (existing.rows.length > 0) providerType = existing.rows[0].provider_type;
    } catch {
      const inMem = inMemoryProviderAccounts.get(id);
      if (inMem) providerType = inMem.providerType;
    }

    const adapter = EmailProviderRegistry.getAdapter(providerType);
    const validation = await adapter.validateCredentials(cleanKey);
    if (!validation.valid) {
      throw new Error(`Credential validation failed: ${validation.error || 'Invalid API key'}`);
    }

    const accountEmail = validation.accountIdentity?.email;
    const companyName = validation.accountIdentity?.companyName;
    const planInfo = validation.accountIdentity?.planInfo || {};

    if (accountEmail) {
      try {
        const dupCheck = await query<any>(
          `SELECT id, account_name FROM email_provider_accounts WHERE LOWER(account_email) = LOWER($1) AND id != $2 LIMIT 1`,
          [accountEmail, id]
        );
        if (dupCheck.rows.length > 0) {
          throw new Error(
            `Duplicate Brevo account detected: Underlying account identity "${accountEmail}" is already registered by another account ("${dupCheck.rows[0].account_name}"). Multiple keys belonging to the same underlying Brevo account share one quota pool.`
          );
        }
      } catch (err: any) {
        if (err.message?.includes('Duplicate Brevo account detected')) throw err;
        for (const [memId, acc] of inMemoryProviderAccounts.entries()) {
          if (memId !== id && acc.accountEmail?.toLowerCase() === accountEmail.toLowerCase()) {
            throw new Error(
              `Duplicate Brevo account detected: Underlying account identity "${accountEmail}" is already registered by another account ("${acc.accountName}").`
            );
          }
        }
      }
    }

    const encrypted = this.encryptCredentials({ apiKey: cleanKey });
    const maskedKey = this.maskApiKey(cleanKey);
    const now = new Date().toISOString();

    try {
      const res = await query<any>(
        `UPDATE email_provider_accounts
         SET encrypted_credentials = $1,
             masked_api_key = $2,
             account_name = COALESCE($3, account_name),
             account_email = $4,
             company_name = $5,
             provider_plan_info = $6,
             status = 'healthy',
             last_error = NULL,
             last_health_check_at = $7,
             updated_at = $7
         WHERE id = $8
         RETURNING id, provider_type as "providerType", account_name as "accountName",
                   masked_api_key as "maskedApiKey", is_enabled as "isEnabled", status,
                   account_email as "accountEmail", company_name as "companyName",
                   last_health_check_at as "lastHealthCheckAt", last_error as "lastError",
                   daily_sent_count as "dailySentCount", monthly_sent_count as "monthlySentCount",
                   daily_reset_at as "dailyResetAt", monthly_reset_at as "monthlyResetAt",
                   paused_until as "pausedUntil", provider_plan_info as "providerPlanInfo",
                   created_at as "createdAt", updated_at as "updatedAt"`,
        [
          JSON.stringify(encrypted),
          maskedKey,
          params.accountName?.trim() || null,
          accountEmail || null,
          companyName || null,
          JSON.stringify(planInfo),
          now,
          id,
        ]
      );
      if (res.rows.length === 0) throw new Error('Account not found');
      return res.rows[0];
    } catch (err: any) {
      if (err.message === 'Account not found') throw err;
      const acc = inMemoryProviderAccounts.get(id);
      if (!acc) throw new Error('Account not found');
      if (params.accountName) acc.accountName = params.accountName.trim();
      acc.maskedApiKey = maskedKey;
      acc.rawApiKey = cleanKey;
      acc.accountEmail = accountEmail;
      acc.companyName = companyName;
      acc.providerPlanInfo = planInfo;
      acc.status = 'healthy';
      acc.lastError = undefined;
      acc.lastHealthCheckAt = now;
      acc.updatedAt = now;
      return acc;
    }
  }

  public static async getProviderAccounts(projectId?: string | null): Promise<EmailProviderAccount[]> {
    try {
      let whereClause = '';
      const params: any[] = [];
      if (projectId !== undefined) {
        if (projectId === null) {
          whereClause = 'WHERE project_id IS NULL';
        } else {
          whereClause = 'WHERE project_id = $1';
          params.push(projectId);
        }
      }

      const res = await query<any>(
        `SELECT id, project_id as "projectId", provider_type as "providerType", account_name as "accountName",
                masked_api_key as "maskedApiKey", is_enabled as "isEnabled", status,
                account_email as "accountEmail", company_name as "companyName",
                last_health_check_at as "lastHealthCheckAt", last_error as "lastError",
                daily_sent_count as "dailySentCount", monthly_sent_count as "monthlySentCount",
                daily_reset_at as "dailyResetAt", monthly_reset_at as "monthlyResetAt",
                paused_until as "pausedUntil", provider_plan_info as "providerPlanInfo",
                created_at as "createdAt", updated_at as "updatedAt"
         FROM email_provider_accounts
         ${whereClause}
         ORDER BY created_at DESC`,
        params
      );

      // Fetch domain & sender associations across all accounts
      const domainRes = await query<any>(
        `SELECT d.id, d.domain_name as "domainName", d.project_id as "projectId",
                d.verification_status as "verificationStatus", d.provider_account_id as "providerAccountId",
                s.id as "senderId", s.display_name as "displayName", s.email_address as "emailAddress",
                s.status as "senderStatus"
         FROM custom_sender_domains d
         LEFT JOIN authorized_sender_identities s ON s.domain_id = d.id`
      ).catch(() => ({ rows: [] }));

      const domainMap = new Map<string, Array<{ id: string; domainName: string; projectId: string; verificationStatus: string }>>();
      const senderMap = new Map<string, Array<{ id: string; displayName: string; emailAddress: string; projectId: string; status: string }>>();

      for (const row of domainRes.rows) {
        if (!row.providerAccountId) continue;
        if (!domainMap.has(row.providerAccountId)) domainMap.set(row.providerAccountId, []);
        const domains = domainMap.get(row.providerAccountId)!;
        if (!domains.some((d) => d.id === row.id)) {
          domains.push({
            id: row.id,
            domainName: row.domainName,
            projectId: row.projectId,
            verificationStatus: row.verificationStatus,
          });
        }
        if (row.senderId) {
          if (!senderMap.has(row.providerAccountId)) senderMap.set(row.providerAccountId, []);
          const senders = senderMap.get(row.providerAccountId)!;
          if (!senders.some((s) => s.id === row.senderId)) {
            senders.push({
              id: row.senderId,
              displayName: row.displayName,
              emailAddress: row.emailAddress,
              projectId: row.projectId,
              status: row.senderStatus,
            });
          }
        }
      }

      // Check for accounts sharing the same email (quota pool sharing indicator)
      const emailCount = new Map<string, string[]>();
      for (const acc of res.rows) {
        if (acc.accountEmail) {
          const emailLower = acc.accountEmail.toLowerCase();
          const list = emailCount.get(emailLower) || [];
          list.push(acc.accountName);
          emailCount.set(emailLower, list);
        }
      }

      return res.rows.map((acc: any) => {
        const shared = acc.accountEmail ? (emailCount.get(acc.accountEmail.toLowerCase()) || []) : [];
        return {
          ...acc,
          associatedDomains: domainMap.get(acc.id) || [],
          authorizedSenders: senderMap.get(acc.id) || [],
          isSharedQuotaPool: shared.length > 1,
          sharedWithAccountName: shared.length > 1 ? shared.filter((n: string) => n !== acc.accountName).join(', ') : undefined,
        };
      });
    } catch {
      return Array.from(inMemoryProviderAccounts.values()).map(({ rawApiKey, ...rest }) => rest);
    }
  }

  public static async toggleProviderAccount(id: string, isEnabled: boolean): Promise<void> {
    try {
      await query(`UPDATE email_provider_accounts SET is_enabled = $1, updated_at = NOW() WHERE id = $2`, [isEnabled, id]);
    } catch {
      const acc = inMemoryProviderAccounts.get(id);
      if (acc) {
        acc.isEnabled = isEnabled;
        acc.updatedAt = new Date().toISOString();
      }
    }
  }

  public static async deleteProviderAccount(id: string, projectId?: string): Promise<void> {
    try {
      if (projectId) {
        await query(`DELETE FROM email_provider_accounts WHERE id = $1 AND project_id = $2`, [id, projectId]);
      } else {
        await query(`DELETE FROM email_provider_accounts WHERE id = $1`, [id]);
      }
    } catch {
      inMemoryProviderAccounts.delete(id);
    }
  }

  public static async revalidateProviderAccount(id: string): Promise<EmailProviderAccount> {
    let apiKey: string | null = null;
    let providerType: EmailProviderType = 'brevo';

    try {
      const res = await query<any>(`SELECT * FROM email_provider_accounts WHERE id = $1`, [id]);
      if (res.rows.length === 0) throw new Error('Account not found');
      const row = res.rows[0];
      providerType = row.provider_type;
      const decrypted = this.decryptCredentials(row.encrypted_credentials);
      apiKey = decrypted.apiKey;
    } catch (err: any) {
      const acc = inMemoryProviderAccounts.get(id);
      if (!acc) throw new Error('Account not found');
      apiKey = acc.rawApiKey || 'mock-key';
      providerType = acc.providerType;
    }

    const adapter = EmailProviderRegistry.getAdapter(providerType);
    const validation = await adapter.validateCredentials(apiKey!);
    const now = new Date().toISOString();

    const newStatus = validation.valid ? 'healthy' : 'invalid_credentials';
    const lastError = validation.valid ? null : validation.error;
    const planInfo = validation.accountIdentity?.planInfo || {};
    const companyName = validation.accountIdentity?.companyName || null;
    const accountEmail = validation.accountIdentity?.email || null;

    try {
      const res = await query<any>(
        `UPDATE email_provider_accounts
         SET status = $1, last_health_check_at = $2, last_error = $3,
             provider_plan_info = $4, company_name = COALESCE($5, company_name),
             account_email = COALESCE($6, account_email), updated_at = $2
         WHERE id = $7
         RETURNING id, provider_type as "providerType", account_name as "accountName",
                   masked_api_key as "maskedApiKey", is_enabled as "isEnabled", status,
                   account_email as "accountEmail", company_name as "companyName",
                   last_health_check_at as "lastHealthCheckAt", last_error as "lastError",
                   daily_sent_count as "dailySentCount", monthly_sent_count as "monthlySentCount",
                   daily_reset_at as "dailyResetAt", monthly_reset_at as "monthlyResetAt",
                   paused_until as "pausedUntil", provider_plan_info as "providerPlanInfo",
                   created_at as "createdAt", updated_at as "updatedAt"`,
        [newStatus, now, lastError, JSON.stringify(planInfo), companyName, accountEmail, id]
      );
      return res.rows[0];
    } catch {
      const acc = inMemoryProviderAccounts.get(id)!;
      acc.status = newStatus;
      acc.lastHealthCheckAt = now;
      acc.lastError = lastError || undefined;
      acc.providerPlanInfo = planInfo;
      if (companyName) acc.companyName = companyName;
      if (accountEmail) acc.accountEmail = accountEmail;
      acc.updatedAt = now;
      return acc;
    }
  }

  // ===========================================================================
  // 4. PLATFORM POLICY & EMERGENCY SHUTDOWN
  // ===========================================================================

  public static async getPlatformPolicy(): Promise<EmailPlatformPolicy> {
    try {
      const res = await query<any>(
        `SELECT id, global_sending_enabled as "globalSendingEnabled",
                emergency_shutdown as "emergencyShutdown",
                daily_project_cap as "dailyProjectCap",
                max_retry_attempts as "maxRetryAttempts",
                default_provider_type as "defaultProviderType",
                updated_at as "updatedAt"
         FROM email_platform_policy WHERE id = 1`
      );
      return res.rows[0] || inMemoryPolicy;
    } catch {
      return inMemoryPolicy;
    }
  }

  public static async updatePlatformPolicy(updates: Partial<EmailPlatformPolicy>): Promise<EmailPlatformPolicy> {
    try {
      const current = await this.getPlatformPolicy();
      const updated = { ...current, ...updates, updatedAt: new Date().toISOString() };
      await query(
        `UPDATE email_platform_policy
         SET global_sending_enabled = $1, emergency_shutdown = $2, daily_project_cap = $3,
             max_retry_attempts = $4, default_provider_type = $5, updated_at = NOW()
         WHERE id = 1`,
        [
          updated.globalSendingEnabled,
          updated.emergencyShutdown,
          updated.dailyProjectCap,
          updated.maxRetryAttempts,
          updated.defaultProviderType,
        ]
      );
      return updated;
    } catch {
      inMemoryPolicy = { ...inMemoryPolicy, ...updates, updatedAt: new Date().toISOString() };
      return inMemoryPolicy;
    }
  }

  // ===========================================================================
  // 5. CUSTOM DOMAINS & SENDER IDENTITIES (PROJECT-SCOPED)
  // ===========================================================================

  public static async registerCustomDomain(
    projectId: string,
    domainName: string,
    providerAccountId?: string
  ): Promise<CustomSenderDomain> {
    const cleanDomain = domainName.toLowerCase().trim();
    if (!cleanDomain || !cleanDomain.includes('.')) {
      throw new Error('A valid domain name is required (e.g. acme.com).');
    }

    // Retrieve requested or active provider account
    const accounts = await this.getProviderAccounts();
    let targetAccount = providerAccountId
      ? accounts.find((a) => a.id === providerAccountId)
      : accounts.find((a) => a.isEnabled && a.status === 'healthy') || accounts[0];

    if (!targetAccount) {
      throw new Error('No active email provider account available to register domain.');
    }

    const adapter = EmailProviderRegistry.getAdapter(targetAccount.providerType || 'brevo');

    let apiKey = 'mock-key';
    try {
      const fullAcc = await query<any>(`SELECT encrypted_credentials FROM email_provider_accounts WHERE id = $1`, [targetAccount.id]);
      if (fullAcc.rows.length > 0) {
        apiKey = this.decryptCredentials(fullAcc.rows[0].encrypted_credentials).apiKey;
      }
    } catch {
      apiKey = inMemoryProviderAccounts.get(targetAccount.id)?.rawApiKey || 'mock-key';
    }

    const { domainId: providerDomainId, authenticated, dnsRecords } = await adapter.getDomainDnsRecords(apiKey, cleanDomain);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    try {
      const res = await query<any>(
        `INSERT INTO custom_sender_domains (
           id, project_id, domain_name, provider_domain_id, provider_account_id,
           verification_status, dns_records, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (project_id, domain_name) DO UPDATE
         SET dns_records = $7, provider_account_id = COALESCE($5, custom_sender_domains.provider_account_id), updated_at = NOW()
         RETURNING id, project_id as "projectId", domain_name as "domainName",
                   provider_domain_id as "providerDomainId", provider_account_id as "providerAccountId",
                   verification_status as "verificationStatus", dns_records as "dnsRecords",
                   last_dns_check_at as "lastDnsCheckAt", last_error as "lastError",
                   created_at as "createdAt", verified_at as "verifiedAt"`,
        [id, projectId, cleanDomain, providerDomainId || null, targetAccount.id, authenticated ? 'verified' : 'pending', JSON.stringify(dnsRecords), now]
      );
      return res.rows[0];
    } catch {
      const dom: CustomSenderDomain = {
        id,
        projectId,
        domainName: cleanDomain,
        providerDomainId,
        providerAccountId: targetAccount.id,
        verificationStatus: authenticated ? 'verified' : 'pending',
        dnsRecords,
        createdAt: now,
      };
      inMemoryCustomDomains.set(`${projectId}_${cleanDomain}`, dom);
      return dom;
    }
  }

  public static async getCustomDomains(projectId: string): Promise<CustomSenderDomain[]> {
    try {
      const res = await query<any>(
        `SELECT id, project_id as "projectId", domain_name as "domainName",
                provider_domain_id as "providerDomainId", provider_account_id as "providerAccountId",
                verification_status as "verificationStatus", dns_records as "dnsRecords",
                last_dns_check_at as "lastDnsCheckAt", last_error as "lastError",
                created_at as "createdAt", verified_at as "verifiedAt"
         FROM custom_sender_domains
         WHERE project_id = $1
         ORDER BY created_at DESC`,
        [projectId]
      );
      return res.rows;
    } catch {
      return Array.from(inMemoryCustomDomains.values()).filter((d) => d.projectId === projectId);
    }
  }

  public static async verifyCustomDomain(projectId: string, domainId: string): Promise<CustomSenderDomain> {
    let domain: CustomSenderDomain | null = null;
    try {
      const res = await query<any>(
        `SELECT id, project_id as "projectId", domain_name as "domainName",
                provider_domain_id as "providerDomainId", provider_account_id as "providerAccountId",
                verification_status as "verificationStatus", dns_records as "dnsRecords",
                created_at as "createdAt"
         FROM custom_sender_domains
         WHERE id = $1 AND project_id = $2`,
        [domainId, projectId]
      );
      if (res.rows.length === 0) throw new Error('Domain not found');
      domain = res.rows[0];
    } catch {
      domain = Array.from(inMemoryCustomDomains.values()).find((d) => d.id === domainId && d.projectId === projectId) || null;
      if (!domain) throw new Error('Domain not found');
    }

    if (!domain) {
      throw new Error('Domain not found');
    }

    const accounts = await this.getProviderAccounts();
    // Prioritize the specifically associated provider account
    const targetAccount = domain.providerAccountId
      ? accounts.find((a) => a.id === domain.providerAccountId)
      : accounts.find((a) => a.isEnabled && a.status === 'healthy') || accounts[0];

    if (!targetAccount) {
      throw new Error('No email provider account available for domain verification');
    }

    const adapter = EmailProviderRegistry.getAdapter(targetAccount.providerType || 'brevo');

    let apiKey = 'mock-key';
    try {
      const fullAcc = await query<any>(`SELECT encrypted_credentials FROM email_provider_accounts WHERE id = $1`, [targetAccount.id]);
      if (fullAcc.rows.length > 0) {
        apiKey = this.decryptCredentials(fullAcc.rows[0].encrypted_credentials).apiKey;
      }
    } catch {
      apiKey = inMemoryProviderAccounts.get(targetAccount.id)?.rawApiKey || 'mock-key';
    }

    const result = await adapter.verifyDomain(apiKey, domain.domainName);
    const freshDns = await adapter.getDomainDnsRecords(apiKey, domain.domainName).catch(() => null);
    const now = new Date().toISOString();
    const newStatus = result.verified ? 'verified' : 'failed';

    const verifiedAtVal = newStatus === 'verified' ? now : null;
    const updatedDnsRecords = freshDns?.dnsRecords || domain.dnsRecords;

    try {
      const res = await query<any>(
        `UPDATE custom_sender_domains
         SET verification_status = $1,
             last_dns_check_at = $2,
             last_error = $3,
             verified_at = COALESCE($4, verified_at),
             dns_records = $5,
             provider_account_id = COALESCE(provider_account_id, $6),
             updated_at = NOW()
         WHERE id = $7
         RETURNING id, project_id as "projectId", domain_name as "domainName",
                   provider_domain_id as "providerDomainId", provider_account_id as "providerAccountId",
                   verification_status as "verificationStatus", dns_records as "dnsRecords",
                   last_dns_check_at as "lastDnsCheckAt", last_error as "lastError",
                   created_at as "createdAt", verified_at as "verifiedAt"`,
        [newStatus, now, result.error || null, verifiedAtVal, JSON.stringify(updatedDnsRecords), targetAccount.id, domainId]
      );
      return res.rows[0];
    } catch {
      if (!domain) throw new Error('Domain not found');
      domain.verificationStatus = newStatus;
      domain.lastDnsCheckAt = now;
      domain.lastError = result.error;
      domain.dnsRecords = updatedDnsRecords;
      domain.providerAccountId = targetAccount.id;
      if (result.verified) domain.verifiedAt = now;
      return domain;
    }
  }

  public static async deleteCustomDomain(projectId: string, domainId: string): Promise<void> {
    try {
      const res = await query<any>(
        `SELECT d.*, a.encrypted_credentials, a.provider_type
         FROM custom_sender_domains d
         LEFT JOIN email_provider_accounts a ON a.id = d.provider_account_id
         WHERE d.id = $1 AND d.project_id = $2`,
        [domainId, projectId]
      );
      if (res.rows.length > 0) {
        const row = res.rows[0];
        if (row.encrypted_credentials) {
          try {
            const apiKey = this.decryptCredentials(row.encrypted_credentials).apiKey;
            const adapter = EmailProviderRegistry.getAdapter(row.provider_type || 'brevo');
            if (adapter.deleteDomain) {
              await adapter.deleteDomain(apiKey, row.domain_name).catch(() => {});
            }
          } catch {}
        }
      }
      await query(`DELETE FROM custom_sender_domains WHERE id = $1 AND project_id = $2`, [domainId, projectId]);
    } catch {
      for (const [key, d] of inMemoryCustomDomains.entries()) {
        if (d.id === domainId && d.projectId === projectId) {
          inMemoryCustomDomains.delete(key);
        }
      }
    }
  }

  public static async syncCloudflareDns(params: {
    projectId: string;
    domainId: string;
    cloudflareToken: string;
  }): Promise<{
    success: boolean;
    recordsCreated: number;
    recordsUpdated: number;
    recordsDeleted: number;
    domain: CustomSenderDomain;
    message: string;
  }> {
    const { projectId, domainId, cloudflareToken } = params;
    if (!cloudflareToken || typeof cloudflareToken !== 'string' || cloudflareToken.trim().length === 0) {
      throw new Error('Cloudflare API Token is required with Zone.DNS:Edit permissions.');
    }

    // 1. Fetch domain from DB
    const domains = await this.getCustomDomains(projectId);
    const domain = domains.find((d) => d.id === domainId);
    if (!domain) {
      throw new Error('Custom domain not found for this project.');
    }

    const cleanDomain = domain.domainName.toLowerCase().trim();

    // 2. Fetch required DNS records from provider adapter (Brevo)
    const accounts = await this.getProviderAccounts();
    const activeAccount = accounts.find((a) => a.isEnabled && a.status === 'healthy') || accounts[0];
    const adapter = EmailProviderRegistry.getAdapter(activeAccount?.providerType || 'brevo');

    let apiKey = 'mock-key';
    if (activeAccount) {
      try {
        const fullAcc = await query<any>(`SELECT encrypted_credentials FROM email_provider_accounts WHERE id = $1`, [activeAccount.id]);
        apiKey = this.decryptCredentials(fullAcc.rows[0].encrypted_credentials).apiKey;
      } catch {
        apiKey = inMemoryProviderAccounts.get(activeAccount.id)?.rawApiKey || 'mock-key';
      }
    }

    const { dnsRecords } = await adapter.getDomainDnsRecords(apiKey, cleanDomain);

    // 3. Find Zone in Cloudflare
    const domainParts = cleanDomain.split('.');
    const apexDomain = domainParts.length > 2 ? domainParts.slice(-2).join('.') : cleanDomain;

    const cfHeaders = {
      Authorization: `Bearer ${cloudflareToken.trim()}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    const zoneRes = await fetch(`https://api.cloudflare.com/client/v4/zones?name=${apexDomain}&status=active`, {
      method: 'GET',
      headers: cfHeaders,
    });

    if (!zoneRes.ok) {
      const errText = await zoneRes.text();
      throw new Error(`Cloudflare authentication failed (${zoneRes.status}): ${errText}`);
    }

    const zoneData: any = await zoneRes.json();
    if (!zoneData.success || !zoneData.result || zoneData.result.length === 0) {
      throw new Error(`Cloudflare zone not found for apex domain "${apexDomain}". Verify that your Cloudflare API token has Zone:Read and DNS:Edit permissions.`);
    }

    const zoneId = zoneData.result[0].id;

    // 4. List existing Cloudflare DNS records in zone
    const listDnsRes = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records?per_page=100`, {
      method: 'GET',
      headers: cfHeaders,
    });

    const listDnsData: any = await listDnsRes.json();
    const existingRecords: any[] = listDnsData.result || [];

    let recordsCreated = 0;
    let recordsUpdated = 0;
    let recordsDeleted = 0;

    // 5. Clean up duplicate / obsolete SPF records and obsolete brevo-code tokens
    const existingSpf = existingRecords.filter((r) => r.type === 'TXT' && (r.content || '').startsWith('v=spf1') && (r.name === cleanDomain || r.name === apexDomain));
    let mergedSpfInclude = 'include:spf.brevo.com';
    if (existingSpf.length > 0) {
      const allIncludes = new Set<string>();
      allIncludes.add('include:spf.brevo.com');
      for (const rec of existingSpf) {
        const matches = (rec.content || '').match(/include:[^\s]+/g);
        if (matches) {
          matches.forEach((m: string) => allIncludes.add(m));
        }
      }
      mergedSpfInclude = Array.from(allIncludes).join(' ');

      if (existingSpf.length > 1) {
        for (let i = 1; i < existingSpf.length; i++) {
          await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/${existingSpf[i].id}`, {
            method: 'DELETE',
            headers: cfHeaders,
          }).catch(() => {});
          recordsDeleted++;
        }
      }
    }

    // Clean up outdated brevo-code tokens
    const expectedBrevoCodeRec = dnsRecords.find((r) => r.purpose === 'ownership');
    if (expectedBrevoCodeRec) {
      const oldCodeRecs = existingRecords.filter(
        (r) => r.type === 'TXT' && (r.content || '').includes('brevo-code') && r.content !== expectedBrevoCodeRec.value
      );
      for (const oldRec of oldCodeRecs) {
        await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/${oldRec.id}`, {
          method: 'DELETE',
          headers: cfHeaders,
        }).catch(() => {});
        recordsDeleted++;
      }
    }

    // 6. Push / Update each required record into Cloudflare
    const syncErrors: string[] = [];

    for (const rec of dnsRecords) {
      let fullName = rec.hostName === '@' ? cleanDomain : `${rec.hostName}.${cleanDomain}`;
      if (rec.hostName.endsWith(`.${cleanDomain}`)) {
        fullName = rec.hostName;
      }

      let contentValue = (rec.value || '').trim();
      // RFC 1035: Cloudflare API automatically adds quotation marks on behalf of the user for TXT records.
      // Strip any extra outer quotes so it never gets saved as double-quoted in Cloudflare (""brevo-code..."")
      if (rec.type === 'TXT' && contentValue.startsWith('"') && contentValue.endsWith('"')) {
        contentValue = contentValue.slice(1, -1).trim();
      }

      if (rec.purpose === 'spf') {
        let cleanSpf = mergedSpfInclude.trim();
        if (cleanSpf.startsWith('"') && cleanSpf.endsWith('"')) {
          cleanSpf = cleanSpf.slice(1, -1).trim();
        }
        contentValue = `v=spf1 ${cleanSpf} ~all`;
      }

      const match = existingRecords.find(
        (r) => r.type === rec.type && r.name.toLowerCase() === fullName.toLowerCase()
      );

      const payload = {
        type: rec.type,
        name: fullName,
        content: contentValue,
        ttl: 3600,
        proxied: false, // CRITICAL: DNS Only / Grey Cloud for email records
      };

      if (match) {
        const updateRes = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/${match.id}`, {
          method: 'PUT',
          headers: cfHeaders,
          body: JSON.stringify(payload),
        });
        if (updateRes.ok) {
          recordsUpdated++;
        } else {
          const errData: any = await updateRes.json().catch(() => ({}));
          const errMsg = errData?.errors?.[0]?.message || updateRes.statusText;
          syncErrors.push(`Failed to update ${rec.type} ${fullName}: ${errMsg}`);
        }
      } else {
        const createRes = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`, {
          method: 'POST',
          headers: cfHeaders,
          body: JSON.stringify(payload),
        });
        if (createRes.ok) {
          recordsCreated++;
        } else {
          const errData: any = await createRes.json().catch(() => ({}));
          const errMsg = errData?.errors?.[0]?.message || createRes.statusText;
          // Code 81057/81058: Record already exists in zone with identical values
          if (errData?.errors?.[0]?.code === 81057 || errData?.errors?.[0]?.code === 81058 || (errMsg && errMsg.includes('already exists'))) {
            recordsUpdated++;
          } else {
            syncErrors.push(`Failed to add ${rec.type} ${fullName}: ${errMsg}`);
          }
        }
      }
    }

    if (recordsCreated === 0 && recordsUpdated === 0 && syncErrors.length > 0) {
      throw new Error(`Cloudflare DNS synchronization error: ${syncErrors[0]}`);
    }

    // 7. Re-evaluate and authenticate domain
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const verifiedDomain = await this.verifyCustomDomain(projectId, domainId);

    return {
      success: true,
      recordsCreated,
      recordsUpdated,
      recordsDeleted,
      domain: verifiedDomain,
      message: `Cloudflare DNS synchronized successfully (${recordsCreated} created, ${recordsUpdated} updated, ${recordsDeleted} obsolete cleaned). Proxy disabled (DNS only) on all CNAMEs.`,
    };
  }

  public static async addAuthorizedSender(params: {
    projectId: string;
    domainId: string;
    displayName: string;
    emailAddress: string;
  }): Promise<AuthorizedSenderIdentity> {
    const cleanEmail = params.emailAddress.toLowerCase().trim();
    const cleanName = params.displayName.trim();

    // Verify domain belongs to project and is verified
    const domains = await this.getCustomDomains(params.projectId);
    const domain = domains.find((d) => d.id === params.domainId);
    if (!domain) {
      throw new Error('Selected domain is not registered for this project.');
    }
    if (domain.verificationStatus !== 'verified') {
      throw new Error(`Cannot authorize sender: Domain ${domain.domainName} is not yet verified.`);
    }
    if (!cleanEmail.endsWith(`@${domain.domainName}`)) {
      throw new Error(`Sender email (${cleanEmail}) must match the domain @${domain.domainName}`);
    }

    // Register with domain's associated provider account
    const accounts = await this.getProviderAccounts();
    const targetAccount = domain.providerAccountId
      ? accounts.find((a) => a.id === domain.providerAccountId)
      : accounts.find((a) => a.isEnabled && a.status === 'healthy') || accounts[0];

    if (!targetAccount) {
      throw new Error('No email provider account available to register sender identity.');
    }

    const adapter = EmailProviderRegistry.getAdapter(targetAccount.providerType || 'brevo');

    let apiKey = 'mock-key';
    try {
      const fullAcc = await query<any>(`SELECT encrypted_credentials FROM email_provider_accounts WHERE id = $1`, [targetAccount.id]);
      if (fullAcc.rows.length > 0) {
        apiKey = this.decryptCredentials(fullAcc.rows[0].encrypted_credentials).apiKey;
      }
    } catch {
      apiKey = inMemoryProviderAccounts.get(targetAccount.id)?.rawApiKey || 'mock-key';
    }

    const { senderId } = await adapter.registerSender(apiKey, { name: cleanName, email: cleanEmail });
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    try {
      const res = await query<any>(
        `INSERT INTO authorized_sender_identities (
           id, project_id, domain_id, display_name, email_address, provider_sender_id, status, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, 'active', $7)
         RETURNING id, project_id as "projectId", domain_id as "domainId",
                   display_name as "displayName", email_address as "emailAddress",
                   provider_sender_id as "providerSenderId", status, created_at as "createdAt"`,
        [id, params.projectId, params.domainId, cleanName, cleanEmail, senderId, now]
      );
      return res.rows[0];
    } catch {
      const sender: AuthorizedSenderIdentity = {
        id,
        projectId: params.projectId,
        domainId: params.domainId,
        displayName: cleanName,
        emailAddress: cleanEmail,
        providerSenderId: senderId,
        status: 'active',
        createdAt: now,
      };
      inMemoryAuthorizedSenders.set(`${params.projectId}_${cleanEmail}`, sender);
      return sender;
    }
  }

  public static async getAuthorizedSenders(projectId: string): Promise<AuthorizedSenderIdentity[]> {
    try {
      const res = await query<any>(
        `SELECT id, project_id as "projectId", domain_id as "domainId",
                display_name as "displayName", email_address as "emailAddress",
                provider_sender_id as "providerSenderId", status, created_at as "createdAt"
         FROM authorized_sender_identities
         WHERE project_id = $1
         ORDER BY created_at DESC`,
        [projectId]
      );
      return res.rows;
    } catch {
      return Array.from(inMemoryAuthorizedSenders.values()).filter((s) => s.projectId === projectId);
    }
  }

  public static async deleteAuthorizedSender(projectId: string, senderId: string): Promise<void> {
    try {
      const res = await query<any>(
        `SELECT s.*, d.provider_account_id, a.encrypted_credentials, a.provider_type
         FROM authorized_sender_identities s
         JOIN custom_sender_domains d ON d.id = s.domain_id
         LEFT JOIN email_provider_accounts a ON a.id = d.provider_account_id
         WHERE s.id = $1 AND s.project_id = $2`,
        [senderId, projectId]
      );
      if (res.rows.length > 0) {
        const row = res.rows[0];
        if (row.encrypted_credentials && row.provider_sender_id) {
          try {
            const apiKey = this.decryptCredentials(row.encrypted_credentials).apiKey;
            const adapter = EmailProviderRegistry.getAdapter(row.provider_type || 'brevo');
            if (adapter.deleteSender) {
              await adapter.deleteSender(apiKey, row.provider_sender_id).catch(() => {});
            }
          } catch {}
        }
      }
      await query(`DELETE FROM authorized_sender_identities WHERE id = $1 AND project_id = $2`, [senderId, projectId]);
    } catch {
      for (const [k, s] of inMemoryAuthorizedSenders.entries()) {
        if (s.id === senderId && s.projectId === projectId) inMemoryAuthorizedSenders.delete(k);
      }
    }
  }

  // ===========================================================================
  // 6. DURABLE EMAIL OUTBOX QUEUE & ROUTER
  // ===========================================================================

  public static async enqueueEmail(params: OutboundEmailParams): Promise<EmailOutboxItem> {
    const policy = await this.getPlatformPolicy();

    if (policy.emergencyShutdown) {
      throw new EmailDeliveryError('Email delivery is paused due to emergency shutdown.');
    }
    if (!policy.globalSendingEnabled) {
      throw new EmailDeliveryError('Global outbound email sending is currently disabled.');
    }

    const id = crypto.randomUUID();
    const idempotencyKey = `${params.projectId}_${params.toEmail}_${params.actionType || 'custom'}_${Date.now()}`;
    const now = new Date().toISOString();

    let item: EmailOutboxItem;

    try {
      const res = await query<any>(
        `INSERT INTO email_outbox_queue (
           id, project_id, recipient_email, recipient_name, sender_email, sender_name,
           reply_to, subject, html_body, text_body, action_type, status, attempts,
           max_attempts, next_retry_at, idempotency_key, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'queued', 0, $12, NOW(), $13, $14)
         RETURNING id, project_id as "projectId", recipient_email as "recipientEmail",
                   recipient_name as "recipientName", sender_email as "senderEmail",
                   sender_name as "senderName", reply_to as "replyTo", subject,
                   html_body as "htmlBody", text_body as "textBody", action_type as "actionType",
                   status, attempts, max_attempts as "maxAttempts", next_retry_at as "nextRetryAt",
                   idempotency_key as "idempotencyKey", created_at as "createdAt"`,
        [
          id,
          params.projectId,
          params.toEmail,
          params.toName || null,
          params.fromEmail,
          params.fromName,
          params.replyTo || null,
          params.subject,
          params.html || null,
          params.text || null,
          params.actionType || 'custom',
          policy.maxRetryAttempts,
          idempotencyKey,
          now,
        ]
      );
      item = res.rows[0];
    } catch {
      item = {
        id,
        projectId: params.projectId,
        recipientEmail: params.toEmail,
        recipientName: params.toName,
        senderEmail: params.fromEmail,
        senderName: params.fromName,
        replyTo: params.replyTo,
        subject: params.subject,
        htmlBody: params.html,
        textBody: params.text,
        actionType: params.actionType || 'custom',
        status: 'queued',
        attempts: 0,
        maxAttempts: policy.maxRetryAttempts,
        nextRetryAt: now,
        idempotencyKey,
        createdAt: now,
      };
      inMemoryOutboxQueue.set(id, item);
    }

    // Trigger asynchronous queue processor immediately
    this.processOutboxQueue().catch((err) => {
      console.error('[EMAIL QUEUE WORKER ERROR]', err);
    });

    return item;
  }

  /**
   * Performs automatic health recovery and resets daily/monthly observed usage counters.
   */
  public static async reconcileProviderAccounts(): Promise<void> {
    try {
      // 1. Unpause accounts whose pause timer has elapsed
      await query(`
        UPDATE email_provider_accounts
        SET status = 'healthy', paused_until = NULL, last_error = NULL, updated_at = NOW()
        WHERE paused_until IS NOT NULL AND paused_until <= NOW()
      `).catch(() => {});

      // 2. Daily counter reset
      await query(`
        UPDATE email_provider_accounts
        SET daily_sent_count = 0,
            daily_reset_at = NOW() + INTERVAL '1 day',
            status = CASE WHEN status = 'quota_exhausted' THEN 'healthy' ELSE status END,
            updated_at = NOW()
        WHERE daily_reset_at IS NOT NULL AND daily_reset_at <= NOW()
      `).catch(() => {});

      // 3. Monthly counter reset
      await query(`
        UPDATE email_provider_accounts
        SET monthly_sent_count = 0,
            monthly_reset_at = NOW() + INTERVAL '30 days',
            updated_at = NOW()
        WHERE monthly_reset_at IS NOT NULL AND monthly_reset_at <= NOW()
      `).catch(() => {});
    } catch {
      // In-memory fallback
      const now = Date.now();
      for (const acc of inMemoryProviderAccounts.values()) {
        if (acc.pausedUntil && new Date(acc.pausedUntil).getTime() <= now) {
          acc.pausedUntil = undefined;
          acc.status = 'healthy';
          acc.lastError = undefined;
        }
        if (acc.dailyResetAt && new Date(acc.dailyResetAt).getTime() <= now) {
          acc.dailySentCount = 0;
          acc.dailyResetAt = new Date(now + 24 * 3600 * 1000).toISOString();
          if (acc.status === 'quota_exhausted') acc.status = 'healthy';
        }
      }
    }
  }

  /**
   * Processes queued & deferred outbox items using persistent, concurrency-safe scheduler with multi-account failover.
   */
  public static async processOutboxQueue(): Promise<{ processed: number; sent: number; failed: number }> {
    const policy = await this.getPlatformPolicy();
    if (policy.emergencyShutdown || !policy.globalSendingEnabled) {
      return { processed: 0, sent: 0, failed: 0 };
    }

    // 1. Reconcile paused accounts and daily reset counters
    await this.reconcileProviderAccounts();

    // 2. Select pending items with concurrency protection
    let pendingItems: EmailOutboxItem[] = [];
    try {
      const res = await query<any>(
        `SELECT id, project_id as "projectId", recipient_email as "recipientEmail",
                recipient_name as "recipientName", sender_email as "senderEmail",
                sender_name as "senderName", reply_to as "replyTo", subject,
                html_body as "htmlBody", text_body as "textBody", action_type as "actionType",
                status, attempts, max_attempts as "maxAttempts", next_retry_at as "nextRetryAt"
         FROM email_outbox_queue
         WHERE status IN ('queued', 'deferred') AND next_retry_at <= NOW()
         ORDER BY created_at ASC
         LIMIT 20
         FOR UPDATE SKIP LOCKED`
      );
      pendingItems = res.rows;
    } catch {
      pendingItems = Array.from(inMemoryOutboxQueue.values()).filter(
        (i) => (i.status === 'queued' || i.status === 'deferred') && new Date(i.nextRetryAt || 0) <= new Date()
      );
    }

    if (pendingItems.length === 0) return { processed: 0, sent: 0, failed: 0 };

    // 3. Load all enabled accounts
    const allAccounts = await this.getProviderAccounts();
    const nowMs = Date.now();

    // Filter baseline operational accounts
    const operationalAccounts = allAccounts.filter((a) => {
      if (!a.isEnabled) return false;
      if (a.status === 'invalid_credentials' || a.status === 'disabled') return false;
      if (a.status === 'quota_exhausted') return false;
      if (a.pausedUntil && new Date(a.pausedUntil).getTime() > nowMs) return false;
      return true;
    });

    let sentCount = 0;
    let failedCount = 0;

    for (const item of pendingItems) {
      // Extract sender domain
      const senderDomain = item.senderEmail.split('@')[1]?.toLowerCase().trim();

      // Look up custom domain configuration for this project
      let domainRecord: CustomSenderDomain | null = null;
      try {
        const domRes = await query<any>(
          `SELECT id, domain_name as "domainName", provider_account_id as "providerAccountId",
                  verification_status as "verificationStatus"
           FROM custom_sender_domains
           WHERE project_id = $1 AND LOWER(domain_name) = $2
           LIMIT 1`,
          [item.projectId, senderDomain]
        );
        if (domRes.rows.length > 0) domainRecord = domRes.rows[0];
      } catch {
        domainRecord = Array.from(inMemoryCustomDomains.values()).find(
          (d) => d.projectId === item.projectId && d.domainName.toLowerCase() === senderDomain
        ) || null;
      }

      // Prioritize eligible accounts:
      // Check if project has dedicated custom Brevo accounts; if so, use them exclusively
      const projectDedicated = operationalAccounts.filter((a) => a.projectId === item.projectId);
      const availablePool = projectDedicated.length > 0
        ? projectDedicated
        : operationalAccounts.filter((a) => !a.projectId);

      let eligibleCandidates: EmailProviderAccount[] = [];

      if (domainRecord?.providerAccountId) {
        const boundAcc = availablePool.find((a) => a.id === domainRecord.providerAccountId);
        if (boundAcc) {
          eligibleCandidates.push(boundAcc);
        }
      }

      // Add remaining eligible accounts sorted by observed daily usage
      const remainingAccounts = availablePool
        .filter((a) => !eligibleCandidates.some((c) => c.id === a.id))
        .sort((a, b) => {
          const sentA = a.dailySentCount || 0;
          const sentB = b.dailySentCount || 0;
          if (sentA !== sentB) return sentA - sentB;
          const credA = a.providerPlanInfo?.credits ?? 0;
          const credB = b.providerPlanInfo?.credits ?? 0;
          return credB - credA;
        });

      eligibleCandidates = [...eligibleCandidates, ...remainingAccounts];

      // If no eligible accounts available: preserve queued message
      if (eligibleCandidates.length === 0) {
        await this.deferItem(item, 'Preserved in queue: No operational or unpaused provider account currently eligible.');
        failedCount++;
        continue;
      }

      let itemDispatched = false;

      // Try sending with failover across eligible candidates
      for (const account of eligibleCandidates) {
        let apiKey = 'mock-key';
        try {
          const fullAcc = await query<any>(
            `SELECT encrypted_credentials FROM email_provider_accounts WHERE id = $1`,
            [account.id]
          );
          if (fullAcc.rows.length > 0) {
            apiKey = this.decryptCredentials(fullAcc.rows[0].encrypted_credentials).apiKey;
          }
        } catch {
          apiKey = inMemoryProviderAccounts.get(account.id)?.rawApiKey || 'mock-key';
        }

        // Determine effective sender email that the email provider will accept
        let effectiveSenderEmail = item.senderEmail;
        const isPlaceholder =
          effectiveSenderEmail.endsWith('@syntrabase.app') ||
          effectiveSenderEmail.endsWith('@syntrabase.internal') ||
          effectiveSenderEmail.endsWith('@localhost');

        if (isPlaceholder || (domainRecord && domainRecord.verificationStatus !== 'verified')) {
          // Check for active authorized sender identity for this project or platform
          try {
            const senderRes = await query<{ email_address: string }>(
              `SELECT email_address FROM authorized_sender_identities
               WHERE (project_id = $1 OR project_id = 'platform') AND status = 'active'
               LIMIT 1`,
              [item.projectId]
            );
            if (senderRes.rows.length > 0 && senderRes.rows[0].email_address) {
              effectiveSenderEmail = senderRes.rows[0].email_address;
            } else if (account.accountEmail) {
              effectiveSenderEmail = account.accountEmail;
            }
          } catch {
            if (account.accountEmail) {
              effectiveSenderEmail = account.accountEmail;
            }
          }
        }

        const adapter = EmailProviderRegistry.getAdapter(account.providerType);
        let result = await adapter.sendEmail(apiKey, {
          projectId: item.projectId,
          toEmail: item.recipientEmail,
          toName: item.recipientName,
          fromEmail: effectiveSenderEmail,
          fromName: item.senderName,
          replyTo: item.replyTo || effectiveSenderEmail,
          subject: item.subject,
          html: item.htmlBody,
          text: item.textBody,
          queueId: item.id,
        });

        // Failover: If provider rejects unverified custom domain / sender, retry immediately with account owner email
        if (!result.success && result.status === 'DOMAIN_ERROR' && account.accountEmail && effectiveSenderEmail !== account.accountEmail) {
          result = await adapter.sendEmail(apiKey, {
            projectId: item.projectId,
            toEmail: item.recipientEmail,
            toName: item.recipientName,
            fromEmail: account.accountEmail,
            fromName: item.senderName,
            replyTo: item.replyTo || effectiveSenderEmail,
            subject: item.subject,
            html: item.htmlBody,
            text: item.textBody,
            queueId: item.id,
          });
        }

        const nowIso = new Date().toISOString();

        if (result.status === 'SENT') {
          // Success!
          sentCount++;
          itemDispatched = true;

          // Increment observed usage counters atomically
          await query(
            `UPDATE email_provider_accounts
             SET daily_sent_count = daily_sent_count + 1,
                 monthly_sent_count = monthly_sent_count + 1,
                 updated_at = NOW()
             WHERE id = $1`,
            [account.id]
          ).catch(() => {});

          try {
            await query(
              `UPDATE email_outbox_queue
               SET status = 'sent', provider_account_id = $1, provider_message_id = $2,
                   processed_at = NOW(), error_message = NULL
               WHERE id = $3`,
              [account.id, result.messageId || null, item.id]
            );
          } catch {
            item.status = 'sent';
            item.providerAccountId = account.id;
            item.providerMessageId = result.messageId;
            item.processedAt = nowIso;
          }

          await this.logDelivery(item.projectId, item.recipientEmail, item.actionType, account.providerType, 'sent');
          break; // Done with this item!
        }

        if (result.status === 'RATE_LIMITED') {
          // Pause account for 5 minutes and failover to next eligible account
          await this.pauseAccount(account.id, 'rate_limited', 5 * 60, result.error);
          await NotificationService.createNotification({
            category: 'email_infra',
            severity: 'warning',
            title: `Rate Limit Exceeded: ${account.accountName}`,
            message: `Brevo API returned 429 Rate Limit (${result.error}). Account paused for 5 minutes. Routing to next eligible account.`,
            relatedId: account.id,
          }).catch(() => {});
          continue; // Try next account
        }

        if (result.status === 'QUOTA_EXCEEDED') {
          // Pause account until next day reset or 12 hours and failover
          await this.pauseAccount(account.id, 'quota_exhausted', 12 * 3600, result.error);
          await NotificationService.createNotification({
            category: 'email_infra',
            severity: 'warning',
            title: `Brevo Quota Exhausted: ${account.accountName}`,
            message: `Provider quota limit reached (${result.error}). Account paused until reset. Failover routing to next eligible account.`,
            relatedId: account.id,
          }).catch(() => {});
          continue; // Try next account
        }

        if (result.status === 'AUTH_ERROR') {
          // Authentication failure: disable account and alert super admin
          await this.updateAccountStatus(account.id, 'invalid_credentials', result.error);
          await NotificationService.createNotification({
            category: 'email_infra',
            severity: 'critical',
            title: `Brevo Authentication Rejected: ${account.accountName}`,
            message: `API Key authentication rejected (401): ${result.error}. Account marked invalid_credentials.`,
            relatedId: account.id,
          }).catch(() => {});
          continue; // Try next account
        }

        if (result.status === 'DOMAIN_ERROR') {
          // Domain / Sender is not authorized on this specific account
          await query(
            `UPDATE custom_sender_domains SET last_error = $1, updated_at = NOW() WHERE project_id = $2 AND LOWER(domain_name) = $3`,
            [result.error, item.projectId, senderDomain]
          ).catch(() => {});
          continue; // Check if another account has the domain verified
        }

        if (result.status === 'TEMPORARY_ERROR') {
          // Network timeout or temporary service error: do NOT treat timeout as rejection!
          await this.deferItem(item, `Temporary delivery error: ${result.error}`);
          itemDispatched = true;
          failedCount++;
          break;
        }

        // PERMANENT_ERROR: Invalid recipient address, malformed content, etc.
        failedCount++;
        itemDispatched = true;
        try {
          await query(
            `UPDATE email_outbox_queue
             SET status = 'failed', error_message = $1, processed_at = NOW()
             WHERE id = $2`,
            [result.error || 'Permanent delivery failure', item.id]
          );
        } catch {
          item.status = 'failed';
          item.errorMessage = result.error;
          item.processedAt = nowIso;
        }

        await this.logDelivery(item.projectId, item.recipientEmail, item.actionType, account.providerType, 'failed', result.error);
        break;
      }

      // If loop exhausted all candidates without delivery: preserve message in deferred state
      if (!itemDispatched) {
        failedCount++;
        await this.deferItem(item, 'All eligible provider accounts are currently paused, rate-limited, or quota-exhausted.');
      }
    }

    return { processed: pendingItems.length, sent: sentCount, failed: failedCount };
  }

  private static async pauseAccount(
    id: string,
    status: EmailProviderAccount['status'],
    durationSec: number,
    errorMsg?: string
  ): Promise<void> {
    const pausedUntil = new Date(Date.now() + durationSec * 1000).toISOString();
    try {
      await query(
        `UPDATE email_provider_accounts
         SET status = $1, paused_until = $2, last_error = $3, updated_at = NOW()
         WHERE id = $4`,
        [status, pausedUntil, errorMsg || null, id]
      );
    } catch {
      const acc = inMemoryProviderAccounts.get(id);
      if (acc) {
        acc.status = status;
        acc.pausedUntil = pausedUntil;
        acc.lastError = errorMsg;
      }
    }
  }

  private static async updateAccountStatus(id: string, status: any, errorMsg?: string): Promise<void> {
    try {
      await query(`UPDATE email_provider_accounts SET status = $1, last_error = $2, updated_at = NOW() WHERE id = $3`, [status, errorMsg || null, id]);
    } catch {
      const acc = inMemoryProviderAccounts.get(id);
      if (acc) {
        acc.status = status;
        acc.lastError = errorMsg;
      }
    }
  }

  private static async deferItem(item: EmailOutboxItem, errorMsg?: string): Promise<void> {
    const nextAttempts = item.attempts + 1;
    if (nextAttempts >= item.maxAttempts) {
      try {
        await query(
          `UPDATE email_outbox_queue
           SET status = 'failed', attempts = $1, error_message = $2, processed_at = NOW()
           WHERE id = $3`,
          [nextAttempts, errorMsg || 'Exceeded maximum retry attempts', item.id]
        );
      } catch {
        item.status = 'failed';
        item.attempts = nextAttempts;
        item.errorMessage = errorMsg;
      }
      return;
    }

    // Exponential backoff: 30s * 2^attempts + jitter (max 1 hr)
    const delaySec = Math.min(3600, 30 * Math.pow(2, nextAttempts) + Math.floor(Math.random() * 10));
    const nextRetry = new Date(Date.now() + delaySec * 1000).toISOString();

    try {
      await query(
        `UPDATE email_outbox_queue
         SET status = 'deferred', attempts = $1, next_retry_at = $2, error_message = $3
         WHERE id = $4`,
        [nextAttempts, nextRetry, errorMsg || null, item.id]
      );
    } catch {
      item.status = 'deferred';
      item.attempts = nextAttempts;
      item.nextRetryAt = nextRetry;
      item.errorMessage = errorMsg;
    }
  }

  public static async getOutboxQueueMetrics(): Promise<{
    queued: number;
    processing: number;
    sent: number;
    deferred: number;
    failed: number;
    queueDepth: number;
  }> {
    try {
      const res = await query<any>(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'queued') as queued,
           COUNT(*) FILTER (WHERE status = 'processing') as processing,
           COUNT(*) FILTER (WHERE status = 'sent') as sent,
           COUNT(*) FILTER (WHERE status = 'deferred') as deferred,
           COUNT(*) FILTER (WHERE status = 'failed') as failed
         FROM email_outbox_queue`
      );
      const row = res.rows[0];
      const queued = parseInt(row?.queued || '0', 10);
      const processing = parseInt(row?.processing || '0', 10);
      const sent = parseInt(row?.sent || '0', 10);
      const deferred = parseInt(row?.deferred || '0', 10);
      const failed = parseInt(row?.failed || '0', 10);

      return {
        queued,
        processing,
        sent,
        deferred,
        failed,
        queueDepth: queued + deferred + processing,
      };
    } catch {
      const items = Array.from(inMemoryOutboxQueue.values());
      const queued = items.filter((i) => i.status === 'queued').length;
      const processing = items.filter((i) => i.status === 'processing').length;
      const sent = items.filter((i) => i.status === 'sent').length;
      const deferred = items.filter((i) => i.status === 'deferred').length;
      const failed = items.filter((i) => i.status === 'failed').length;

      return {
        queued,
        processing,
        sent,
        deferred,
        failed,
        queueDepth: queued + deferred + processing,
      };
    }
  }

  public static async getOutboxItems(limit = 50, projectId?: string): Promise<EmailOutboxItem[]> {
    try {
      let sql = `SELECT id, project_id as "projectId", recipient_email as "recipientEmail",
                        recipient_name as "recipientName", sender_email as "senderEmail",
                        sender_name as "senderName", reply_to as "replyTo", subject,
                        action_type as "actionType", status, attempts, max_attempts as "maxAttempts",
                        next_retry_at as "nextRetryAt", provider_message_id as "providerMessageId",
                        error_message as "errorMessage", created_at as "createdAt", processed_at as "processedAt"
                 FROM email_outbox_queue`;
      const params: any[] = [];
      if (projectId) {
        sql += ` WHERE project_id = $1`;
        params.push(projectId);
      }
      sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
      params.push(limit);

      const res = await query<any>(sql, params);
      return res.rows;
    } catch {
      let items = Array.from(inMemoryOutboxQueue.values());
      if (projectId) items = items.filter((i) => i.projectId === projectId);
      return items.slice(0, limit);
    }
  }

  // ===========================================================================
  // 7. AUTHENTICATION ACTION EMAIL DISPATCH INTEGRATION
  // ===========================================================================

  public static async sendActionEmail(
    projectId: string,
    recipientEmail: string,
    actionType: EmailActionType,
    rawToken: string
  ): Promise<{ success: boolean; messageId: string }> {
    const actionUrl = `https://syntrabase.app/action?mode=${actionType === 'VERIFY_EMAIL' ? 'verifyEmail' : 'resetPassword'}&oobCode=${rawToken}&apiKey=${projectId}`;
    const subject = actionType === 'VERIFY_EMAIL' ? 'Verify your Syntrabase account email' : 'Reset your Syntrabase account password';
    const textBody = `Follow this secure link to complete your request:\n\n${actionUrl}\n\nIf you did not request this, please ignore this email.`;
    const htmlBody = `
      <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #2563eb;">Syntrabase Security</h2>
        <p>Follow this secure link to complete your request:</p>
        <p><a href="${actionUrl}" style="background-color: #2563eb; color: #fff; padding: 10px 20px; text-decoration: none; border-radius: 6px; display: inline-block;">Continue</a></p>
        <p style="color: #64748b; font-size: 13px;">If you did not make this request, you can safely ignore this email.</p>
      </div>
    `;

    // Fetch authorized sender for project if configured, else default noreply
    let fromEmail = 'noreply@syntrabase.internal';
    let fromName = 'Syntrabase App';

    try {
      const senders = await this.getAuthorizedSenders(projectId);
      if (senders.length > 0 && senders[0].status === 'active') {
        fromEmail = senders[0].emailAddress;
        fromName = senders[0].displayName;
      }
    } catch {
      // Fallback
    }

    const outboxItem = await this.enqueueEmail({
      projectId,
      toEmail: recipientEmail,
      fromEmail,
      fromName,
      subject,
      text: textBody,
      html: htmlBody,
      actionType,
    });

    return {
      success: true,
      messageId: outboxItem.id,
    };
  }

  public static async sendEmail(params: {
    projectId: string;
    to: string;
    from: string;
    fromName?: string;
    subject: string;
    text: string;
    html?: string;
  }): Promise<{ success: boolean; messageId: string }> {
    const item = await this.enqueueEmail({
      projectId: params.projectId,
      toEmail: params.to,
      fromEmail: params.from,
      fromName: params.fromName || 'Syntrabase App',
      subject: params.subject,
      text: params.text,
      html: params.html,
      actionType: 'custom',
    });

    return { success: true, messageId: item.id };
  }

  public static async logDelivery(
    projectId: string,
    recipientEmail: string,
    actionType: string,
    provider: string,
    status: 'sent' | 'failed',
    errorMessage?: string
  ): Promise<void> {
    try {
      await query(
        `INSERT INTO email_delivery_logs (project_id, recipient_email, action_type, provider, status, error_message)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [projectId, recipientEmail, actionType, provider, status, errorMessage || null]
      );
    } catch {
      inMemoryDeliveryLogs.push({
        projectId,
        recipientEmail,
        actionType,
        provider,
        status,
        errorMessage,
        createdAt: new Date().toISOString(),
      });
    }
  }

  public static async getDeliveryLogs(projectId: string, limit = 50, rawId?: string): Promise<any[]> {
    try {
      const pRes = await query<{ slug: string }>(`SELECT slug FROM projects WHERE id = $1`, [projectId]).catch(() => ({ rows: [] }));
      const projectIds = Array.from(new Set([projectId, rawId, pRes.rows[0]?.slug].filter(Boolean))) as string[];

      // Query rich transactional logs from the durable outbox queue
      const res = await query<any>(
        `SELECT
           id,
           recipient_email as "recipientEmail",
           sender_email as "senderAddress",
           subject,
           status as "deliveryStatus",
           attempts as "attemptCount",
           provider_message_id as "providerMessageId",
           error_message as "lastError",
           created_at as "createdAt"
         FROM email_outbox_queue
         WHERE project_id = ANY($1::text[])
         ORDER BY created_at DESC
         LIMIT $2`,
        [projectIds, limit]
      );

      if (res.rows.length > 0) {
        return res.rows;
      }

      // Fallback query to email_delivery_logs table
      const logRes = await query<any>(
        `SELECT
           id,
           recipient_email as "recipientEmail",
           'Syntrabase Gateway' as "senderAddress",
           action_type as "subject",
           status as "deliveryStatus",
           1 as "attemptCount",
           provider as "providerMessageId",
           error_message as "lastError",
           created_at as "createdAt"
         FROM email_delivery_logs
         WHERE project_id = ANY($1::text[])
         ORDER BY created_at DESC
         LIMIT $2`,
        [projectIds, limit]
      );
      return logRes.rows;
    } catch {
      const pRes = await query<{ slug: string }>(`SELECT slug FROM projects WHERE id = $1`, [projectId]).catch(() => ({ rows: [] }));
      const projectIds = Array.from(new Set([projectId, rawId, pRes.rows[0]?.slug].filter(Boolean))) as string[];
      let items = Array.from(inMemoryOutboxQueue.values()).filter((i) => projectIds.includes(i.projectId));
      return items
        .map((i) => ({
          id: i.id,
          recipientEmail: i.recipientEmail,
          senderAddress: i.senderEmail,
          subject: i.subject,
          deliveryStatus: i.status,
          attemptCount: i.attempts,
          providerMessageId: i.providerMessageId,
          lastError: i.errorMessage,
          createdAt: i.createdAt,
        }))
        .slice(0, limit);
    }
  }

  public static async clearDeliveryLogs(projectId: string, rawId?: string): Promise<{ deletedCount: number }> {
    let deletedCount = 0;
    try {
      const pRes = await query<{ slug: string }>(`SELECT slug FROM projects WHERE id = $1`, [projectId]).catch(() => ({ rows: [] }));
      const projectIds = Array.from(new Set([projectId, rawId, pRes.rows[0]?.slug].filter(Boolean))) as string[];

      const qRes = await query<{ count: string }>(
        `WITH deleted AS (
           DELETE FROM email_outbox_queue
           WHERE project_id = ANY($1::text[])
           RETURNING id
         )
         SELECT COUNT(*)::text as count FROM deleted`,
        [projectIds]
      );
      deletedCount += parseInt(qRes.rows[0]?.count || '0', 10);
      const delLogRes = await query<{ count: string }>(
        `WITH deleted AS (
           DELETE FROM email_delivery_logs
           WHERE project_id = ANY($1::text[])
           RETURNING id
         )
         SELECT COUNT(*)::text as count FROM deleted`,
        [projectIds]
      ).catch(() => ({ rows: [] }));
      deletedCount += parseInt(delLogRes.rows[0]?.count || '0', 10);
    } catch {
      const pRes = await query<{ slug: string }>(`SELECT slug FROM projects WHERE id = $1`, [projectId]).catch(() => ({ rows: [] }));
      const projectIds = Array.from(new Set([projectId, rawId, pRes.rows[0]?.slug].filter(Boolean))) as string[];
      for (const [key, val] of inMemoryOutboxQueue.entries()) {
        if (projectIds.includes(val.projectId)) {
          inMemoryOutboxQueue.delete(key);
          deletedCount++;
        }
      }
    }
    return { deletedCount };
  }

  public static async pruneOutboxQueue(): Promise<{ deletedCount: number }> {
    let deletedCount = 0;
    try {
      const qRes = await query<{ count: string }>(
        `WITH deleted AS (
           DELETE FROM email_outbox_queue
           WHERE status IN ('sent', 'failed')
           RETURNING id
         )
         SELECT COUNT(*)::text as count FROM deleted`
      );
      deletedCount = parseInt(qRes.rows[0]?.count || '0', 10);
    } catch {
      for (const [key, val] of inMemoryOutboxQueue.entries()) {
        if (val.status === 'sent' || val.status === 'failed') {
          inMemoryOutboxQueue.delete(key);
          deletedCount++;
        }
      }
    }
    return { deletedCount };
  }
}
