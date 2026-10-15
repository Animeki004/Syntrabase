import { z } from 'zod';

// -----------------------------------------------------------------------------
// 1. Identity & Auth Schemas
// -----------------------------------------------------------------------------

export const RegisterDeveloperSchema = z.object({
  email: z.string().email().min(5).max(255).toLowerCase().trim(),
  password: z
    .string()
    .min(10, 'Password must be at least 10 characters')
    .max(128)
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
  displayName: z.string().min(2).max(100).optional(),
});

export const LoginDeveloperSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  password: z.string().min(1).max(128),
});

export const RefreshTokenSchema = z.object({
  refreshToken: z.string().min(10),
});

export const RevokeTokenSchema = z.object({
  refreshToken: z.string().min(10),
});

export const RegisterAppUserSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  password: z.string().min(8).max(128),
  displayName: z.string().max(100).optional(),
});

export const LoginAppUserSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  password: z.string().min(1).max(128),
});

// -----------------------------------------------------------------------------
// 2. Project & Credential Schemas
// -----------------------------------------------------------------------------

export const CreateProjectSchema = z.object({
  name: z.string().min(2).max(64).trim(),
  slug: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9-]+$/, 'Slug must be alphanumeric with hyphens'),
  organizationId: z.string().uuid(),
});

export const CreateCredentialSchema = z.object({
  name: z.string().min(2).max(64).trim(),
  type: z.enum(['publishable', 'secret']),
  allowedOrigins: z.array(z.string().url()).default([]),
  scopes: z.array(z.string()).default(['read', 'write']),
});

// -----------------------------------------------------------------------------
// 3. Document CRUD & Query Schemas
// -----------------------------------------------------------------------------

export const DocumentDataSchema = z.record(z.string(), z.unknown());

export const SetDocumentSchema = z.object({
  data: DocumentDataSchema,
  merge: z.boolean().default(false),
});

export const UpdateDocumentSchema = z.object({
  data: DocumentDataSchema,
});

export const QueryFilterOperatorSchema = z.enum([
  '==',
  '!=',
  '<',
  '<=',
  '>',
  '>=',
  'in',
  'not-in',
  'array-contains',
  'array-contains-any',
]);

export const SafeIdentifierRegex = /^[a-zA-Z0-9_.]+$/;

export const QueryFilterSchema = z.object({
  field: z.string().min(1).max(255).regex(SafeIdentifierRegex, 'Field name must be alphanumeric characters, underscores, or dots'),
  operator: QueryFilterOperatorSchema,
  value: z.unknown(),
});

export const QueryOrderBySchema = z.object({
  field: z.string().min(1).max(255).regex(SafeIdentifierRegex, 'Field name must be alphanumeric characters, underscores, or dots'),
  direction: z.enum(['asc', 'desc']).default('asc'),
});

export const ExecuteQuerySchema = z.object({
  collectionPath: z.string().min(1).max(512),
  filters: z.array(QueryFilterSchema).default([]),
  orderBy: z.array(QueryOrderBySchema).default([]),
  limit: z.number().int().min(1).max(500).default(50),
  startAfter: z.string().optional(),
});

export const BatchWriteOperationSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('set'),
    path: z.string().min(1),
    data: DocumentDataSchema,
    merge: z.boolean().optional(),
  }),
  z.object({
    type: z.literal('update'),
    path: z.string().min(1),
    data: DocumentDataSchema,
  }),
  z.object({
    type: z.literal('delete'),
    path: z.string().min(1),
  }),
]);

export const BatchWriteSchema = z.object({
  operations: z.array(BatchWriteOperationSchema).min(1).max(500),
});

// -----------------------------------------------------------------------------
// 4. Security Rules Schemas
// -----------------------------------------------------------------------------

export const PublishSecurityRulesSchema = z.object({
  sourceCode: z.string().min(1).max(100000), // Max 100 KB rule source
});

export const SimulateRuleSchema = z.object({
  sourceCode: z.string().min(1).max(100000), // Max 100 KB rule source
  path: z.string().min(1),
  method: z.enum(['get', 'list', 'create', 'update', 'delete']),
  auth: z
    .object({
      uid: z.string(),
      email: z.string().email().optional(),
      token: z.record(z.string(), z.unknown()).optional(),
    })
    .nullable(),
  resourceData: DocumentDataSchema.optional(),
  proposedData: DocumentDataSchema.optional(),
});

// -----------------------------------------------------------------------------
// 5. Storage Schemas
// -----------------------------------------------------------------------------

