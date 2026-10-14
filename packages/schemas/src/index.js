"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreateSignedDownloadUrlSchema = exports.CreateSignedUploadUrlSchema = exports.SimulateRuleSchema = exports.PublishSecurityRulesSchema = exports.BatchWriteSchema = exports.BatchWriteOperationSchema = exports.ExecuteQuerySchema = exports.QueryOrderBySchema = exports.QueryFilterSchema = exports.QueryFilterOperatorSchema = exports.UpdateDocumentSchema = exports.SetDocumentSchema = exports.DocumentDataSchema = exports.CreateCredentialSchema = exports.CreateProjectSchema = exports.LoginAppUserSchema = exports.RegisterAppUserSchema = exports.RefreshTokenSchema = exports.LoginDeveloperSchema = exports.RegisterDeveloperSchema = void 0;
const zod_1 = require("zod");
// -----------------------------------------------------------------------------
// 1. Identity & Auth Schemas
// -----------------------------------------------------------------------------
exports.RegisterDeveloperSchema = zod_1.z.object({
    email: zod_1.z.string().email().min(5).max(255).toLowerCase().trim(),
    password: zod_1.z
        .string()
        .min(10, 'Password must be at least 10 characters')
        .max(128)
        .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
        .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
        .regex(/[0-9]/, 'Password must contain at least one number')
        .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
    displayName: zod_1.z.string().min(2).max(100).optional(),
});
exports.LoginDeveloperSchema = zod_1.z.object({
    email: zod_1.z.string().email().toLowerCase().trim(),
    password: zod_1.z.string().min(1).max(128),
});
exports.RefreshTokenSchema = zod_1.z.object({
    refreshToken: zod_1.z.string().min(10),
});
exports.RegisterAppUserSchema = zod_1.z.object({
    email: zod_1.z.string().email().toLowerCase().trim(),
    password: zod_1.z.string().min(8).max(128),
    displayName: zod_1.z.string().max(100).optional(),
});
exports.LoginAppUserSchema = zod_1.z.object({
    email: zod_1.z.string().email().toLowerCase().trim(),
    password: zod_1.z.string().min(1).max(128),
});
// -----------------------------------------------------------------------------
// 2. Project & Credential Schemas
// -----------------------------------------------------------------------------
exports.CreateProjectSchema = zod_1.z.object({
    name: zod_1.z.string().min(2).max(64).trim(),
    slug: zod_1.z
        .string()
        .min(2)
        .max(64)
        .regex(/^[a-z0-9-]+$/, 'Slug must be alphanumeric with hyphens'),
    organizationId: zod_1.z.string().uuid(),
});
exports.CreateCredentialSchema = zod_1.z.object({
    name: zod_1.z.string().min(2).max(64).trim(),
    type: zod_1.z.enum(['publishable', 'secret']),
    allowedOrigins: zod_1.z.array(zod_1.z.string().url()).default([]),
    scopes: zod_1.z.array(zod_1.z.string()).default(['read', 'write']),
});
// -----------------------------------------------------------------------------
// 3. Document CRUD & Query Schemas
// -----------------------------------------------------------------------------
exports.DocumentDataSchema = zod_1.z.record(zod_1.z.string(), zod_1.z.unknown());
exports.SetDocumentSchema = zod_1.z.object({
    data: exports.DocumentDataSchema,
    merge: zod_1.z.boolean().default(false),
});
exports.UpdateDocumentSchema = zod_1.z.object({
    data: exports.DocumentDataSchema,
});
exports.QueryFilterOperatorSchema = zod_1.z.enum([
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
exports.QueryFilterSchema = zod_1.z.object({
    field: zod_1.z.string().min(1).max(255),
    operator: exports.QueryFilterOperatorSchema,
    value: zod_1.z.unknown(),
});
exports.QueryOrderBySchema = zod_1.z.object({
    field: zod_1.z.string().min(1).max(255),
    direction: zod_1.z.enum(['asc', 'desc']).default('asc'),
});
exports.ExecuteQuerySchema = zod_1.z.object({
    collectionPath: zod_1.z.string().min(1).max(512),
    filters: zod_1.z.array(exports.QueryFilterSchema).default([]),
    orderBy: zod_1.z.array(exports.QueryOrderBySchema).default([]),
    limit: zod_1.z.number().int().min(1).max(500).default(50),
    startAfter: zod_1.z.string().optional(),
});
exports.BatchWriteOperationSchema = zod_1.z.discriminatedUnion('type', [
    zod_1.z.object({
        type: zod_1.z.literal('set'),
        path: zod_1.z.string().min(1),
        data: exports.DocumentDataSchema,
        merge: zod_1.z.boolean().optional(),
    }),
    zod_1.z.object({
        type: zod_1.z.literal('update'),
        path: zod_1.z.string().min(1),
        data: exports.DocumentDataSchema,
    }),
    zod_1.z.object({
        type: zod_1.z.literal('delete'),
        path: zod_1.z.string().min(1),
    }),
]);
exports.BatchWriteSchema = zod_1.z.object({
    operations: zod_1.z.array(exports.BatchWriteOperationSchema).min(1).max(500),
});
// -----------------------------------------------------------------------------
// 4. Security Rules Schemas
// -----------------------------------------------------------------------------
exports.PublishSecurityRulesSchema = zod_1.z.object({
    sourceCode: zod_1.z.string().min(1).max(100000), // Max 100 KB rule source
});
exports.SimulateRuleSchema = zod_1.z.object({
    sourceCode: zod_1.z.string().min(1),
    path: zod_1.z.string().min(1),
    method: zod_1.z.enum(['get', 'list', 'create', 'update', 'delete']),
    auth: zod_1.z
        .object({
        uid: zod_1.z.string(),
        email: zod_1.z.string().email().optional(),
        token: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
    })
        .nullable(),
    resourceData: exports.DocumentDataSchema.optional(),
    proposedData: exports.DocumentDataSchema.optional(),
});
// -----------------------------------------------------------------------------
// 5. Storage Schemas
// -----------------------------------------------------------------------------
exports.CreateSignedUploadUrlSchema = zod_1.z.object({
    bucketName: zod_1.z.string().min(1).max(64),
    objectPath: zod_1.z.string().min(1).max(1024),
    contentType: zod_1.z.string().min(1).max(128),
    sizeBytes: zod_1.z.number().int().min(1).max(10485760), // Max 10MB
});
exports.CreateSignedDownloadUrlSchema = zod_1.z.object({
    bucketName: zod_1.z.string().min(1).max(64),
    objectPath: zod_1.z.string().min(1).max(1024),
    expiresInSeconds: zod_1.z.number().int().min(60).max(86400).default(3600),
});
//# sourceMappingURL=index.js.map