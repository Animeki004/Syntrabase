import { FastifyRequest } from 'fastify';
import { query } from '../db/pool.js';
import { config } from '../config.js';

export class UrlUtil {
  /**
   * Dynamically resolves the Developer Console base URL without hardcoding any domain.
   * Strictly validates incoming Origin/Referer headers against platformDomain to prevent
   * Host Header Injection and Password Reset Link Poisoning (CWE-640).
   */
  public static resolveConsoleUrl(req?: FastifyRequest | any): string {
    // 1. Explicitly configured environment variables from .env
    if (process.env.CONSOLE_URL) {
      return process.env.CONSOLE_URL.replace(/\/$/, '');
    }

    if (process.env.CONSOLE_DOMAIN) {
      const d = process.env.CONSOLE_DOMAIN.trim();
      return (d.startsWith('http://') || d.startsWith('https://') ? d : `https://${d}`).replace(/\/$/, '');
    }

    if (process.env.FRONTEND_URL) {
      const d = process.env.FRONTEND_URL.trim();
      return (d.startsWith('http://') || d.startsWith('https://') ? d : `https://${d}`).replace(/\/$/, '');
    }

    // Helper: Validates that candidate hostname belongs to platformDomain or localhost
    const isAllowedHost = (hostname: string): boolean => {
      const host = hostname.toLowerCase();
      const platformDomain = (config.platformDomain || 'localhost').toLowerCase();

      // Allowed in development/test
      if (config.env !== 'production' && config.env !== 'staging') {
        if (host === 'localhost' || host === '127.0.0.1') return true;
      }

      if (platformDomain !== 'localhost') {
        if (host === platformDomain || host.endsWith('.' + platformDomain)) {
          return true;
        }
      }

      return false;
    };

    // 2. Dynamic resolution from incoming HTTP request headers with strict domain validation
    if (req) {
      const origin = req.headers?.origin as string;
      if (origin && typeof origin === 'string' && origin.startsWith('http')) {
        try {
          const parsed = new URL(origin);
          if (isAllowedHost(parsed.hostname)) {
            return parsed.origin;
          }
        } catch {}
      }

      const referer = req.headers?.referer as string;
      if (referer && typeof referer === 'string' && referer.startsWith('http')) {
        try {
          const parsed = new URL(referer);
          if (isAllowedHost(parsed.hostname)) {
            return parsed.origin;
          }
        } catch {}
      }

      const host = (req.headers?.['x-forwarded-host'] as string) || req.headers?.host;
      if (host && typeof host === 'string') {
        const cleanHost = host.split(':')[0].trim();
        if (isAllowedHost(cleanHost)) {
          const proto = (req.headers?.['x-forwarded-proto'] as string) || req.protocol || 'https';
          const consoleHost = cleanHost.startsWith('api.') ? cleanHost.replace(/^api\./, 'console.') : cleanHost;
          return `${proto}://${consoleHost}`;
        }
      }
    }

    // 3. Fallback based on platformDomain or local development
    if (config.platformDomain && config.platformDomain !== 'localhost') {
      return `https://console.${config.platformDomain}`;
    }

    return 'http://localhost:3000';
  }

  /**
   * Dynamically resolves the platform sender identity (email & display name)
   * strictly for platform/super-admin communications (password resets, invitations).
   * Console users' tenant senders are NEVER queried here.
   * Priority:
   * 1. SYSTEM_FROM_EMAIL / SYSTEM_FROM_NAME environment variables
   * 2. Platform-authorized sender identity in database (project_id = 'platform')
   * 3. Platform connected email provider account email (Brevo/Postmark)
   * 4. Inferred dynamically from request host (e.g. security@yourdomain.com)
   */
  public static async resolvePlatformSender(req?: FastifyRequest | any): Promise<{ email: string; name: string }> {
    let email = '';
    let name = '';

    try {
      // 1. Strictly look up platform-scoped authorized senders (Super Admin configured)
      const senderRes = await query<{ email_address: string; display_name: string }>(
        `SELECT email_address, display_name FROM authorized_sender_identities
         WHERE (project_id = 'platform' OR project_id IS NULL) AND status = 'active'
         ORDER BY is_default DESC, created_at DESC LIMIT 1`
      );
      if (senderRes.rows[0]?.email_address) {
        email = senderRes.rows[0].email_address;
        name = senderRes.rows[0].display_name || 'Platform Security';
        return { email, name };
      }

      // 2. Look up platform-scoped provider account (Super Admin Brevo/SMTP account owner)
      const accRes = await query<{ account_email: string; account_name: string }>(
        `SELECT account_email, account_name FROM email_provider_accounts
         WHERE (project_id = 'platform' OR project_id IS NULL)
           AND is_enabled = TRUE AND status = 'healthy' AND account_email IS NOT NULL AND account_email != ''
         ORDER BY is_primary DESC, created_at DESC LIMIT 1`
      );
      if (accRes.rows[0]?.account_email) {
        email = accRes.rows[0].account_email;
        name = accRes.rows[0].account_name || 'Platform Security';
        return { email, name };
      }
    } catch {}

    // 3. Fallback to environment variables if no database sender is configured
    email = process.env.SYSTEM_FROM_EMAIL || process.env.DEFAULT_FROM_EMAIL || '';
    name = process.env.SYSTEM_FROM_NAME || 'Platform Security';

    if (email) {
      return { email, name };
    }

    if (req) {
      const host = (req.headers?.['x-forwarded-host'] as string) || req.headers?.host || '';
      const cleanHost = host.replace(/:\d+$/, '').replace(/^api\./, '');
      if (cleanHost && !cleanHost.includes('localhost') && cleanHost.includes('.')) {
        email = `security@${cleanHost}`;
      }
    }

    if (!email) {
      email = 'security@localhost';
    }

    return { email, name };
  }

  /**
   * Resolves and verifies the authorized sender identity for a specific tenant/project.
   * Completely isolated: A project can NEVER use platform senders or another tenant's senders.
   */
  public static async resolveProjectSender(
    projectId: string,
    requestedSender?: string
  ): Promise<{ email: string; name: string }> {
    if (requestedSender) {
      const cleanRequested = requestedSender.trim().toLowerCase();
      const checkRes = await query<{ email_address: string; display_name: string }>(
        `SELECT email_address, display_name FROM authorized_sender_identities
         WHERE project_id = $1 AND LOWER(email_address) = $2 AND status = 'active'
         LIMIT 1`,
        [projectId, cleanRequested]
      );

      if (checkRes.rows.length === 0) {
        throw new Error(
          `Sender address "${cleanRequested}" is not an active authorized sender for project "${projectId}". Register and verify your sender domain in Developer Console -> Email & Domains first.`
        );
      }

      return {
        email: checkRes.rows[0].email_address,
        name: checkRes.rows[0].display_name || 'Project Team',
      };
    }

    // Default to the project's first active authorized sender
    const senderRes = await query<{ email_address: string; display_name: string }>(
      `SELECT email_address, display_name FROM authorized_sender_identities
       WHERE project_id = $1 AND status = 'active'
       ORDER BY created_at ASC LIMIT 1`,
      [projectId]
    );

    if (senderRes.rows.length === 0) {
      throw new Error(
        `No active authorized sender configured for project "${projectId}". Please register and verify a custom sender domain in Developer Console -> Email & Domains.`
      );
    }

    return {
      email: senderRes.rows[0].email_address,
      name: senderRes.rows[0].display_name || 'Project Team',
    };
  }
}