export const CreateSignedUploadUrlSchema = z.object({
  bucketName: z.string().min(1).max(64),
  objectPath: z.string().min(1).max(1024),
  contentType: z.string().min(1).max(128),
  sizeBytes: z.number().int().min(1).max(10485760), // Max 10MB
});

export const CreateSignedDownloadUrlSchema = z.object({
  bucketName: z.string().min(1).max(64),
  objectPath: z.string().min(1).max(1024),
  expiresInSeconds: z.number().int().min(60).max(86400).default(3600),
});

// -----------------------------------------------------------------------------
// 6. Plans & Capabilities Schemas
// -----------------------------------------------------------------------------

export const PlanCapabilitiesSchema = z.record(z.string(), z.boolean());

export const CreatePlanSchema = z.object({
  name: z.string().min(2).max(100).trim(),
  slug: z.string().min(2).max(50).regex(/^[a-z0-9-]+$/),
  description: z.string().max(500).optional(),
  isDefault: z.boolean().default(false),
  maxDbStorageBytes: z.number().int().min(1048576).default(52428800), // Min 1MB
  maxDocSizeBytes: z.number().int().min(1024).max(52428800).default(1048576), // Max 50MB
  maxApiRequestsPerWindow: z.number().int().min(10).default(1000),
  maxFileStorageBytes: z.number().int().min(0).default(0),
  maxRealtimeConnections: z.number().int().min(1).default(25),
  maxProjects: z.number().int().min(1).default(3),
  maxDatabases: z.number().int().min(1).default(1),
  capabilities: PlanCapabilitiesSchema.default({
    'database.documents': true,
    'database.realtime': true,
    'storage.objects': false,
    'auth.email': true,
    'auth.anonymous': true,
  }),
});

export const UpdatePlanSchema = CreatePlanSchema.partial();

export const AssignProjectPlanSchema = z.object({
  planId: z.string().uuid(),
  overrides: z.record(z.string(), z.unknown()).optional(),
});

export const CreateDatabaseSchema = z.object({
  databaseId: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[a-z0-9_-]+$/, 'Database ID must be alphanumeric with hyphens or underscores'),
  name: z.string().min(2).max(100).trim(),
});

// -----------------------------------------------------------------------------
// 7. Email Lifecycle & Action Token Schemas
// -----------------------------------------------------------------------------

export const VerifyEmailSchema = z.object({
  token: z.string().min(16).max(256),
});

export const ResendVerificationSchema = z.object({
  email: z.string().email().toLowerCase(),
});

export const ForgotPasswordSchema = z.object({
  email: z.string().email().toLowerCase(),
});

export const ResetPasswordSchema = z.object({
  token: z.string().min(16).max(256),
  newPassword: z.string().min(8).max(128),
});

export const ConfigureEmailProviderSchema = z.object({
  providerType: z.enum(['smtp', 'resend', 'mock']).default('smtp'),
  fromEmail: z.string().email(),
  fromName: z.string().max(100).optional(),
  host: z.string().max(255).optional(),
  port: z.number().int().min(1).max(65535).default(587).optional(),
  secure: z.boolean().default(false).optional(),
  apiKey: z.string().max(500).optional(), // for Resend or SMTP password
  username: z.string().max(255).optional(), // for SMTP
});

// -----------------------------------------------------------------------------
// 8. Account Linking Schemas
// -----------------------------------------------------------------------------

export const LinkAccountSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(8).max(128),
  displayName: z.string().max(100).optional(),
});

// -----------------------------------------------------------------------------
// 9. Interactive Transactions Schemas
// -----------------------------------------------------------------------------

export const TransactionPreconditionSchema = z.object({
  path: z.string().min(1),
  expectedVersion: z.number().int().nonnegative().optional(),
  mustNotExist: z.boolean().optional(),
});

export const TransactionWriteOpSchema = z.object({
  type: z.enum(['set', 'update', 'delete']),
  path: z.string().min(1),
  data: DocumentDataSchema.optional(),
});

export const TransactionCommitSchema = z.object({
  preconditions: z.array(TransactionPreconditionSchema).default([]),
  writes: z.array(TransactionWriteOpSchema).min(1).max(500),
});

// -----------------------------------------------------------------------------
// 10. Cloud Function Triggers Schemas
// -----------------------------------------------------------------------------

export const CreateCloudTriggerSchema = z.object({
  name: z.string().min(2).max(100).regex(/^[a-zA-Z0-9_-]+$/),
  collectionPath: z.string().min(1).max(500),
  eventType: z.enum(['create', 'update', 'delete', 'write']),
  endpointUrl: z.string().url(),
  secretKey: z.string().min(16).max(128).optional(),
});

