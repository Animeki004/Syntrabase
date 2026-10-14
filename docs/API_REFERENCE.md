# Syntrabase — REST & WebSocket API Reference

Welcome to the **Syntrabase API Reference**. Syntrabase exposes high-performance HTTP REST and WebSocket APIs designed to be 100% compatible with Firebase Client and Admin capabilities while offering native multi-tenancy, server-side security rule evaluation, transactional outboxes, and plan quota enforcement.

---

## 1. Authentication & Security Headers

All requests to Syntrabase require either client credentials or administrative bearer tokens/keys.

### Headers

| Header | Type | Required For | Description |
| :--- | :--- | :--- | :--- |
| `x-api-key` | `string` | Client SDK & Public Requests | Publishable API Key (`pk_live_...`) or Admin Secret Key (`sk_live_...`). |
| `x-environment-id` | `string` | Optional | Tenant environment identifier (defaults to `default`). |
| `Authorization` | `string` | Authenticated Requests | `Bearer <ACCESS_TOKEN>` obtained from sign-in. |
| `Content-Type` | `string` | POST / PATCH / PUT | Must be `application/json` (or `multipart/form-data` for direct binary file uploads). |

### Security Model
- **Publishable Key (`pk_live_...`)**: Evaluates declarative security rules (`rules-engine`) against the authenticated user context (`request.auth`).
- **Secret Key (`sk_live_...`)**: Bypasses client-side security rules for privileged backend workloads while generating an immutable audit ledger entry.
- **Cross-Project Isolation**: Access tokens and secret keys are cryptographically validated against the requested `projectId`. Cross-project access returns `403 Forbidden`.

---

## 2. Authentication API (`/api/v1/projects/:projectId/auth`)

### 2.1 Register App User
Create a new user account with email and password within the specified project.

- **Method**: `POST`
- **Path**: `/api/v1/projects/:projectId/auth/register`
- **Request Body**:
```json
{
  "email": "user@example.com",
  "password": "StrongPassword123!",
  "displayName": "Jane Doe"
}
```
- **Response** (`201 Created`):
```json
{
  "user": {
    "uid": "usr_9b1deb4d3b7d4e46",
    "email": "user@example.com",
    "displayName": "Jane Doe",
    "emailVerified": false,
    "isAnonymous": false,
    "createdAt": "2026-10-13T12:00:00.000Z"
  }
}
```

### 2.2 Login App User
Authenticate an existing user and obtain session tokens.

- **Method**: `POST`
- **Path**: `/api/v1/projects/:projectId/auth/login`
- **Request Body**:
```json
{
  "email": "user@example.com",
  "password": "StrongPassword123!"
}
```
- **Response** (`200 OK`):
```json
{
  "user": {
    "uid": "usr_9b1deb4d3b7d4e46",
    "email": "user@example.com",
    "emailVerified": false,
    "isAnonymous": false
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "ref_84f938a1b2c3d4..."
}
```

### 2.3 Anonymous Authentication
Provision a temporary guest session that can later be upgraded.

- **Method**: `POST`
- **Path**: `/api/v1/projects/:projectId/auth/anonymous`
- **Request Body**: `{}`
- **Response** (`201 Created`):
```json
{
  "user": {
    "uid": "anon_3e21a4f0",
    "email": null,
    "isAnonymous": true,
    "createdAt": "2026-10-13T12:05:00.000Z"
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "ref_9a8b7c6d5e..."
}
```

### 2.4 Account Linking (Upgrade Anonymous Account)
Link an existing anonymous user with email and password credentials, preserving document ownership and user UID.

- **Method**: `POST`
- **Path**: `/api/v1/projects/:projectId/auth/link-account`
- **Headers**: `Authorization: Bearer <ANONYMOUS_ACCESS_TOKEN>`
- **Request Body**:
```json
{
  "email": "converted@example.com",
  "password": "PermanentPassword123!",
  "displayName": "Converted User"
}
```
- **Response** (`200 OK`):
```json
{
  "user": {
    "uid": "anon_3e21a4f0",
    "email": "converted@example.com",
    "displayName": "Converted User",
    "isAnonymous": false
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "ref_updated123..."
}
```

