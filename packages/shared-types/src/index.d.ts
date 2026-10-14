/**
 * Comprehensive Shared Types for the Self-Hosted Firebase-Compatible Platform
 */
export type Role = 'owner' | 'admin' | 'developer' | 'viewer';
export interface Developer {
    id: string;
    email: string;
    displayName?: string;
    emailVerified: boolean;
    isPlatformAdmin: boolean;
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
    user: AppUser | Developer;
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
}
export type CredentialType = 'publishable' | 'secret';
export interface ApiCredential {
    id: string;
    projectId: string;
    environmentId: string;
    type: CredentialType;
    name: string;
    keyPrefix: string;
    keyIdentifier: string;
    hashedSecret?: string;
    allowedOrigins: string[];
    scopes: string[];
    revoked: boolean;
    expiresAt?: string;
    lastUsedAt?: string;
    createdAt: string;
}
export type DocumentData = Record<string, unknown>;
export interface DocumentSnapshot {
    id: string;
    path: string;
    data: DocumentData;
    createdAt: string;
    updatedAt: string;
    version: number;
}
export type QueryFilterOperator = '==' | '!=' | '<' | '<=' | '>' | '>=' | 'in' | 'not-in' | 'array-contains' | 'array-contains-any';
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
    startAfter?: string;
    projection?: string[];
}
export type BatchWriteOperation = {
    type: 'set';
    path: string;
    data: DocumentData;
    merge?: boolean;
} | {
    type: 'update';
    path: string;
    data: DocumentData;
} | {
    type: 'delete';
    path: string;
};
export interface BatchWriteRequest {
    operations: BatchWriteOperation[];
}
export interface BatchWriteResult {
    appliedCount: number;
    committedAt: string;
}
export type OutboxEventType = 'document_created' | 'document_updated' | 'document_deleted';
export interface OutboxEvent {
    sequenceId: string;
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
    contentHash: string;
    isPublic: boolean;
    metadata?: Record<string, string>;
    createdAt: string;
    updatedAt: string;
}
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
    category: 'auth_failure' | 'rate_limit_tripped' | 'cross_tenant_denied' | 'rules_violation' | 'token_reuse' | 'admin_action';
    sourceIp?: string;
    actorId?: string;
    projectId?: string;
    details: Record<string, unknown>;
}
export type ResponseLevel = 'LEVEL_0_OBSERVE' | 'LEVEL_1_THROTTLE' | 'LEVEL_2_QUARANTINE' | 'LEVEL_3_CONTAINMENT' | 'LEVEL_4_HUMAN_RECOVERY';
export interface AutomatedDefenseAction {
    id: string;
    eventId: string;
    level: ResponseLevel;
    actionTaken: string;
    scope: string;
    reverted: boolean;
    executedAt: string;
}
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
//# sourceMappingURL=index.d.ts.map