// -----------------------------------------------------------------------------
// 11. Project Auth Configuration & MFA Schemas
// -----------------------------------------------------------------------------

export const PasswordPolicySchema = z.object({
  minLength: z.number().int().min(6).max(64).default(8),
  requireUppercase: z.boolean().default(false),
  requireLowercase: z.boolean().default(false),
  requireNumbers: z.boolean().default(false),
  requireSymbols: z.boolean().default(false),
  maxAgeDays: z.number().int().min(0).max(365).default(0),
});

export const SessionPolicySchema = z.object({
  accessTokenTtlMinutes: z.number().int().min(5).max(1440).default(15),
  refreshTokenTtlDays: z.number().int().min(1).max(90).default(7),
  singleSessionPerUser: z.boolean().default(false),
});

export const MfaPolicySchema = z.object({
  enabled: z.boolean().default(false),
  enforceForAdmins: z.boolean().default(false),
  allowedFactors: z.array(z.enum(['totp', 'sms'])).default(['totp']),
});

export const EmailTemplateConfigSchema = z.object({
  senderName: z.string().min(1).max(100),
  fromEmail: z.string().email(),
  replyTo: z.string().email(),
  subject: z.string().min(1).max(255),
  body: z.string().min(1).max(10000),
});

export const UpdateProjectAuthConfigSchema = z.object({
  emailPasswordEnabled: z.boolean().optional(),
  emailLinkEnabled: z.boolean().optional(),
  anonymousEnabled: z.boolean().optional(),
  phoneEnabled: z.boolean().optional(),
  googleOauthEnabled: z.boolean().optional(),
  githubOauthEnabled: z.boolean().optional(),
  appleOauthEnabled: z.boolean().optional(),
  requireEmailVerification: z.boolean().optional(),
  passwordPolicy: PasswordPolicySchema.optional(),
  accountLinkingMode: z.enum(['link_same_email', 'multiple_accounts']).optional(),
  signupQuotaPerWindow: z.number().int().min(1).max(10000).optional(),
  authorizedDomains: z.array(z.string().min(1).max(255)).optional(),
  sessionPolicy: SessionPolicySchema.optional(),
  mfaPolicy: MfaPolicySchema.optional(),
  activityLoggingEnabled: z.boolean().optional(),
});

export const ConfigureAuthProviderSchema = z.object({
  provider: z.enum(['google', 'github', 'apple', 'phone', 'email_password', 'anonymous']),
  enabled: z.boolean(),
  clientId: z.string().max(255).optional(),
  clientSecret: z.string().max(500).optional(),
  redirectUri: z.string().url().optional(),
  smsSenderId: z.string().max(50).optional(),
  dailySmsQuota: z.number().int().min(0).max(10000).optional(),
  allowedRegions: z.array(z.string().length(2)).optional(),
});

export const UpdateEmailTemplateSchema = z.object({
  templateType: z.enum(['verify_email', 'password_reset', 'email_change', 'mfa_enrollment']),
  template: EmailTemplateConfigSchema,
});

export const AdminCreateUserSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  password: z.string().min(6).max(128),
  displayName: z.string().max(100).optional(),
  phoneNumber: z.string().max(50).optional(),
  emailVerified: z.boolean().default(false),
  disabled: z.boolean().default(false),
});

export const AdminUpdateUserSchema = z.object({
  email: z.string().email().toLowerCase().trim().optional(),
  displayName: z.string().max(100).optional(),
  phoneNumber: z.string().max(50).optional(),
  emailVerified: z.boolean().optional(),
  disabled: z.boolean().optional(),
  password: z.string().min(6).max(128).optional(),
  customClaims: z.record(z.string(), z.unknown()).optional(),
});

export const VerifyTotpMfaSchema = z.object({
  token: z.string().length(6).regex(/^[0-9]+$/),
});

export const DeveloperForgotPasswordSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
});

export const DeveloperResetPasswordSchema = z.object({
  token: z.string().min(10).max(255),
  newPassword: z
    .string()
    .min(10, 'Password must be at least 10 characters')
    .max(128)
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
});

export const ReplyContactInquirySchema = z.object({
  reply: z.string().min(5, 'Reply must be at least 5 characters').max(4000),
  status: z.enum(['open', 'in_progress', 'resolved', 'closed']).default('resolved'),
  repliedBy: z.string().max(255).optional(),
});

export const FollowUpContactMessageSchema = z.object({
  message: z.string().min(2, 'Message must be at least 2 characters').max(4000),
  senderName: z.string().max(255).optional(),
});