### 2.5 Email Verification & Password Reset
Single-use action tokens with cryptographic hash verification and atomic redemption.

- **Resend Verification**:
  - `POST /api/v1/projects/:projectId/auth/resend-verification`
  - Body: `{"email": "user@example.com"}`
- **Verify Email**:
  - `POST /api/v1/projects/:projectId/auth/verify-email`
  - Body: `{"token": "act_email_verify_token_here"}`
- **Forgot Password**:
  - `POST /api/v1/projects/:projectId/auth/forgot-password`
  - Body: `{"email": "user@example.com"}` (Guarantees constant-time response against user enumeration)
- **Reset Password**:
  - `POST /api/v1/projects/:projectId/auth/reset-password`
  - Body: `{"token": "act_pwd_reset_token_here", "newPassword": "NewStrongPassword123!"}`

### 2.6 Token Refresh & Session Revocation
- **Refresh Token Rotation**:
  - `POST /api/v1/auth/refresh`
  - Body: `{"refreshToken": "ref_..."}`
  - Response: New `accessToken` and rotated `refreshToken`. Automatic reuse detection revokes entire token family if replayed.
- **Revoke Session**:
  - `POST /api/v1/auth/revoke`
  - Body: `{"refreshToken": "ref_..."}`

### 2.7 Project Authentication Configuration & Providers
- **Get Auth Config**:
  - `GET /api/v1/projects/:projectId/auth/config`
  - Response: Complete project authentication configuration including enabled provider flags, password policy, session TTLs, and MFA settings.
- **Update Auth Config**:
  - `PATCH /api/v1/projects/:projectId/auth/config`
  - Body: Partial `ProjectAuthConfig` (`passwordPolicy`, `sessionPolicy`, `mfaPolicy`, `authorizedDomains`, etc.)
- **Configure Specific Provider**:
  - `POST /api/v1/projects/:projectId/auth/config/providers/:provider`
  - Parameters: `:provider` (`email_password` | `anonymous` | `phone` | `google` | `github` | `apple`)
  - Body: `{"enabled": true, "credentials": { "clientId": "...", "clientSecret": "..." }}` (Credentials stored AES-256-GCM encrypted).

### 2.8 Multi-Factor Authentication (RFC 6238 TOTP)
- **Enroll TOTP Factor**:
  - `POST /api/v1/projects/:projectId/auth/mfa/totp/enroll`
  - Headers: `Authorization: Bearer <ACCESS_TOKEN>`
  - Response: `secret` (Base32), `otpauthUrl`, `backupCodes` (8 single-use codes).
- **Verify & Activate Factor**:
  - `POST /api/v1/projects/:projectId/auth/mfa/totp/verify`
  - Headers: `Authorization: Bearer <ACCESS_TOKEN>`
  - Body: `{"code": "123456"}`
- **Challenge Verification on Sign-In**:
  - `POST /api/v1/projects/:projectId/auth/mfa/challenge`
  - Body: `{"challengeId": "mfa_chal_...", "code": "123456"}`

### 2.9 Transactional Email Templates Engine
- **Get Template Configs**:
  - `GET /api/v1/projects/:projectId/auth/templates`
- **Update Template**:
  - `PATCH /api/v1/projects/:projectId/auth/templates`
  - Body: `{"type": "verify_email", "senderName": "App", "fromEmail": "noreply@app.com", "subject": "Verify for %APP_NAME%", "body": "Link: %LINK%"}`
- **Send Test Email**:
  - `POST /api/v1/projects/:projectId/auth/templates/:type/test`
  - Body: `{"recipient": "developer@example.com"}`

### 2.10 User Directory Management (Administrative)
- **List App Users (Paginated)**:
  - `GET /api/v1/projects/:projectId/auth/users?page=1&limit=25&search=user@example.com`
