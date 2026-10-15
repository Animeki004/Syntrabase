/**
 * Comprehensive Shared Types for the Self-Hosted Firebase-Compatible Platform
 */

// -----------------------------------------------------------------------------
// 1. Identity, Tenancy & Projects
// -----------------------------------------------------------------------------

export type Role = 'owner' | 'admin' | 'developer' | 'viewer';

export interface Developer {
  id: string;
  email: string;
  displayName?: string;
  emailVerified: boolean;
  isPlatformAdmin: boolean;
  status?: 'active' | 'suspended';
  createdAt: string;
  updatedAt: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationMember {
  organizationId: string;
  developerId: string;
  role: Role;
  joinedAt: string;
}

export interface Project {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  status: 'active' | 'suspended' | 'archived';
  dedicatedBrevoEnabled?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Environment {
  id: string;
  projectId: string;
  name: 'development' | 'staging' | 'production' | string;
  slug: string;
  isDefault: boolean;
  createdAt: string;
}

// -----------------------------------------------------------------------------
// 2. Application Users & Auth
// -----------------------------------------------------------------------------

export interface AppUser {
  id: string;
  projectId: string;
  environmentId: string;
  email?: string;
  displayName?: string;
  photoURL?: string;
  emailVerified: boolean;
  disabled: boolean;
  customClaims: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
}

export interface AuthSession {
  id: string;
  userId: string;
  refreshTokenHash: string;
  userAgent?: string;
  ipAddress?: string;
  expiresAt: string;
  revokedAt?: string;
  createdAt: string;
}

export interface TokenPayload {
  uid: string;
  email?: string;
  projectId: string;
  environmentId: string;
  isPlatformAdmin?: boolean;
  roles?: string[];
  claims?: Record<string, unknown>;
  iat: number;
  exp: number;
}

export interface AuthResponse {
  user?: AppUser | Developer;
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  mfaRequired?: boolean;
  mfaSession?: string;
  allowedFactors?: ('totp' | 'passkey')[];
}

export interface MfaChallengeResponse {
  mfaRequired: true;
  mfaSession: string;
  allowedFactors: ('totp' | 'passkey')[];
  enrollmentRequired?: boolean;
}

// -----------------------------------------------------------------------------
// 3. API Credentials & Secret Lifecycle
// -----------------------------------------------------------------------------

export type CredentialType = 'publishable' | 'secret';

export interface ApiCredential {
  id: string;
  projectId: string;
  environmentId: string;
  type: CredentialType;
  name: string;
  keyPrefix: string; // e.g. "pk_live_" or "sk_live_"
  keyIdentifier: string; // safe public lookup ID
  hashedSecret?: string; // only present in DB, never serialized
  allowedOrigins: string[];
  scopes: string[];
  revoked: boolean;
  expiresAt?: string;
  lastUsedAt?: string;
  createdAt: string;
}

// -----------------------------------------------------------------------------
// 4. Firestore-Style Document Database
// -----------------------------------------------------------------------------

export type DocumentData = Record<string, unknown>;

export interface DocumentSnapshot {
  id: string;
  path: string;
  data: DocumentData;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export type QueryFilterOperator =
  | '=='
  | '!='
  | '<'
  | '<='
  | '>'
  | '>='
  | 'in'
  | 'not-in'
  | 'array-contains'
  | 'array-contains-any';

export interface QueryFilter {
  field: string;
  operator: QueryFilterOperator;
  value: unknown;
}

export interface QueryOrderBy {
  field: string;
  direction: 'asc' | 'desc';
}

export interface QueryParams {
  collectionPath: string;
  filters?: QueryFilter[];
  orderBy?: QueryOrderBy[];
  limit?: number;
  startAfter?: string; // cursor token / doc ID
  projection?: string[]; // field mask
}

export type BatchWriteOperation =
  | { type: 'set'; path: string; data: DocumentData; merge?: boolean }
  | { type: 'update'; path: string; data: DocumentData }
  | { type: 'delete'; path: string };

export interface BatchWriteRequest {
  operations: BatchWriteOperation[];
}

export interface BatchWriteResult {
  appliedCount: number;
  committedAt: string;
}

// -----------------------------------------------------------------------------
// 5. Transactional Outbox & Realtime Sync
// -----------------------------------------------------------------------------

export type OutboxEventType = 'document_created' | 'document_updated' | 'document_deleted';

export interface OutboxEvent {
  sequenceId: string; // BIGINT as string
  projectId: string;
  environmentId: string;
  collectionPath: string;
  documentId: string;
  eventType: OutboxEventType;
  payload: DocumentData;
  version: number;
  createdAt: string;
}

export interface RealtimeSubscription {
  subscriptionId: string;
  projectId: string;
  environmentId: string;
  collectionPath: string;
  documentId?: string;
  filters?: QueryFilter[];
  lastCheckpointId?: string;
}

export type RealtimeDeltaType = 'added' | 'modified' | 'removed';

export interface RealtimeDelta {
  type: RealtimeDeltaType;
  sequenceId: string;
  doc: DocumentSnapshot;
}

// -----------------------------------------------------------------------------
// 6. Security Rules & Evaluation
// -----------------------------------------------------------------------------

export interface SecurityRuleVersion {
  id: string;
  projectId: string;
  versionNumber: number;
  sourceCode: string;
  astJson: Record<string, unknown>;
  status: 'draft' | 'published' | 'archived';
  publishedAt?: string;
  publishedBy?: string;
  createdAt: string;
}

export interface RuleEvaluationContext {
  request: {
    auth: {
      uid: string;
      email?: string;
      token?: Record<string, unknown>;
    } | null;
    resource?: {
      data: DocumentData;
    };
    time: string;
    method: 'get' | 'list' | 'create' | 'update' | 'delete';
  };
  resource?: {
    data: DocumentData;
  };
  params: Record<string, string>;
}

export interface RuleEvaluationResult {
  allowed: boolean;
  matchedRule?: string;
  reason?: string;
  evaluatedAt: string;
}

// -----------------------------------------------------------------------------
// 7. File Storage Subsystem
// -----------------------------------------------------------------------------

export interface StorageBucket {
  id: string;
  projectId: string;
  name: string;
  isPublic: boolean;
  quotaBytes: number;
  usedBytes: number;
  createdAt: string;
}

export interface StorageObjectMetadata {
  id: string;
  bucketId: string;
  projectId: string;
  objectPath: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  contentHash: string; // SHA-256
  isPublic: boolean;
  metadata?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

// -----------------------------------------------------------------------------
// 8. Cryptographic Audit Ledger & Security Operations (SOC)
// -----------------------------------------------------------------------------

export interface AuditEntry {
  sequenceId: string;
  prevHash: string;
  currentHash: string;
  timestamp: string;
  actorId: string;
  actorType: 'developer' | 'app_user' | 'system' | 'api_key';
  action: string;
  targetResource: string;
  projectId?: string;
  ipAddress?: string;
  userAgent?: string;
  payload: Record<string, unknown>;
}

export type SecuritySeverity = 'low' | 'medium' | 'high' | 'critical';

export interface SecurityEvent {
  id: string;
  timestamp: string;
  severity: SecuritySeverity;
  category:
    | 'auth_failure'
    | 'rate_limit_tripped'
    | 'cross_tenant_denied'
    | 'rules_violation'
    | 'token_reuse'
    | 'admin_action';
  sourceIp?: string;
  actorId?: string;
  projectId?: string;
  details: Record<string, unknown>;
}

export type ResponseLevel =
  | 'LEVEL_0_OBSERVE'
  | 'LEVEL_1_THROTTLE'
  | 'LEVEL_2_QUARANTINE'
  | 'LEVEL_3_CONTAINMENT'
  | 'LEVEL_4_HUMAN_RECOVERY';

export interface AutomatedDefenseAction {
  id: string;
  eventId: string;
  level: ResponseLevel;
  actionTaken: string;
  scope: string;
  reverted: boolean;
  executedAt: string;
}

// -----------------------------------------------------------------------------
// 9. Quotas & Platform Telemetry
// -----------------------------------------------------------------------------

export interface QuotaUsage {
  projectId: string;
  storageBytesUsed: number;
  storageBytesLimit: number;
  documentReadsCount: number;
  documentWritesCount: number;
  apiRequestsCount: number;
  realtimeConnectionsActive: number;
  periodStart: string;
  periodEnd: string;
}

export interface PlatformHealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  uptimeSeconds: number;
  database: {
    connected: boolean;
    activeConnections: number;
    latencyMs: number;
  };
  memory: {
    totalBytes: number;
    usedBytes: number;
    rssBytes: number;
  };
  outbox: {
    pendingEvents: number;
    lastSequenceId: string;
  };
}

// -----------------------------------------------------------------------------
// 10. Plans & Capability Enforcement
// -----------------------------------------------------------------------------

export interface PlanCapabilities {
  'database.documents': boolean;
  'database.realtime': boolean;
  'storage.objects': boolean;
  'auth.email': boolean;
  'auth.anonymous': boolean;
  [key: string]: boolean;
}

export interface PlanLimits {
  maxDbStorageBytes: number;
  maxDocSizeBytes: number;
  maxApiRequestsPerWindow: number;
  maxFileStorageBytes: number;
  maxRealtimeConnections: number;
  maxProjects?: number;
  maxDatabases?: number;
}

export interface Plan {
  id: string;
  name: string;
  slug: string;
  description?: string;
  isDefault: boolean;
  maxDbStorageBytes: number;
  maxDocSizeBytes: number;
  maxApiRequestsPerWindow: number;
  maxFileStorageBytes: number;
  maxRealtimeConnections: number;
  maxProjects?: number;
  maxDatabases?: number;
  capabilities: PlanCapabilities;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectDatabase {
  id: string;
  projectId: string;
  databaseId: string;
  name: string;
  engine: string;
  status: 'ready' | 'provisioning' | 'deleting';
  createdAt: string;
  updatedAt: string;
}

export interface ProjectPlanContext {
  projectId: string;
  planId: string;
  planName: string;
  planSlug: string;
  capabilities: PlanCapabilities;
  limits: PlanLimits;
  usage: {
    dbStorageBytes: number;
    fileStorageBytes: number;
    activeConnections: number;
    projectCount?: number;
    databaseCount?: number;
  };
  isOverride: boolean;
}

// -----------------------------------------------------------------------------
// 11. Transactional Email & Action Codes
// -----------------------------------------------------------------------------

export type EmailActionType = 'VERIFY_EMAIL' | 'PASSWORD_RESET';

export interface EmailActionToken {
  id: string;
  projectId: string;
  environmentId: string;
  userId: string;
  actionType: EmailActionType;
  tokenHash: string;
  expiresAt: string;
  redeemedAt?: string;
  createdAt: string;
}

export interface EmailProviderConfig {
  id: string;
  projectId: string;
  providerType: 'smtp' | 'resend' | 'mock';
  fromEmail: string;
  fromName?: string;
  host?: string;
  port?: number;
  secure?: boolean;
  encryptedCredentials?: {
    iv: string;
    authTag: string;
    ciphertext: string;
  };
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface EmailDeliveryLog {
  id: string;
  projectId: string;
  recipientEmail: string;
  actionType: string;
  provider: string;
  status: 'sent' | 'failed';
  errorMessage?: string;
  createdAt: string;
}

// -----------------------------------------------------------------------------
// 12. Anonymous Auth & Account Linking
// -----------------------------------------------------------------------------

export interface AnonymousAuthPayload {
  projectId: string;
  environmentId?: string;
}

export interface LinkAccountPayload {
  email: string;
  password: string;
}

// -----------------------------------------------------------------------------
// 13. Field Value Transforms
// -----------------------------------------------------------------------------

export type TransformSentinelType = 
  | '__SYNTRABASE_SERVER_TIMESTAMP__'
  | '__SYNTRABASE_INCREMENT__'
  | '__SYNTRABASE_ARRAY_UNION__'
  | '__SYNTRABASE_ARRAY_REMOVE__'
  | '__SYNTRABASE_DELETE_FIELD__';

export interface TransformSentinel {
  _transformType: TransformSentinelType;
  value?: unknown;
}

// -----------------------------------------------------------------------------
// 14. Interactive Database Transactions
// -----------------------------------------------------------------------------

export interface TransactionPrecondition {
  path: string;
  expectedVersion?: number;
  mustNotExist?: boolean;
}

export interface TransactionWriteOp {
  type: 'set' | 'update' | 'delete';
  path: string;
  data?: Record<string, unknown>;
}

export interface TransactionCommitPayload {
  preconditions: TransactionPrecondition[];
  writes: TransactionWriteOp[];
}

export interface TransactionCommitResult {
  committed: boolean;
  versions: Record<string, number>;
  conflictedPath?: string;
}

// -----------------------------------------------------------------------------
// 15. Collection Group Queries
// -----------------------------------------------------------------------------

export interface CollectionGroupQueryOptions {
  collectionId: string;
  limit?: number;
  offset?: number;
}

// -----------------------------------------------------------------------------
// 16. Cloud Function Triggers & Executions
// -----------------------------------------------------------------------------

export interface CloudTrigger {
  id: string;
  projectId: string;
  environmentId: string;
  name: string;
  collectionPath: string;
  eventType: 'create' | 'update' | 'delete' | 'write';
  endpointUrl: string;
  secretKey: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CloudExecution {
  id: string;
  triggerId: string;
  projectId: string;
  eventId: string;
  status: 'success' | 'failed' | 'retrying';
  attemptCount: number;
  httpStatus?: number;
  errorMessage?: string;
  payload?: Record<string, unknown>;
  executedAt: string;
}

// -----------------------------------------------------------------------------
// 17. Project Authentication Configuration & Lifecycle Types
// -----------------------------------------------------------------------------

export type AuthProviderId =
  | 'email_password'
  | 'email_link'
  | 'anonymous'
  | 'phone'
  | 'google'
  | 'github'
  | 'apple';

export type ProviderStatus =
  | 'Available'
  | 'Enabled'
  | 'Disabled'
  | 'Configuration Required'
  | 'Unsupported'
  | 'Plan Restricted';

export interface PasswordPolicy {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSymbols: boolean;
  maxAgeDays: number;
}

export interface SessionPolicy {
  accessTokenTtlMinutes: number;
  refreshTokenTtlDays: number;
  singleSessionPerUser: boolean;
}

export interface UserActionsConfig {
  enableCreate: boolean; // Enable create (sign-up)
  enableDelete: boolean; // Enable delete (self account deletion)
  emailEnumerationProtection: boolean; // Protect against account enumeration
}

export type MfaEnforcementLevel = 'optional' | 'required_all' | 'required_selected';

export interface MfaPolicy {
  enabled: boolean;
  enforcement: MfaEnforcementLevel;
  enforceForAdmins: boolean; // Backwards compatible shortcut
  allowedFactors: ('totp' | 'passkey' | 'sms')[];
  selectedCriteria?: {
    roles?: string[]; // e.g. ['admin', 'employee']
    customClaims?: string[]; // e.g. ['mfaRequired']
  };
}

export interface PasskeyRecord {
  id: string;
  credentialId: string;
  deviceName: string;
  createdAt: string;
  lastUsedAt?: string;
  aaguid?: string;
}

export interface MfaChallengeSession {
  mfaRequired: true;
  mfaSession: string; // Short-lived single-use bound challenge token
  allowedFactors: ('totp' | 'passkey')[];
  user: {
    id: string;
    email: string;
    displayName?: string;
  };
}

export interface EmailTemplateConfig {
  senderName: string;
  fromEmail: string;
  replyTo: string;
  subject: string;
  body: string;
}

export type EmailTemplateType =
  | 'verify_email'
  | 'password_reset'
  | 'email_change'
  | 'mfa_enrollment';

export type EmailTemplatesMap = Record<EmailTemplateType, EmailTemplateConfig>;

export interface BlockingFunctionsConfig {
  beforeCreate?: string | null;
  beforeSignIn?: string | null;
}

export interface ProjectAuthConfig {
  id: string;
  projectId: string;
  emailPasswordEnabled: boolean;
  emailLinkEnabled: boolean;
  anonymousEnabled: boolean;
  phoneEnabled: boolean;
  googleOauthEnabled: boolean;
  githubOauthEnabled: boolean;
  appleOauthEnabled: boolean;
  providersConfig: Record<string, Record<string, unknown>>;
  requireEmailVerification: boolean;
  passwordPolicy: PasswordPolicy;
  userActions: UserActionsConfig;
  accountLinkingMode: 'link_same_email' | 'multiple_accounts';
  signupQuotaPerWindow: number;
  authorizedDomains: string[];
  sessionPolicy: SessionPolicy;
  mfaPolicy: MfaPolicy;
  activityLoggingEnabled: boolean;
  blockingFunctions: BlockingFunctionsConfig;
  emailTemplates: EmailTemplatesMap;
  createdAt: string;
  updatedAt: string;
}

export interface AuthActivityLog {
  id: string;
  projectId: string;
  environmentId: string;
  actorId: string;
  actorEmail?: string;
  eventType: string;
  provider?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface AuthUsageTelemetry {
  totalUsers: number;
  activeUsers: number;
  anonymousUsers: number;
  verifiedUsers: number;
  disabledUsers: number;
  successfulSignIns: number;
  failedSignIns: number;
  totalSignups: number;
  passwordResetsSent: number;
  verificationsSent: number;
  rateLimitRejections: number;
  providerBreakdown: Record<string, number>;
}

export interface TotpEnrollmentResult {
  secret: string;
  otpauthUrl: string;
  qrCodeUrl: string;
  backupCodes: string[];
}

export interface TotpVerifyResult {
  verified: boolean;
  factorId: string;
}

// -----------------------------------------------------------------------------
// 18. Provider-Independent Email Infrastructure & Brevo Types
// -----------------------------------------------------------------------------

export type EmailProviderType = 'brevo' | 'smtp' | 'resend' | 'mock';

export type ProviderAccountStatus =
  | 'healthy'
  | 'rate_limited'
  | 'quota_exhausted'
  | 'invalid_credentials'
  | 'disabled';

export interface EmailProviderAccount {
  id: string;
  projectId?: string;
  providerType: EmailProviderType;
  accountName: string;
  maskedApiKey: string;
  isEnabled: boolean;
  status: ProviderAccountStatus;
  accountEmail?: string;
  companyName?: string;
  lastHealthCheckAt?: string;
  lastError?: string;
  dailySentCount?: number;
  monthlySentCount?: number;
  dailyResetAt?: string;
  monthlyResetAt?: string;
  pausedUntil?: string;
  providerPlanInfo?: {
    credits?: number;
    creditsType?: string;
    planType?: string;
    [key: string]: unknown;
  };
  associatedDomains?: Array<{
    id: string;
    domainName: string;
    projectId: string;
    verificationStatus: string;
  }>;
  authorizedSenders?: Array<{
    id: string;
    displayName: string;
    emailAddress: string;
    projectId: string;
    status: string;
  }>;
  isSharedQuotaPool?: boolean;
  sharedWithAccountName?: string;
  isPrimary?: boolean;
  remainingCredits?: number;
  totalDailyQuota?: number;
  createdAt: string;
  updatedAt: string;
}

export interface DomainDnsRecord {
  type: 'TXT' | 'CNAME' | 'MX';
  hostName: string;
  value: string;
  purpose: 'dkim' | 'ownership' | 'spf' | 'dmarc' | 'branding';
  status?: 'verified' | 'pending' | 'missing';
  proxyStatus?: 'dns_only' | 'proxied';
  notes?: string;
}

export type DomainVerificationStatus = 'pending' | 'verified' | 'failed' | 'suspended';

export interface CustomSenderDomain {
  id: string;
  projectId: string;
  domainName: string;
  providerAccountId?: string;
  providerDomainId?: string;
  verificationStatus: DomainVerificationStatus;
  dnsRecords: DomainDnsRecord[];
  lastDnsCheckAt?: string;
  lastError?: string;
  createdAt: string;
  verifiedAt?: string;
}

export interface AuthorizedSenderIdentity {
  id: string;
  projectId: string;
  domainId: string;
  displayName: string;
  emailAddress: string;
  providerSenderId?: string;
  status: 'active' | 'pending_verification' | 'revoked';
  createdAt: string;
}

export type EmailOutboxStatus = 'queued' | 'processing' | 'sent' | 'deferred' | 'failed';

export interface EmailOutboxItem {
  id: string;
  projectId: string;
  recipientEmail: string;
  recipientName?: string;
  senderEmail: string;
  senderName: string;
  replyTo?: string;
  subject: string;
  htmlBody?: string;
  textBody?: string;
  actionType: string;
  status: EmailOutboxStatus;
  attempts: number;
  maxAttempts: number;
  nextRetryAt?: string;
  idempotencyKey?: string;
  providerAccountId?: string;
  providerMessageId?: string;
  errorMessage?: string;
  createdAt: string;
  processedAt?: string;
}

export interface EmailPlatformPolicy {
  id: number;
  globalSendingEnabled: boolean;
  emergencyShutdown: boolean;
  dailyProjectCap: number;
  maxRetryAttempts: number;
  defaultProviderType: EmailProviderType;
  updatedAt: string;
}

export interface OutboundEmailParams {
  projectId: string;
  toEmail: string;
  toName?: string;
  fromEmail: string;
  fromName: string;
  replyTo?: string;
  subject: string;
  html?: string;
  text?: string;
  actionType?: string;
  queueId?: string;
}

export interface OutboundEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
  statusCode?: number;
  status: 'SENT' | 'RATE_LIMITED' | 'QUOTA_EXCEEDED' | 'AUTH_ERROR' | 'DOMAIN_ERROR' | 'TEMPORARY_ERROR' | 'PERMANENT_ERROR';
}

// -----------------------------------------------------------------------------
// 19. Contact Center & Internal Operations Notifications
// -----------------------------------------------------------------------------

export type ContactCategory =
  | 'Technical Support'
  | 'Billing Inquiry'
  | 'Security & Vulnerability'
  | 'Feature Request'
  | 'Operational Issue';

export type ContactStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

export interface ContactInquiryMessage {
  id: string;
  inquiryId: string;
  senderType: 'operator' | 'developer';
  senderName?: string;
  senderEmail?: string;
  message: string;
  createdAt: string;
}

export interface ContactSubmission {
  id: string;
  ticketReference: string;
  projectId: string;
  userId?: string;
  userEmail?: string;
  category: ContactCategory;
  subject: string;
  message: string;
  replyEmail?: string;
  status: ContactStatus;
  adminReply?: string;
  repliedAt?: string;
  repliedBy?: string;
  messages?: ContactInquiryMessage[];
  createdAt: string;
}

export interface DeveloperForgotPasswordRequest {
  email: string;
}

export interface DeveloperResetPasswordRequest {
  token: string;
  newPassword: string;
}

export type NotificationCategory = 'contact' | 'email_infra' | 'email_queue' | 'security';
export type NotificationSeverity = 'info' | 'warning' | 'critical';

export interface InternalNotification {
  id: string;
  category: NotificationCategory;
  severity: NotificationSeverity;
  title: string;
  message: string;
  relatedId?: string;
  projectId?: string;
  isRead: boolean;
  createdAt: string;
}

