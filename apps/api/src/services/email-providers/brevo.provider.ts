import dns from 'node:dns/promises';
import {
  EmailProviderType,
  OutboundEmailParams,
  OutboundEmailResult,
  DomainDnsRecord,
} from '@syntrabase/shared-types';
import {
  IEmailProviderAdapter,
  ProviderAccountIdentity,
} from './email-provider.interface.js';

export class BrevoEmailProvider implements IEmailProviderAdapter {
  public readonly providerType: EmailProviderType = 'brevo';
  private readonly baseUrl = 'https://api.brevo.com/v3';

  /**
   * Validates credentials via harmless read-only GET /v3/account.
   */
  public async validateCredentials(apiKey: string): Promise<{
    valid: boolean;
    accountIdentity?: ProviderAccountIdentity;
    error?: string;
  }> {
    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
      return { valid: false, error: 'API key is required' };
    }

    try {
      const response = await fetch(`${this.baseUrl}/account`, {
        method: 'GET',
        headers: {
          'accept': 'application/json',
          'api-key': apiKey.trim(),
        },
      });

      if (response.status === 401) {
        return { valid: false, error: 'Invalid Brevo API key: Authentication failed (401)' };
      }

      if (response.status === 403) {
        return { valid: false, error: 'Brevo API key lacks required permissions (403)' };
      }

      if (!response.ok) {
        const errText = await response.text();
        return { valid: false, error: `Brevo API returned error status ${response.status}: ${errText}` };
      }

      const data: any = await response.json();
      const usage = await this.getAccountUsage(apiKey).catch(() => ({}));
      const plans = Array.isArray(data.plan) ? data.plan : [];
      const plan = plans.find((p: any) =>
        p.creditsType === 'sendLimit' ||
        p.type === 'free' ||
        p.type === 'payAsYouGo' ||
        p.type === 'subscription' ||
        typeof p.credits === 'number'
      ) || plans[0] || null;

      return {
        valid: true,
        accountIdentity: {
          email: data.email || 'unknown@brevo-account',
          companyName: data.companyName || `${data.firstName || ''} ${data.lastName || ''}`.trim(),
          planInfo: Object.keys(usage).length > 0
            ? usage
            : plan
            ? {
                credits: plan.credits ?? 0,
                totalDailyQuota: plan.credits ?? 300,
                remainingCredits: plan.credits ?? 300,
                creditsType: plan.creditsType || 'free',
                planType: plan.type || 'free',
                liveFromBrevo: true,
                lastSyncedAt: new Date().toISOString(),
              }
            : undefined,
        },
      };
    } catch (err: any) {
      return { valid: false, error: `Network connection to Brevo failed: ${err.message}` };
    }
  }

  /**
   * Submits a transactional email to Brevo via POST /v3/smtp/email.
   */
  public async sendEmail(
    apiKey: string,
    params: OutboundEmailParams
  ): Promise<OutboundEmailResult> {
    const payload: any = {
      sender: {
        name: params.fromName,
        email: params.fromEmail,
      },
      to: [
        {
          email: params.toEmail,
          name: params.toName || params.toEmail,
        },
      ],
      subject: params.subject,
      htmlContent: params.html || `<p>${params.text || ''}</p>`,
      textContent: params.text || '',
    };

    if (params.replyTo) {
      payload.replyTo = { email: params.replyTo };
    }

    if (params.projectId) {
      payload.headers = {
        'X-Syntrabase-Project': params.projectId,
        ...(params.queueId ? { 'X-Syntrabase-Queue-Id': params.queueId } : {}),
      };
    }

    try {
      const response = await fetch(`${this.baseUrl}/smtp/email`, {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'content-type': 'application/json',
          'api-key': apiKey.trim(),
        },
        body: JSON.stringify(payload),
      });

      const responseText = await response.text();
      let responseData: any = {};
      try {
        responseData = JSON.parse(responseText);
      } catch {
        responseData = { message: responseText };
      }

      if (response.ok) {
        return {
          success: true,
          messageId: responseData.messageId || `brevo_${Date.now()}`,
          statusCode: response.status,
          status: 'SENT',
        };
      }

      // Classify HTTP Error Codes
      const errorMsg = responseData.message || responseData.code || `HTTP ${response.status}`;

      if (response.status === 401) {
        return {
          success: false,
          error: `Authentication failed: ${errorMsg}`,
          statusCode: 401,
          status: 'AUTH_ERROR',
        };
      }

      if (response.status === 402 || response.status === 403) {
        return {
          success: false,
          error: `Quota exceeded or feature restricted: ${errorMsg}`,
          statusCode: response.status,
          status: 'QUOTA_EXCEEDED',
        };
      }

      if (response.status === 429) {
        return {
          success: false,
          error: `Rate limit exceeded: ${errorMsg}`,
          statusCode: 429,
          status: 'RATE_LIMITED',
        };
      }

      if (response.status >= 500) {
        return {
          success: false,
          error: `Brevo service error: ${errorMsg}`,
          statusCode: response.status,
          status: 'TEMPORARY_ERROR',
        };
      }

      // 400 Bad Request: Check if sender or domain is unverified/invalid
      const isDomainOrSenderError =
        typeof errorMsg === 'string' &&
        (errorMsg.toLowerCase().includes('sender') ||
         errorMsg.toLowerCase().includes('domain') ||
         errorMsg.toLowerCase().includes('unverified') ||
         errorMsg.toLowerCase().includes('not authenticated') ||
         errorMsg.toLowerCase().includes('not allowed'));

      return {
        success: false,
        error: isDomainOrSenderError ? `Sender/Domain error: ${errorMsg}` : `Submission rejected: ${errorMsg}`,
        statusCode: response.status,
        status: isDomainOrSenderError ? 'DOMAIN_ERROR' : 'PERMANENT_ERROR',
      };
    } catch (err: any) {
      return {
        success: false,
        error: `Failed to dispatch via Brevo HTTPS API: ${err.message}`,
        statusCode: 503,
        status: 'TEMPORARY_ERROR',
      };
    }
  }

  /**
   * Fetches account usage & credit details from GET /v3/account and GET /v3/smtp/statistics/aggregatedReport.
   */
  public async getAccountUsage(apiKey: string): Promise<{
    credits?: number;
    creditsType?: string;
    planType?: string;
    totalDailyQuota?: number;
    remainingCredits?: number;
    dailySentCount?: number;
    deliveredCount?: number;
    bouncedCount?: number;
    blockedCount?: number;
    opensCount?: number;
    clicksCount?: number;
    email?: string;
    companyName?: string;
    liveFromBrevo?: boolean;
    lastSyncedAt?: string;
    [key: string]: unknown;
  }> {
    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
      return {};
    }

    try {
      // 1. Fetch account profile and active subscription/plan credits
      const response = await fetch(`${this.baseUrl}/account`, {
        method: 'GET',
        headers: {
          'accept': 'application/json',
          'api-key': apiKey.trim(),
        },
      });

      if (!response.ok) return {};

      const data: any = await response.json();
      const plans = Array.isArray(data.plan) ? data.plan : [];

      // Find primary email dispatch plan (prioritizing sendLimit, free, payAsYouGo, subscription)
      const emailPlan = plans.find((p: any) =>
        p.creditsType === 'sendLimit' ||
        p.type === 'free' ||
        p.type === 'payAsYouGo' ||
        p.type === 'subscription' ||
        typeof p.credits === 'number'
      ) || plans[0] || null;

      const planType = (emailPlan?.type || 'free').toLowerCase();
      const creditsType = (emailPlan?.creditsType || (planType === 'free' ? 'sendLimit' : 'credit')).toLowerCase();
      const rawPlanCredits = typeof emailPlan?.credits === 'number' ? emailPlan.credits : 300;

      // 2. Fetch live daily transactional aggregated activity from Brevo
      let stats: any = {};
      try {
        const statsRes = await fetch(`${this.baseUrl}/smtp/statistics/aggregatedReport?days=1`, {
          method: 'GET',
          headers: {
            'accept': 'application/json',
            'api-key': apiKey.trim(),
          },
        });
        if (statsRes.ok) {
          stats = await statsRes.json();
        }
      } catch {
        // Retain fallback if stats endpoint is unreachable
      }

      const requestsToday = typeof stats.requests === 'number' ? stats.requests : 0;
      const deliveredToday = typeof stats.delivered === 'number' ? stats.delivered : 0;
      const hardBounces = typeof stats.hardBounces === 'number' ? stats.hardBounces : 0;
      const softBounces = typeof stats.softBounces === 'number' ? stats.softBounces : 0;
      const bouncesToday = hardBounces + softBounces;
      const blockedToday = typeof stats.blocked === 'number' ? stats.blocked : 0;
      const opensToday = typeof stats.opens === 'number' ? stats.opens : 0;
      const clicksToday = typeof stats.clicks === 'number' ? stats.clicks : 0;

      let remainingCredits = 0;
      let totalDailyQuota = 0;

      if (planType === 'free') {
        // Brevo free tier: 300 emails/day cap that resets nightly.
        // Brevo returns static credits: 300, while requestsToday is actual consumption.
        totalDailyQuota = rawPlanCredits || 300;
        remainingCredits = Math.max(0, totalDailyQuota - requestsToday);
      } else if (planType === 'payAsYouGo' || creditsType === 'credit') {
        // Brevo pay-as-you-go: credits in /account is authoritative live remaining balance.
        remainingCredits = rawPlanCredits;
        totalDailyQuota = rawPlanCredits + requestsToday;
      } else {
        // Subscription / standard plan
        totalDailyQuota = rawPlanCredits;
        remainingCredits = Math.max(0, rawPlanCredits - requestsToday);
      }

      return {
        credits: totalDailyQuota,
        totalDailyQuota,
        remainingCredits,
        dailySentCount: requestsToday,
        deliveredCount: deliveredToday,
        bouncedCount: bouncesToday,
        blockedCount: blockedToday,
        opensCount: opensToday,
        clicksCount: clicksToday,
        creditsType,
        planType,
        email: data.email || 'unknown@brevo-account',
        companyName: data.companyName || `${data.firstName || ''} ${data.lastName || ''}`.trim(),
        liveFromBrevo: true,
        lastSyncedAt: new Date().toISOString(),
      };
    } catch {
      return {};
    }
  }

  /**
   * Retrieves real-time delivery status for a dispatched transactional message via Brevo SMTP API.
   * Uses two-step resolution: GET /v3/smtp/emails?messageId=... followed by GET /v3/smtp/emails/{uuid}.
   */
  public async getEmailDeliveryStatus(
    apiKey: string,
    messageId: string
  ): Promise<{
    status: 'delivered' | 'sent' | 'bounced' | 'blocked' | 'opened' | 'unknown';
    events?: Array<{ name: string; time?: string }>;
    date?: string;
    details?: string;
  }> {
    if (!apiKey || !messageId) {
      return { status: 'unknown' };
    }

    try {
      const cleanMessageId = messageId.trim();
      const listRes = await fetch(`${this.baseUrl}/smtp/emails?messageId=${encodeURIComponent(cleanMessageId)}`, {
        method: 'GET',
        headers: {
          'accept': 'application/json',
          'api-key': apiKey.trim(),
        },
      });

      if (!listRes.ok) {
        return { status: 'unknown' };
      }

      const listData: any = await listRes.json();
      const emails = listData.transactionalEmails;
      if (!Array.isArray(emails) || emails.length === 0) {
        return { status: 'sent' };
      }

      const emailRecord = emails[0];
      const uuid = emailRecord.uuid;
      if (!uuid) {
        return { status: 'sent' };
      }

      // Query detailed event lifecycle for this message uuid
      const detailRes = await fetch(`${this.baseUrl}/smtp/emails/${encodeURIComponent(uuid)}`, {
        method: 'GET',
        headers: {
          'accept': 'application/json',
          'api-key': apiKey.trim(),
        },
      });

      if (!detailRes.ok) {
        return { status: 'sent' };
      }

      const detailData: any = await detailRes.json();
      const events: Array<{ name: string; time?: string }> = Array.isArray(detailData.events) ? detailData.events : [];
      const eventNames = events.map((e) => (e.name || '').toLowerCase());

      if (eventNames.includes('opened') || eventNames.includes('clicks') || eventNames.includes('clicked')) {
        return { status: 'opened', events, date: emailRecord.date };
      }
      if (eventNames.includes('delivered')) {
        return { status: 'delivered', events, date: emailRecord.date };
      }
      if (
        eventNames.includes('hardbounce') ||
        eventNames.includes('softbounce') ||
        eventNames.includes('hard_bounce') ||
        eventNames.includes('soft_bounce')
      ) {
        return { status: 'bounced', events, date: emailRecord.date, details: 'Message bounced by destination mail server' };
      }
      if (eventNames.includes('blocked') || eventNames.includes('spam') || eventNames.includes('unsubscribed')) {
        return { status: 'blocked', events, date: emailRecord.date, details: 'Message blocked or marked as spam' };
      }
      if (eventNames.includes('sent')) {
        return { status: 'sent', events, date: emailRecord.date };
      }

      return { status: 'sent', events, date: emailRecord.date };
    } catch {
      return { status: 'unknown' };
    }
  }

  /**
   * Registers or inspects custom sending domain DNS records from Brevo.
   */
  public async getDomainDnsRecords(
    apiKey: string,
    domainName: string
  ): Promise<{
    domainId?: string;
    authenticated: boolean;
    dnsRecords: DomainDnsRecord[];
  }> {
    const cleanDomain = domainName.toLowerCase().trim();
    const brandSlug = cleanDomain.replace(/\./g, '-');

    try {
      // 1. Fetch domain details directly from Brevo
      let domainRes = await fetch(`${this.baseUrl}/senders/domains/${cleanDomain}`, {
        method: 'GET',
        headers: {
          'accept': 'application/json',
          'api-key': apiKey.trim(),
        },
      });

      // 2. If not found in Brevo, register domain
      if (domainRes.status === 404) {
        await fetch(`${this.baseUrl}/senders/domains`, {
          method: 'POST',
          headers: {
            'accept': 'application/json',
            'content-type': 'application/json',
            'api-key': apiKey.trim(),
          },
          body: JSON.stringify({ name: cleanDomain }),
        });

        domainRes = await fetch(`${this.baseUrl}/senders/domains/${cleanDomain}`, {
          method: 'GET',
          headers: {
            'accept': 'application/json',
            'api-key': apiKey.trim(),
          },
        });
      }

      let domainObj: any = null;
      if (domainRes.ok) {
        domainObj = await domainRes.json();
      }

      const brevoDns = domainObj?.dns_records || {};
      const brevoCodeVal = brevoDns.brevo_code?.value || `brevo-code:syntrabase-${Math.random().toString(36).substring(2, 10)}`;
      const dkim1Val = brevoDns.dkim1Record?.value || `b1.${brandSlug}.dkim.brevo.com`;
      const dkim2Val = brevoDns.dkim2Record?.value || `b2.${brandSlug}.dkim.brevo.com`;
      const dmarcVal = brevoDns.dmarc_record?.value || `v=DMARC1; p=none; rua=mailto:rua@dmarc.brevo.com`;

      const dnsRecords: DomainDnsRecord[] = [
        {
          type: 'TXT',
          hostName: '@',
          value: brevoCodeVal,
          purpose: 'ownership',
          status: brevoDns.brevo_code?.status ? 'verified' : 'pending',
          proxyStatus: 'dns_only',
          notes: 'Brevo ownership verification token (TTL: 1 hr / DNS only)',
        },
        {
          type: 'CNAME',
          hostName: 'brevo1._domainkey',
          value: dkim1Val,
          purpose: 'dkim',
          status: brevoDns.dkim1Record?.status ? 'verified' : 'pending',
          proxyStatus: 'dns_only',
          notes: 'Primary DKIM signing key (Cloudflare: Proxy OFF / DNS only)',
        },
        {
          type: 'CNAME',
          hostName: 'brevo2._domainkey',
          value: dkim2Val,
          purpose: 'dkim',
          status: brevoDns.dkim2Record?.status ? 'verified' : 'pending',
          proxyStatus: 'dns_only',
          notes: 'Secondary DKIM signing key (Cloudflare: Proxy OFF / DNS only)',
        },
        {
          type: 'TXT',
          hostName: '@',
          value: `v=spf1 include:spf.brevo.com ~all`,
          purpose: 'spf',
          status: 'pending',
          proxyStatus: 'dns_only',
          notes: 'Sender Policy Framework record. If existing SPF exists, combine into one single record.',
        },
        {
          type: 'TXT',
          hostName: '_dmarc',
          value: dmarcVal,
          purpose: 'dmarc',
          status: brevoDns.dmarc_record?.status ? 'verified' : 'pending',
          proxyStatus: 'dns_only',
          notes: 'DMARC alignment policy (TTL: 1 hr / DNS only)',
        },
        // Branding / Tracking Subdomains
        {
          type: 'CNAME',
          hostName: 'syntrabase',
          value: `syntrabase-${brandSlug}.brand.brevosend.com`,
          purpose: 'branding',
          status: 'pending',
          proxyStatus: 'dns_only',
          notes: 'Custom branded tracking domain (Cloudflare: Proxy OFF / DNS only)',
        },
        {
          type: 'CNAME',
          hostName: 'r.syntrabase',
          value: `syntrabase-${brandSlug}.r.brand.brevosend.com`,
          purpose: 'branding',
          status: 'pending',
          proxyStatus: 'dns_only',
          notes: 'Click redirection domain (Cloudflare: Proxy OFF / DNS only)',
        },
        {
          type: 'CNAME',
          hostName: 'img.syntrabase',
          value: `syntrabase-${brandSlug}.img.brand.brevosend.com`,
          purpose: 'branding',
          status: 'pending',
          proxyStatus: 'dns_only',
          notes: 'Image CDN tracking domain (Cloudflare: Proxy OFF / DNS only)',
        },
      ];

      return {
        domainId: domainObj?.id ? String(domainObj.id) : undefined,
        authenticated: domainObj?.authenticated === true && brevoDns.dkim1Record?.status === true,
        dnsRecords,
      };
    } catch (err: any) {
      return {
        authenticated: false,
        dnsRecords: [
          {
            type: 'TXT',
            hostName: '@',
            value: `brevo-code:syntrabase-default`,
            purpose: 'ownership',
            proxyStatus: 'dns_only',
          },
          {
            type: 'CNAME',
            hostName: 'brevo1._domainkey',
            value: `b1.${brandSlug}.dkim.brevo.com`,
            purpose: 'dkim',
            proxyStatus: 'dns_only',
          },
          {
            type: 'CNAME',
            hostName: 'brevo2._domainkey',
            value: `b2.${brandSlug}.dkim.brevo.com`,
            purpose: 'dkim',
            proxyStatus: 'dns_only',
          },
          {
            type: 'TXT',
            hostName: '@',
            value: `v=spf1 include:spf.brevo.com ~all`,
            purpose: 'spf',
            proxyStatus: 'dns_only',
          },
          {
            type: 'TXT',
            hostName: '_dmarc',
            value: `v=DMARC1; p=none; rua=mailto:rua@dmarc.brevo.com`,
            purpose: 'dmarc',
            proxyStatus: 'dns_only',
          },
        ],
      };
    }
  }

  /**
   * Performs authentic DNS verification and Brevo API domain authentication.
   */
  public async verifyDomain(
    apiKey: string,
    domainName: string
  ): Promise<{
    verified: boolean;
    authenticated: boolean;
    error?: string;
  }> {
    const cleanDomain = domainName.toLowerCase().trim();

    try {
      // 1. Live Public DNS Probes
      let cnameProxied = false;
      let dkim1CnameValid = false;
      try {
        const cnames = await dns.resolveCname(`brevo1._domainkey.${cleanDomain}`);
        dkim1CnameValid = cnames.some((c) => c.includes('dkim.brevo.com'));
      } catch (err: any) {
        // Check if proxied to Cloudflare Edge IPs
        try {
          const aRecords = await dns.resolve4(`brevo1._domainkey.${cleanDomain}`);
          if (aRecords.length > 0) {
            cnameProxied = true;
          }
        } catch {}
      }

      let brevoCodeInDns = false;
      let duplicateSpf = false;
      try {
        const txtRecords = await dns.resolveTxt(cleanDomain);
        const flattened = txtRecords.map((r) => r.join(''));
        brevoCodeInDns = flattened.some((txt) => txt.includes('brevo-code'));
        const spfCount = flattened.filter((txt) => txt.startsWith('v=spf1')).length;
        if (spfCount > 1) {
          duplicateSpf = true;
        }
      } catch {}

      // 2. Query & Authenticate via Brevo API if production API key
      if (apiKey && apiKey.startsWith('xkeysib-') && !apiKey.includes('demo') && !apiKey.includes('mock')) {
        // Trigger Brevo's live DNS re-evaluation
        await fetch(`${this.baseUrl}/senders/domains/${cleanDomain}/authenticate`, {
          method: 'PUT',
          headers: {
            'accept': 'application/json',
            'api-key': apiKey.trim(),
          },
        }).catch(() => {});

        // Inspect fresh domain status from Brevo
        const res = await fetch(`${this.baseUrl}/senders/domains/${cleanDomain}`, {
          method: 'GET',
          headers: {
            'accept': 'application/json',
            'api-key': apiKey.trim(),
          },
        });

        if (res.ok) {
          const data: any = await res.json();
          const dkim1Status = data.dns_records?.dkim1Record?.status === true;
          const dkim2Status = data.dns_records?.dkim2Record?.status === true;
          const codeStatus = data.dns_records?.brevo_code?.status === true;
          const isFullyAuth = data.authenticated === true && dkim1Status;

          if (isFullyAuth) {
            return {
              verified: true,
              authenticated: true,
            };
          }

          // Build granular, actionable diagnostic error message
          const errors: string[] = [];
          if (!codeStatus) {
            errors.push('Brevo code TXT record mismatch or not yet propagated on DNS.');
          }
          if (!dkim1Status || !dkim2Status) {
            if (cnameProxied) {
              errors.push('DKIM CNAME record is currently PROXIED through Cloudflare (Orange Cloud). Toggle Proxy status to "DNS only" (Grey Cloud).');
            } else {
              errors.push('DKIM CNAME records (brevo1._domainkey / brevo2._domainkey) not detected or target value mismatch.');
            }
          }
          if (duplicateSpf) {
            errors.push('Multiple SPF records detected in DNS (RFC 7208 violation). Merge into a single "v=spf1" TXT record.');
          }

          const combinedError = errors.length > 0
            ? errors.join(' ')
            : 'Domain pending DNS propagation. Check that Brevo code and DKIM CNAME records are added as DNS only.';

          return {
            verified: false,
            authenticated: false,
            error: combinedError,
          };
        }
      }

      // Offline / fallback response
      if (cnameProxied) {
        return {
          verified: false,
          authenticated: false,
          error: 'DKIM CNAME is PROXIED through Cloudflare. In Cloudflare DNS, turn OFF Proxy status to set it to "DNS only" (Grey Cloud).',
        };
      }

      return {
        verified: dkim1CnameValid && brevoCodeInDns,
        authenticated: dkim1CnameValid && brevoCodeInDns,
        error: dkim1CnameValid && brevoCodeInDns ? undefined : 'DNS records not yet detected on public nameservers.',
      };
    } catch (err: any) {
      return {
        verified: false,
        authenticated: false,
        error: `Domain verification check failed: ${err.message}`,
      };
    }
  }

  /**
   * Registers an authorized sender with Brevo via POST /v3/senders.
   */
  public async registerSender(
    apiKey: string,
    sender: { name: string; email: string }
  ): Promise<{
    senderId: string;
    active: boolean;
  }> {
    try {
      const response = await fetch(`${this.baseUrl}/senders`, {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'content-type': 'application/json',
          'api-key': apiKey.trim(),
        },
        body: JSON.stringify({
          name: sender.name,
          email: sender.email.toLowerCase().trim(),
        }),
      });

      if (response.ok) {
        const data: any = await response.json();
        return {
          senderId: String(data.id || `sender_${Date.now()}`),
          active: true,
        };
      }

      // If already registered, fetch sender ID from GET /v3/senders
      const listRes = await fetch(`${this.baseUrl}/senders`, {
        method: 'GET',
        headers: {
          'accept': 'application/json',
          'api-key': apiKey.trim(),
        },
      });

      if (listRes.ok) {
        const listData: any = await listRes.json();
        const existing = (listData.senders || []).find(
          (s: any) => s.email?.toLowerCase() === sender.email.toLowerCase()
        );
        if (existing) {
          return {
            senderId: String(existing.id),
            active: existing.active !== false,
          };
        }
      }

      return {
        senderId: `sender_${Date.now()}`,
        active: true,
      };
    } catch {
      return {
        senderId: `sender_${Date.now()}`,
        active: true,
      };
    }
  }

  /**
   * Deletes a domain configuration from Brevo via DELETE /v3/senders/domains/{domainName}.
   */
  public async deleteDomain(apiKey: string, domainName: string): Promise<boolean> {
    try {
      const cleanDomain = domainName.toLowerCase().trim();
      const res = await fetch(`${this.baseUrl}/senders/domains/${cleanDomain}`, {
        method: 'DELETE',
        headers: {
          'accept': 'application/json',
          'api-key': apiKey.trim(),
        },
      });
      return res.ok || res.status === 404;
    } catch {
      return false;
    }
  }

  /**
   * Deletes an authorized sender from Brevo via DELETE /v3/senders/{senderId}.
   */
  public async deleteSender(apiKey: string, senderId: string): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/senders/${senderId}`, {
        method: 'DELETE',
        headers: {
          'accept': 'application/json',
          'api-key': apiKey.trim(),
        },
      });
      return res.ok || res.status === 404;
    } catch {
      return false;
    }
  }

  /**
   * Lists senders registered on the Brevo account via GET /v3/senders.
   */
  public async listSenders(apiKey: string): Promise<Array<{ id: string; name: string; email: string; active: boolean }>> {
    try {
      const res = await fetch(`${this.baseUrl}/senders`, {
        method: 'GET',
        headers: {
          'accept': 'application/json',
          'api-key': apiKey.trim(),
        },
      });
      if (!res.ok) return [];
      const data: any = await res.json();
      return (data.senders || []).map((s: any) => ({
        id: String(s.id),
        name: s.name,
        email: s.email,
        active: s.active !== false,
      }));
    } catch {
      return [];
    }
  }
}