- **Create User (Administrative)**:
  - `POST /api/v1/projects/:projectId/auth/users`
  - Body: `{"email": "user@example.com", "password": "...", "displayName": "...", "emailVerified": true}`
- **Update User (Administrative)**:
  - `PATCH /api/v1/projects/:projectId/auth/users/:userId`
  - Body: `{"displayName": "...", "disabled": true, "emailVerified": true}`
- **Delete User**:
  - `DELETE /api/v1/projects/:projectId/auth/users/:userId`
- **Revoke All User Sessions**:
  - `POST /api/v1/projects/:projectId/auth/users/:userId/revoke-sessions`

### 2.11 Telemetry & Audit Logs
- **Get Usage Telemetry**:
  - `GET /api/v1/projects/:projectId/auth/usage`
  - Response: Aggregated statistics (total users, active, anonymous, signups, signin success/failure, delivery counts).
- **Get Project Security Audit Logs**:
  - `GET /api/v1/projects/:projectId/auth/logs?limit=50`

### 2.12 Super Admin Global Governance & Gateway API (`/api/v1/admin`)
- **Get Global Auth Master Switches**:
  - `GET /api/v1/admin/auth/global-config`
- **Update Global Master Switches**:
  - `PATCH /api/v1/admin/auth/global-config`
  - Body: `{"masterSwitches": { "phone": false }}`
- **Get Global Email Gateways**:
  - `GET /api/v1/admin/auth/gateways`
- **Test Outbound Gateway Ping**:
  - `POST /api/v1/admin/auth/gateways/:gatewayId/test`
  - Body: `{"recipient": "admin@syntrabase.internal"}`

---

## 3. Firestore Document API (`/api/v1/projects/:projectId/databases/:databaseId`)

### 3.1 Get Document
Retrieve a single document by collection path and document ID.

- **Method**: `GET`
- **Path**: `/api/v1/projects/:projectId/databases/:databaseId/documents/:collectionPath/:documentId`
- **Response** (`200 OK`):
```json
{
  "id": "doc_123",
  "path": "/users/doc_123",
  "data": {
    "name": "Alice",
    "score": 42,
    "lastLogin": "2026-10-13T12:00:00.000Z"
  },
  "version": 1,
  "createdAt": "2026-10-13T10:00:00.000Z",
  "updatedAt": "2026-10-13T12:00:00.000Z"
}
```

### 3.2 Set Document (Create / Overwrite / Merge)
- **Method**: `POST`
- **Path**: `/api/v1/projects/:projectId/databases/:databaseId/documents/:collectionPath/:documentId`
- **Request Body**:
```json
{
  "data": {
    "name": "Alice",
    "score": 100,
    "updatedAt": { "_transformType": "__SYNTRABASE_SERVER_TIMESTAMP__" },
    "tags": { "_transformType": "__SYNTRABASE_ARRAY_UNION__", "value": ["admin", "beta"] }
  },
  "merge": true
}
```
- **Response** (`200 OK` or `201 Created`): Returns the saved `DocumentSnapshot`.

### 3.3 Update Document (Partial Patch)
- **Method**: `PATCH`
- **Path**: `/api/v1/projects/:projectId/databases/:databaseId/documents/:collectionPath/:documentId`
- **Request Body**:
```json
{
  "data": {
    "score": { "_transformType": "__SYNTRABASE_INCREMENT__", "value": 5 },
    "temporaryCode": { "_transformType": "__SYNTRABASE_DELETE_FIELD__" }
  }
}
```

### 3.4 Delete Document
- **Method**: `DELETE`
- **Path**: `/api/v1/projects/:projectId/databases/:databaseId/documents/:collectionPath/:documentId`
- **Response** (`204 No Content`)

### 3.5 Query Documents
Execute structured queries on a specific collection.

- **Method**: `POST`
- **Path**: `/api/v1/projects/:projectId/databases/:databaseId/query`
- **Request Body**:
```json
{
  "collectionPath": "orders",
  "filters": [
    { "field": "status", "operator": "==", "value": "paid" },
    { "field": "amount", "operator": ">=", "value": 50 }
  ],
  "orderBy": [
    { "field": "amount", "direction": "desc" }
  ],
  "limit": 25,
  "startAfter": "order_xyz"
}
```
- **Response** (`200 OK`):
```json
{
  "documents": [ ... ]
}
```

