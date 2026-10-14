# Application Security Audit (OWASP ASVS & Threat Matrix)

## Executive Summary
This audit performed an exhaustive application security assessment of the Syntrabase platform referencing OWASP ASVS v4.0 and the OWASP Top 10. Every authentication endpoint, authorization gateway, injection surface, session lifecyle, and abuse resilience mechanism was tested via automated adversarial test suites.

**Audit Status:** PASSED (All critical security gates verified and enforced)

---

## 1. Authentication Security

### 1.1 Credential Hashing & Password Policy
- **Hashing Standard:** Argon2id with server-side pepper (`PASSWORD_PEPPER`).
- **Policy Enforcement:**
  - Minimum length: 8 characters (configurable up to 32 characters in project auth config).
  - Complexity rules: Requires uppercase, lowercase, numbers, and symbols when enabled.
  - Verification: Automated tests confirm weak passwords (e.g. `'password'`, `'12345678'`, `'short'`) are rejected with `400 Bad Request` and structured validation errors.

### 1.2 JWT Token Lifecycle & Key Rotation
- **Token Format:** Dual-token model (short-lived access tokens, long-lived refresh tokens).
- **Access Token Expiry:** 15 minutes (`JWT_ACCESS_EXPIRES_IN=15m`).
- **Key Rotation Support:** Active key ID (`JWT_ACTIVE_KID`) signs new tokens. Retired previous keys (`JWT_PREVIOUS_SECRETS`) remain valid for verification during the rotation window.
- **Adversarial Verification:**
  - Automated test verifies that expired tokens reject with `401 Unauthorized`.
  - Automated test verifies that tokens signed with unauthorized or forged keys reject with `401 Unauthorized`.
  - Automated test verifies that key rotation successfully validates tokens signed by a retiring key while rejecting invalid signatures.

### 1.3 State-Backed Session Revocation
- **Immediate Invalidation:** Unlike stateless JWT platforms that remain vulnerable until token expiry, Syntrabase checks `auth_sessions` in PostgreSQL for developer sessions:
  ```sql
  SELECT id FROM auth_sessions WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > NOW() LIMIT 1
  ```
- **Post-Password Reset Invalidation:** If a developer's password is reset or changed by an administrator, the issued-at timestamp (`iat`) is compared against the developer's `updated_at`. Any token issued prior to the password reset is immediately rejected with `401 SESSION_REVOKED`.
- **Explicit Revocation Endpoint:** `POST /api/v1/auth/revoke` successfully marks the refresh token family as revoked in the database.

### 1.4 Multi-Factor Authentication (MFA / TOTP)
- **Standard:** RFC 6238 TOTP (Time-based One-Time Password) with HMAC-SHA1.
- **Secret Storage:** TOTP secrets are encrypted at rest with AES-256-GCM.
- **Recovery Codes:** 10 single-use cryptographically random backup codes generated and hashed with SHA-256 upon MFA enrollment.
- **Verification:** Verified via `MFA Engine - Generates RFC 6238 TOTP secrets, OTPAuth URL and backup recovery codes` and `MFA Engine - Verifies TOTP codes and rejects invalid tokens`.

---

## 2. Authorization & Privilege Escalation (BOLA / IDOR)

### 2.1 Multi-Tenant Tenant Isolation Gate
- **Boundary Verification:** Every request to `/api/v1/projects/:projectId/...` extracts the caller identity from the Bearer token or API key and verifies that the caller's authorized project matches the resource project.
- **Cross-Project Access Denial:** If a developer or user token issued for `project_A` attempts to access resources in `project_B`, the gateway immediately rejects the request:
  ```json
  { "error": "FORBIDDEN: Cross-project access denied — token issued for another project" }
  ```
- **Adversarial Test:** `Security Adversarial - Cross-project IDOR access is rejected with 403` strictly asserts that cross-tenant document reads return HTTP 403.

### 2.2 Super Admin Boundary Separation
- **Administrative Endpoints:** All `/api/v1/admin/*` routes enforce `requireSuperAdmin`:
  ```ts
  const adminRes = await query('SELECT developer_id FROM platform_admins WHERE developer_id = $1', [payload.uid]);
  if (adminRes.rows.length === 0) {
    throw new Error('FORBIDDEN: Server-side check rejected — user is not in platform_admins');
  }
  ```
