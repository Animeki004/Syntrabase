import {
  EmailProviderType,
  OutboundEmailParams,
  OutboundEmailResult,
  DomainDnsRecord,
} from '@syntrabase/shared-types';

export interface ProviderAccountIdentity {
  email: string;
  companyName?: string;
  planInfo?: Record<string, unknown>;
}

export interface IEmailProviderAdapter {
  readonly providerType: EmailProviderType;

  /**
   * Validates provider credentials through a harmless authenticated API call.
   */
  validateCredentials(apiKey: string): Promise<{
    valid: boolean;
    accountIdentity?: ProviderAccountIdentity;
    error?: string;
  }>;

  /**
   * Submits a transactional email to the provider.
   */
  sendEmail(
    apiKey: string,
    params: OutboundEmailParams
  ): Promise<OutboundEmailResult>;

  /**
   * Retrieves verified account usage and credit allowances if supported by the provider.
   */
  getAccountUsage(apiKey: string): Promise<{
    credits?: number;
    creditsType?: string;
    planType?: string;
    [key: string]: unknown;
  }>;

  /**
   * Retrieves or registers custom sending domain DNS records from the provider.
   */
  getDomainDnsRecords(
    apiKey: string,
    domainName: string
  ): Promise<{
    domainId?: string;
    authenticated: boolean;
    dnsRecords: DomainDnsRecord[];
  }>;

  /**
   * Verifies domain authentication status with the provider.
   */
  verifyDomain(
    apiKey: string,
    domainName: string
  ): Promise<{
    verified: boolean;
    authenticated: boolean;
    error?: string;
  }>;

  /**
   * Registers an authorized sender identity with the provider.
   */
  registerSender(
    apiKey: string,
    sender: { name: string; email: string }
  ): Promise<{
    senderId: string;
    active: boolean;
  }>;

  /**
   * Deletes a registered domain from the provider if supported.
   */
  deleteDomain?(apiKey: string, domainName: string): Promise<boolean>;

  /**
   * Deletes a registered sender from the provider if supported.
   */
  deleteSender?(apiKey: string, senderId: string): Promise<boolean>;

  /**
   * Lists senders registered on the provider account.
   */
  listSenders?(apiKey: string): Promise<Array<{ id: string; name: string; email: string; active: boolean }>>;
}