### 3.6 Collection Group Query
Query across all subcollections sharing a name, regardless of hierarchy depth.

- **Method**: `GET`
- **Path**: `/api/v1/projects/:projectId/databases/:databaseId/collectionGroups/:collectionId?limit=50&offset=0`
- **Response** (`200 OK`):
```json
{
  "documents": [
    {
      "id": "comment_1",
      "path": "/posts/p1/comments/comment_1",
      "data": { "text": "Great article!" }
    },
    {
      "id": "comment_2",
      "path": "/videos/v1/comments/comment_2",
      "data": { "text": "Loved the tutorial!" }
    }
  ]
}
```

### 3.7 Atomic Batch Writes
Execute up to 500 create, update, and delete operations in an atomic PostgreSQL transaction.

- **Method**: `POST`
- **Path**: `/api/v1/projects/:projectId/databases/:databaseId/batch`
- **Request Body**:
```json
{
  "operations": [
    { "type": "set", "path": "/users/user_1", "data": { "name": "User 1" } },
    { "type": "update", "path": "/stats/global", "data": { "totalUsers": { "_transformType": "__SYNTRABASE_INCREMENT__", "value": 1 } } },
    { "type": "delete", "path": "/temp/session_1" }
  ]
}
```

### 3.8 Interactive Transactions
Interactive transactions with optimistic concurrency control (`preconditions` checking `version` or existence) and server-side row locking.

- **Method**: `POST`
- **Path**: `/api/v1/projects/:projectId/databases/:databaseId/transaction`
- **Request Body**:
```json
{
  "preconditions": [
    { "path": "/accounts/acc_a", "exists": true, "version": 5 },
    { "path": "/accounts/acc_b", "exists": true, "version": 2 }
  ],
  "writes": [
    { "type": "update", "path": "/accounts/acc_a", "data": { "balance": 400 } },
    { "type": "update", "path": "/accounts/acc_b", "data": { "balance": 600 } }
  ]
}
```
- **Conflict Handling**: If another transaction modified `/accounts/acc_a` concurrently, returns `409 Conflict` with `{ "error": "TRANSACTION_CONFLICT", "conflictedPath": "/accounts/acc_a" }`.

---

## 4. Realtime Gateway (`/api/v1/realtime`)

Establish WebSocket connections for sub-millisecond document change notifications.

- **Protocol**: `WebSocket (WSS)`
- **Path**: `/api/v1/realtime?token=<JWT_TOKEN>&apiKey=<API_KEY>&projectId=<PROJECT_ID>`
- **Subscribe to Document / Collection**:
```json
{
  "action": "subscribe",
  "path": "/messages",
  "replayFrom": 1042
}
```
- **Server Push Event**:
```json
{
  "type": "change",
  "event": "insert",
  "document": {
    "id": "msg_01",
    "path": "/messages/msg_01",
    "data": { "text": "Hello realtime!" },
    "version": 1
  },
  "sequenceNumber": 1043
}
```

---

## 5. File Storage API (`/api/v1/storage/:projectId`)

### 5.1 Upload Object
- **Method**: `POST`
- **Path**: `/api/v1/storage/:projectId/upload`
- **Request Body**:
```json
{
  "bucketName": "default",
  "objectPath": "avatars/user_1.png",
  "originalName": "avatar.png",
  "mimeType": "image/png",
  "base64Data": "iVBORw0KGgoAAAANSUhEUgAA..."
}
```
- **Response** (`201 Created`):
```json
{
  "objectPath": "avatars/user_1.png",
  "sizeBytes": 10480,
  "contentType": "image/png",
  "downloadUrl": "/api/v1/storage/:projectId/download/avatars/user_1.png"
}
```

