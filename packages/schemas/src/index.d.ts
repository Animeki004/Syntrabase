import { z } from 'zod';
export declare const RegisterDeveloperSchema: z.ZodObject<{
    email: z.ZodString;
    password: z.ZodString;
    displayName: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    password: string;
    email: string;
    displayName?: string | undefined;
}, {
    password: string;
    email: string;
    displayName?: string | undefined;
}>;
export declare const LoginDeveloperSchema: z.ZodObject<{
    email: z.ZodString;
    password: z.ZodString;
}, "strip", z.ZodTypeAny, {
    password: string;
    email: string;
}, {
    password: string;
    email: string;
}>;
export declare const RefreshTokenSchema: z.ZodObject<{
    refreshToken: z.ZodString;
}, "strip", z.ZodTypeAny, {
    refreshToken: string;
}, {
    refreshToken: string;
}>;
export declare const RegisterAppUserSchema: z.ZodObject<{
    email: z.ZodString;
    password: z.ZodString;
    displayName: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    password: string;
    email: string;
    displayName?: string | undefined;
}, {
    password: string;
    email: string;
    displayName?: string | undefined;
}>;
export declare const LoginAppUserSchema: z.ZodObject<{
    email: z.ZodString;
    password: z.ZodString;
}, "strip", z.ZodTypeAny, {
    password: string;
    email: string;
}, {
    password: string;
    email: string;
}>;
export declare const CreateProjectSchema: z.ZodObject<{
    name: z.ZodString;
    slug: z.ZodString;
    organizationId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    name: string;
    slug: string;
    organizationId: string;
}, {
    name: string;
    slug: string;
    organizationId: string;
}>;
export declare const CreateCredentialSchema: z.ZodObject<{
    name: z.ZodString;
    type: z.ZodEnum<["publishable", "secret"]>;
    allowedOrigins: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    scopes: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    type: "publishable" | "secret";
    name: string;
    allowedOrigins: string[];
    scopes: string[];
}, {
    type: "publishable" | "secret";
    name: string;
    allowedOrigins?: string[] | undefined;
    scopes?: string[] | undefined;
}>;
export declare const DocumentDataSchema: z.ZodRecord<z.ZodString, z.ZodUnknown>;
export declare const SetDocumentSchema: z.ZodObject<{
    data: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    merge: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    data: Record<string, unknown>;
    merge: boolean;
}, {
    data: Record<string, unknown>;
    merge?: boolean | undefined;
}>;
export declare const UpdateDocumentSchema: z.ZodObject<{
    data: z.ZodRecord<z.ZodString, z.ZodUnknown>;
}, "strip", z.ZodTypeAny, {
    data: Record<string, unknown>;
}, {
    data: Record<string, unknown>;
}>;
export declare const QueryFilterOperatorSchema: z.ZodEnum<["==", "!=", "<", "<=", ">", ">=", "in", "not-in", "array-contains", "array-contains-any"]>;
export declare const QueryFilterSchema: z.ZodObject<{
    field: z.ZodString;
    operator: z.ZodEnum<["==", "!=", "<", "<=", ">", ">=", "in", "not-in", "array-contains", "array-contains-any"]>;
    value: z.ZodUnknown;
}, "strip", z.ZodTypeAny, {
    field: string;
    operator: "==" | "!=" | "<" | "<=" | ">" | ">=" | "in" | "not-in" | "array-contains" | "array-contains-any";
    value?: unknown;
}, {
    field: string;
    operator: "==" | "!=" | "<" | "<=" | ">" | ">=" | "in" | "not-in" | "array-contains" | "array-contains-any";
    value?: unknown;
}>;
export declare const QueryOrderBySchema: z.ZodObject<{
    field: z.ZodString;
    direction: z.ZodDefault<z.ZodEnum<["asc", "desc"]>>;
}, "strip", z.ZodTypeAny, {
    field: string;
    direction: "asc" | "desc";
}, {
    field: string;
    direction?: "asc" | "desc" | undefined;
}>;
export declare const ExecuteQuerySchema: z.ZodObject<{
    collectionPath: z.ZodString;
    filters: z.ZodDefault<z.ZodArray<z.ZodObject<{
        field: z.ZodString;
        operator: z.ZodEnum<["==", "!=", "<", "<=", ">", ">=", "in", "not-in", "array-contains", "array-contains-any"]>;
        value: z.ZodUnknown;
    }, "strip", z.ZodTypeAny, {
        field: string;
        operator: "==" | "!=" | "<" | "<=" | ">" | ">=" | "in" | "not-in" | "array-contains" | "array-contains-any";
        value?: unknown;
    }, {
        field: string;
        operator: "==" | "!=" | "<" | "<=" | ">" | ">=" | "in" | "not-in" | "array-contains" | "array-contains-any";
        value?: unknown;
    }>, "many">>;
    orderBy: z.ZodDefault<z.ZodArray<z.ZodObject<{
        field: z.ZodString;
        direction: z.ZodDefault<z.ZodEnum<["asc", "desc"]>>;
    }, "strip", z.ZodTypeAny, {
        field: string;
        direction: "asc" | "desc";
    }, {
        field: string;
        direction?: "asc" | "desc" | undefined;
    }>, "many">>;
    limit: z.ZodDefault<z.ZodNumber>;
    startAfter: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    collectionPath: string;
    filters: {
        field: string;
        operator: "==" | "!=" | "<" | "<=" | ">" | ">=" | "in" | "not-in" | "array-contains" | "array-contains-any";
        value?: unknown;
    }[];
    orderBy: {
        field: string;
        direction: "asc" | "desc";
    }[];
    limit: number;
    startAfter?: string | undefined;
}, {
    collectionPath: string;
    filters?: {
        field: string;
        operator: "==" | "!=" | "<" | "<=" | ">" | ">=" | "in" | "not-in" | "array-contains" | "array-contains-any";
        value?: unknown;
    }[] | undefined;
    orderBy?: {
        field: string;
        direction?: "asc" | "desc" | undefined;
    }[] | undefined;
    limit?: number | undefined;
    startAfter?: string | undefined;
}>;
export declare const BatchWriteOperationSchema: z.ZodDiscriminatedUnion<"type", [z.ZodObject<{
    type: z.ZodLiteral<"set">;
    path: z.ZodString;
    data: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    merge: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    path: string;
    type: "set";
    data: Record<string, unknown>;
    merge?: boolean | undefined;
}, {
    path: string;
    type: "set";
    data: Record<string, unknown>;
    merge?: boolean | undefined;
}>, z.ZodObject<{
    type: z.ZodLiteral<"update">;
    path: z.ZodString;
    data: z.ZodRecord<z.ZodString, z.ZodUnknown>;
}, "strip", z.ZodTypeAny, {
    path: string;
    type: "update";
    data: Record<string, unknown>;
}, {
    path: string;
    type: "update";
    data: Record<string, unknown>;
}>, z.ZodObject<{
    type: z.ZodLiteral<"delete">;
    path: z.ZodString;
}, "strip", z.ZodTypeAny, {
    path: string;
    type: "delete";
}, {
    path: string;
    type: "delete";
}>]>;
export declare const BatchWriteSchema: z.ZodObject<{
    operations: z.ZodArray<z.ZodDiscriminatedUnion<"type", [z.ZodObject<{
        type: z.ZodLiteral<"set">;
        path: z.ZodString;
        data: z.ZodRecord<z.ZodString, z.ZodUnknown>;
        merge: z.ZodOptional<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        path: string;
        type: "set";
        data: Record<string, unknown>;
        merge?: boolean | undefined;
    }, {
        path: string;
        type: "set";
        data: Record<string, unknown>;
        merge?: boolean | undefined;
    }>, z.ZodObject<{
        type: z.ZodLiteral<"update">;
        path: z.ZodString;
        data: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    }, "strip", z.ZodTypeAny, {
        path: string;
        type: "update";
        data: Record<string, unknown>;
    }, {
        path: string;
        type: "update";
        data: Record<string, unknown>;
    }>, z.ZodObject<{
        type: z.ZodLiteral<"delete">;
        path: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        path: string;
        type: "delete";
    }, {
        path: string;
        type: "delete";
    }>]>, "many">;
}, "strip", z.ZodTypeAny, {
    operations: ({
        path: string;
        type: "set";
        data: Record<string, unknown>;
        merge?: boolean | undefined;
    } | {
        path: string;
        type: "update";
        data: Record<string, unknown>;
    } | {
        path: string;
        type: "delete";
    })[];
}, {
    operations: ({
        path: string;
        type: "set";
        data: Record<string, unknown>;
        merge?: boolean | undefined;
    } | {
        path: string;
        type: "update";
        data: Record<string, unknown>;
    } | {
        path: string;
        type: "delete";
    })[];
}>;
export declare const PublishSecurityRulesSchema: z.ZodObject<{
    sourceCode: z.ZodString;
}, "strip", z.ZodTypeAny, {
    sourceCode: string;
}, {
    sourceCode: string;
}>;
export declare const SimulateRuleSchema: z.ZodObject<{
    sourceCode: z.ZodString;
    path: z.ZodString;
    method: z.ZodEnum<["get", "list", "create", "update", "delete"]>;
    auth: z.ZodNullable<z.ZodObject<{
        uid: z.ZodString;
        email: z.ZodOptional<z.ZodString>;
        token: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, "strip", z.ZodTypeAny, {
        uid: string;
        email?: string | undefined;
        token?: Record<string, unknown> | undefined;
    }, {
        uid: string;
        email?: string | undefined;
        token?: Record<string, unknown> | undefined;
    }>>;
    resourceData: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    proposedData: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    method: "update" | "delete" | "get" | "list" | "create";
    path: string;
    sourceCode: string;
    auth: {
        uid: string;
        email?: string | undefined;
        token?: Record<string, unknown> | undefined;
    } | null;
    resourceData?: Record<string, unknown> | undefined;
    proposedData?: Record<string, unknown> | undefined;
}, {
    method: "update" | "delete" | "get" | "list" | "create";
    path: string;
    sourceCode: string;
    auth: {
        uid: string;
        email?: string | undefined;
        token?: Record<string, unknown> | undefined;
    } | null;
    resourceData?: Record<string, unknown> | undefined;
    proposedData?: Record<string, unknown> | undefined;
}>;
export declare const CreateSignedUploadUrlSchema: z.ZodObject<{
    bucketName: z.ZodString;
    objectPath: z.ZodString;
    contentType: z.ZodString;
    sizeBytes: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    bucketName: string;
    objectPath: string;
    contentType: string;
    sizeBytes: number;
}, {
    bucketName: string;
    objectPath: string;
    contentType: string;
    sizeBytes: number;
}>;
export declare const CreateSignedDownloadUrlSchema: z.ZodObject<{
    bucketName: z.ZodString;
    objectPath: z.ZodString;
    expiresInSeconds: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    bucketName: string;
    objectPath: string;
    expiresInSeconds: number;
}, {
    bucketName: string;
    objectPath: string;
    expiresInSeconds?: number | undefined;
}>;
//# sourceMappingURL=index.d.ts.map