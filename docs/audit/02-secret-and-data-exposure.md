# Secret Exposure and Information Leak Audit

## Executive Summary
This audit evaluated the entire codebase, git status, environment templates, client bundles, public API responses, database persistence layers, and runtime error handlers for accidental credential leaks, unmasked secrets, and sensitive data exposures.

**Audit Status:** PASSED (All sensitive credentials safely stored, masked, and server-side encapsulated)

---

## 1. Secrets Scanning Methodology & Surface Area

The following inspection vectors were analyzed:
1. **Source Code & Git History:** Pattern searches for API keys, private keys (`BEGIN PRIVATE KEY`), AWS tokens (`AKIA...`), GitHub personal access tokens (`ghp_`), and Brevo master keys (`xkeysib-`).
2. **Client-Side Bundles (`apps/console`, `apps/super-admin`, `packages/client-sdk`):** Verified that no server-only environment variables or private configuration are bundled or exposed through `NEXT_PUBLIC_*` prefixes.
3. **Database Persistence:** Inspected encryption algorithms, salts, initialization vectors (IVs), and authentication tags for credentials stored at rest.
4. **API Gateway Endpoints:** Verified response payloads across public and protected endpoints to guarantee sensitive fields (passwords, salts, full API secrets, verification tokens) are redacted before serialization.
5. **Logs & Error Messages:** Inspected error handlers to confirm stack traces and database connection parameters are sanitized in production environments.

---

## 2. Findings & Classification Matrix

| Finding ID | Classification | Location / Context | Risk Level | Remediated / Status |
| :--- | :--- | :--- | :--- | :--- |
| **SEC-01** | Test Fixture | `apps/api/src/test/brevo-email-and-contact.test.ts:61` | Informational | Fake test string (`xkeysib-8924...real-test-secret...`) used exclusively in unit test for AES-256-GCM verification. No access to live services. |
| **SEC-02** | Test Fixture | `apps/api/src/test/brevo-email-and-contact.test.ts:25` | Informational | Invalid placeholder (`xkeysib-invalid-fake-key-12345`) intentionally used to verify 401 error handling. |
| **SEC-03** | Server-Side Variable | `.env.example:25, 34, 38, 41, 46, 54` | Clean | All secrets in `.env.example` contain non-functional placeholders (`your_secure_postgres_password_here`, etc.). |
| **SEC-04** | Client SDK Surface | `packages/client-sdk` | Clean | Automated security test (`test:security`) asserts zero server-side environment variables or secrets leaked in client bundle. |
| **SEC-05** | Production Config Gate | `apps/api/src/config.ts:182` | Enforced | Production configuration validator fails closed if `NODE_ENV=production` is run with default development secrets. |

---

## 3. Cryptographic Storage & Encryption at Rest

### 3.1 Email Provider Credentials (Brevo API Keys)
- **Algorithm:** AES-256-GCM (Authenticated Galois/Counter Mode)
- **Implementation:** `EmailService.encryptCredentials()` and `decryptCredentials()` in `apps/api/src/services/email.service.ts`
- **Mechanism:**
  - Dedicated 32-byte master key supplied via `CREDENTIALS_ENCRYPTION_KEY`.
  - Cryptographically random 16-byte IV generated per encryption event.
  - 16-byte authentication tag generated and stored alongside ciphertext.
  - Plaintext secrets are never stored in `email_provider_accounts`.
  - A separate `masked_api_key` (e.g. `xkeysib-...abcd`) is generated for user-facing UI representation.

### 3.2 Developer & User Passwords
- **Algorithm:** Argon2id with server-side secret pepper
- **Configuration:** Memory cost 64MB, time cost 3 iterations, parallelism 1, 32-byte salt, 32-byte output.
- **Salt Generation:** `crypto.randomBytes(32)` per user.
- **Pepper Protection:** High-entropy `PASSWORD_PEPPER` combined prior to hashing. Password hashes are never returned by user query endpoints.

### 3.3 API Secret Keys (`sk_live_...`)
- **Storage:** Secret keys are generated using 32 bytes of secure entropy (`sk_live_...`).
- **One-Way Hashing:** Only the SHA-256 hash of the secret is stored in `api_credentials.hashed_secret`.
- **Display Semantics:** The full key is displayed to the developer exactly once upon creation in the Console; subsequent queries only return the prefix and identifier.

---

## 4. Frontend & Client Isolation Verification

### 4.1 Next.js Console & Super Admin
- Verified all client-side environment variables:
  - `NEXT_PUBLIC_API_URL` — Public API URL.
  - `NEXT_PUBLIC_PLATFORM_DOMAIN` — Public cluster domain.
- No database credentials, JWT secrets, encryption keys, or Brevo keys exist in frontend source or compiled `.next` bundles.

### 4.2 Super Admin Credential Exposure Safeguards
- When listing email provider accounts (`GET /api/v1/admin/email/accounts`), the API gateway explicitly projects:
  ```sql
  SELECT id, account_name, provider_type, masked_api_key, is_enabled, status, created_at
  FROM email_provider_accounts
  ```
  The column `encrypted_credentials` is strictly omitted from the API response.

---

## 5. Secret Scanner Verification Command
```powershell
# Executed automated surface & secret scan test suite
npm run test:security
```
**Outcome:** PASSED (3/3 tests passed, exit code 0).
- `Security Gate - Client SDK must not export privileged admin functions: PASSED`
- `Security Gate - Client SDK bundle must not contain server secrets: PASSED`
- `Client SDK API Surface - Exposes standard Firebase v9/v10 functions: PASSED`