### 5.2 Presigned Download & Upload URLs
- **Generate Signed Upload**: `POST /api/v1/storage/:projectId/signed-upload-url`
- **Generate Signed Download**: `POST /api/v1/storage/:projectId/signed-download-url`

---

## 6. Cloud Functions & Webhook Triggers (`/api/v1/projects/:projectId/functions`)

Register database lifecycle triggers that dispatch durable, HMAC-SHA256 signed webhooks to external HTTP endpoints or serverless lambdas.

- **Register Trigger**:
  - `POST /api/v1/projects/:projectId/functions/triggers`
  - Body:
```json
{
  "name": "onUserCreated",
  "collectionPath": "users",
  "eventType": "document.create",
  "endpointUrl": "https://api.myclient.com/webhooks/on-user-created",
  "secretKey": "whsec_custom_signing_key_123"
}
```
- **List Triggers**:
  - `GET /api/v1/projects/:projectId/functions/triggers`

---

## 7. Super Admin & Platform API (`/api/v1/admin`)

Privileged endpoints protected by strict database verification in the `platform_admins` table.

- **`GET /api/v1/admin/health`**: Realtime VPS memory, database connection latency, active WebSocket connections, and pool telemetry.
- **`GET /api/v1/admin/fleet`**: Multi-tenant fleet health, project listing, and database isolation metrics.
- **`GET /api/v1/admin/plans`**: List all global plans with associated limits (storage, document size, API rates).
- **`POST /api/v1/admin/plans`**: Create new plan tiers.
- **`POST /api/v1/admin/projects/:projectId/plan`**: Assign and enforce plan tiers on specific projects.
- **`GET /api/v1/admin/defense/posture`**: SOC Zero-Trust Level (0–4) posture audit.
- **`POST /api/v1/admin/defense/simulate`**: Safe attack injection simulator (DDoS, Outbox saturation, Credential spray).
- **`POST /api/v1/admin/audit/verify`**: Full HMAC-SHA256 cryptographic hash-chain ledger verification.
- **`POST /api/v1/admin/backup/isolated-restore`**: Automated backup snapshot creation and isolated restoration verification.
- **`GET /api/v1/admin/contact/inquiries`**: Retrieve developer support tickets with filter options.
- **`POST /api/v1/admin/contact/inquiries/:id/reply`**: Issue official administrator response, persist to PostgreSQL, and dispatch transactional email notification to developer via Brevo.
- **`PATCH /api/v1/admin/contact/inquiries/:id/status`**: Update inquiry status (`open`, `in_progress`, `resolved`, `closed`).

---

## 8. Developer Portal & Support API (`/api/v1/auth/developer` & `/api/v1/projects/:projectId/contact`)

### 8.1 Developer Self-Service Password Reset
- **Request Reset Link**:
  - `POST /api/v1/auth/developer/forgot-password`
  - Body: `{"email": "developer@example.com"}`
  - Behavior: Generates 32-byte cryptographic token, stores SHA-256 hash in `developer_password_reset_tokens` (30 min lifetime), and dispatches reset link via Brevo outbox.
- **Redeem Token & Set Password**:
  - `POST /api/v1/auth/developer/reset-password`
  - Body: `{"token": "<RAW_TOKEN>", "newPassword": "<NEW_PASSWORD>"}`
  - Behavior: Validates token hash, checks expiration and single-use redemption, hashes password with scrypt + pepper, updates `developers.updated_at = NOW()`, invalidates all existing sessions in `auth_sessions`, and redeems token.

### 8.2 Developer Support Tickets
- **Submit Support Inquiry**:
  - `POST /api/v1/projects/:projectId/contact`
  - Headers: `Authorization: Bearer <TOKEN>`
  - Body: `{"category": "Billing Inquiry", "subject": "...", "message": "...", "replyEmail": "..."}`
- **List Project Inquiries**:
  - `GET /api/v1/projects/:projectId/contact`
  - Headers: `Authorization: Bearer <TOKEN>`
  - Returns: Submissions array including any official `adminReply`, `repliedAt`, and `repliedBy`.