- **Adversarial Test:** `Security Adversarial - Non-admin user cannot invoke Super Admin APIs` asserts that standard developer tokens attempting to invoke `/api/v1/admin/health`, `/api/v1/admin/plans`, or `/api/v1/admin/email/*` are denied with HTTP 403.

### 2.3 API Key Lifecycle & Scopes
- **Publishable Keys (`pk_live_...`):** Subject to origin validation and security rules evaluation. Cannot perform administrative operations.
- **Secret Keys (`sk_live_...`):** Restricted to server-to-server operations. Client SDK blocks `sk_live_` keys in browser environments (`window` check).
- **Instant Revocation:** Revoked API keys in `api_credentials` table are denied immediately on subsequent requests. Tested via `Security Adversarial - Revoked API key is immediately rejected`.

---

## 3. Injection & Input Validation

### 3.1 SQL Injection Prevention
- **Parameterized Queries:** 100% of SQL queries across all services (`DocumentService`, `AuthService`, `ProjectService`, `EmailService`, `AuditService`) use parameterized parameter arrays (`$1, $2, ...`). Zero string concatenation is used for user input in SQL statements.
- **Database Schema Casts:** Numeric limits, offsets, and IDs are strictly parsed (`parseInt(val, 10)` or UUID regex verification) before passing to the PostgreSQL driver.

### 3.2 Security Rules Engine Sandbox
- **Engine:** `@syntrabase/rules-engine` compiles security rules into an Abstract Syntax Tree (AST) using a deterministic recursive-descent parser.
- **Execution Isolation:** Rules are evaluated purely in-memory using AST traversal without invoking JavaScript `eval()` or `Function()` constructors. Code injection via rule definitions is impossible by design.
- **Fail-Closed Behavior:** Unmatched collections, syntax errors, or unauthenticated requests to protected collections default to `allowed: false` (`PERMISSION_DENIED`). Tested via `Rules Engine - Unmatched collection fails closed by default`.

### 3.3 Storage Path Traversal & File Uploads
- **Path Sanitization:** `objectPath` values are validated against path traversal attacks (`../`, `..\`, null bytes).
- **Signed URL Token Verification:** Signed upload and download URLs use HMAC-SHA256 signatures over `projectId`, `bucketName`, `objectPath`, and `expiresAt`. Any signature tampering or expired timestamp fails verification immediately. Tested via `Security Adversarial - Storage signed URL tampering and expiration rejection`.

---

## 4. Abuse Resilience & Edge Protection

### 4.1 CORS & Origin Controls
- **Production Origin Whitelisting:** Unauthorized browser origins are rejected by `@fastify/cors`.
- **Adversarial Test:** `Security Adversarial - Unauthorized CORS origin is blocked` asserts that requests with unauthorized origins (e.g. `https://evil-unauthorized-domain.com`) do not receive permissive `Access-Control-Allow-Origin` headers.

### 4.2 Rate Limiting & Throttling
- **Global Rate Limiting:** Managed via `@fastify/rate-limit`.
- **Sensitive Flow Throttling:**
  - Password Reset / Resend Verification: 60-second cooldown enforced per email (`HTTP 429 Too Many Requests`). Verified in `Resend Verification Flow with 60-second Rate Limiting`.
  - Autonomous Threat Defense: Dynamic token-bucket throttling triggers on brute force patterns. Verified in `API Integration - Autonomous Threat Defense simulations work correctly`.

### 4.3 Request Size & Payload Limits
- **Gateway Payload Limit:** Fastify enforces a strict 10 MB global payload cap (`bodyLimit: 10 * 1024 * 1024`).
- **Document Payload Limit:** Plan-specific document size limit (1 MB on Free tier, 4 MB on Pro tier) enforced prior to JSON persistence. Oversized Base64 payloads are rejected with `HTTP 413 DOCUMENT_TOO_LARGE`. Verified in `Plan Enforcement - Free-tier project rejects oversized Base64 payloads`.
