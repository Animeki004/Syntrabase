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

export class MockEmailProvider implements IEmailProviderAdapter {
  public readonly providerType: EmailProviderType = 'mock';

  public simulatedValidationResult = true;
  public simulatedSendStatus: OutboundEmailResult['status'] = 'SENT';
  public simulatedAccountIdentity?: ProviderAccountIdentity;
  public sentMessages: OutboundEmailParams[] = [];

  public async validateCredentials(apiKey: string): Promise<{
    valid: boolean;
    accountIdentity?: ProviderAccountIdentity;
    error?: string;
  }> {
    if (!apiKey || apiKey === 'invalid-key') {
      return { valid: false, error: 'Invalid API key' };
    }
    if (!this.simulatedValidationResult) {
      return { valid: false, error: 'Simulated validation failure' };
    }
    return {
      valid: true,
      accountIdentity: this.simulatedAccountIdentity || {
        email: 'test@syntrabase-mock.internal',
        companyName: 'Syntrabase Mock Org',
        planInfo: { credits: 300, planType: 'free' },
      },
    };
  }

  public async sendEmail(
    _apiKey: string,
    params: OutboundEmailParams
  ): Promise<OutboundEmailResult> {
    this.sentMessages.push(params);

    if (this.simulatedSendStatus === 'SENT') {
      return {
        success: true,
        messageId: `mock_msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        status: 'SENT',
        statusCode: 201,
      };
    }

    if (this.simulatedSendStatus === 'RATE_LIMITED') {
      return {
        success: false,
        error: 'Mock rate limit exceeded',
        status: 'RATE_LIMITED',
        statusCode: 429,
      };
    }

    if (this.simulatedSendStatus === 'QUOTA_EXCEEDED') {
      return {
        success: false,
        error: 'Mock quota exhausted',
        status: 'QUOTA_EXCEEDED',
        statusCode: 402,
      };
    }

    if (this.simulatedSendStatus === 'AUTH_ERROR') {
      return {
        success: false,
        error: 'Mock authentication failure',
        status: 'AUTH_ERROR',
        statusCode: 401,
      };
    }

    return {
      success: false,
      error: 'Mock temporary error',
      status: 'TEMPORARY_ERROR',
      statusCode: 500,
    };
  }

  public async getAccountUsage(_apiKey: string): Promise<{
    credits?: number;
    creditsType?: string;
    planType?: string;
    totalDailyQuota?: number;
    remainingCredits?: number;
    dailySentCount?: number;
    deliveredCount?: number;
    bouncedCount?: number;
    liveFromBrevo?: boolean;
    lastSyncedAt?: string;
  }> {
    return {
      credits: 300,
      totalDailyQuota: 300,
      remainingCredits: 285,
      dailySentCount: 15,
      deliveredCount: 15,
      bouncedCount: 0,
      creditsType: 'free',
      planType: 'free',
      liveFromBrevo: true,
      lastSyncedAt: new Date().toISOString(),
    };
  }

  public async getEmailDeliveryStatus(
    _apiKey: string,
    _messageId: string
  ): Promise<{
    status: 'delivered' | 'sent' | 'bounced' | 'blocked' | 'opened' | 'unknown';
    events?: Array<{ name: string; time?: string }>;
    date?: string;
  }> {
    return {
      status: 'delivered',
      events: [
        { name: 'sent', time: new Date().toISOString() },
        { name: 'delivered', time: new Date().toISOString() },
      ],
      date: new Date().toISOString(),
    };
  }

  public async getDomainDnsRecords(
    _apiKey: string,
    domainName: string
  ): Promise<{
    domainId?: string;
    authenticated: boolean;
    dnsRecords: DomainDnsRecord[];
  }> {
    return {
      domainId: 'mock_dom_123',
      authenticated: false,
      dnsRecords: [
        {
          type: 'TXT',
          hostName: `mail._domainkey.${domainName}`,
          value: 'k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQ...',
          purpose: 'dkim',
        },
        {
          type: 'TXT',
          hostName: '@',
          value: 'v=spf1 include:spf.brevo.com ~all',
          purpose: 'spf',
        },
        {
          type: 'TXT',
          hostName: `_dmarc.${domainName}`,
          value: 'v=DMARC1; p=none;',
          purpose: 'dmarc',
        },
      ],
    };
  }

  public async verifyDomain(
    _apiKey: string,
    _domainName: string
  ): Promise<{
    verified: boolean;
    authenticated: boolean;
    error?: string;
  }> {
    return {
      verified: true,
      authenticated: true,
    };
  }

  public async registerSender(
    _apiKey: string,
    _sender: { name: string; email: string }
  ): Promise<{
    senderId: string;
    active: boolean;
  }> {
    return {
      senderId: `mock_sender_${Date.now()}`,
      active: true,
    };
  }

  public async deleteDomain(_apiKey: string, _domainName: string): Promise<boolean> {
    return true;
  }

  public async deleteSender(_apiKey: string, _senderId: string): Promise<boolean> {
    return true;
  }

  public async listSenders(_apiKey: string): Promise<Array<{ id: string; name: string; email: string; active: boolean }>> {
    return [
      { id: 'mock_sender_1', name: 'Mock Support', email: 'support@example.com', active: true }
    ];
  }
}
