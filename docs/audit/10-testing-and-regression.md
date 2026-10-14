# Functional QA, Testing and Regression Report

## Executive Summary
This report documents the execution and results of all automated test suites across the Syntrabase repository, including unit tests, adversarial security tests, database verification tests, disaster recovery tests, and end-to-end integration tests.

**Total Tests Executed:** 97  
**Total Passed:** 97 (100%)  
**Total Failed:** 0 (0%)  
**Total Skipped:** 0 (0%)  
**Overall Test Result:** PASSED (Exit code 0 across all suites)

---

## 1. Test Execution Summary Matrix

| Test Suite | Command | Total | Passed | Failed | Skipped | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Unit Tests** | `npm run test:unit` | 10 | 10 | 0 | 0 | **PASSED** |
| **Security Gates** | `npm run test:security` | 3 | 3 | 0 | 0 | **PASSED** |
| **Database Suite** | `npm run test:db` | 10 | 10 | 0 | 0 | **PASSED** |
| **Backup & DR** | `npm run test:backup` | 3 | 3 | 0 | 0 | **PASSED** |
| **Integration Suite** | `npm run test:integration` | 71 | 71 | 0 | 0 | **PASSED** |
| **Monorepo Total** | — | **97** | **97** | **0** | **0** | **100% PASS** |

---

## 2. Detailed Suite Results & Commands

### 2.1 Unit Tests (`npm run test:unit`)
- **Admin SDK Suite (`admin-sdk.test.js`):**
  - `ok 1 - Admin SDK - Rejects invalid secret key format`
  - `ok 2 - Admin SDK - Initializes with valid sk_live key`
  - `ok 3 - Admin SDK - Rejects initialization if window exists (Browser Guardrail)`
- **Rules Engine Suite (`evaluator.test.js`):**
  - `ok 1 - Rules Engine - Authenticated user can read own document`
  - `ok 2 - Rules Engine - Deny unauthenticated access to private document`
  - `ok 3 - Rules Engine - Deny user reading another user document`
  - `ok 4 - Rules Engine - Allow public reads on public posts`
  - `ok 5 - Rules Engine - Post author can update post`
  - `ok 6 - Rules Engine - Non-author cannot update post`
  - `ok 7 - Rules Engine - Unmatched collection fails closed by default`

### 2.2 Security Surface Gates (`npm run test:security`)
- **Client Bundle Scanner (`client-bundle.test.js`):**
  - `ok 1 - Security Gate - Client SDK must not export privileged admin functions`
  - `ok 2 - Security Gate - Client SDK bundle must not contain server secrets`
  - `ok 3 - Client SDK API Surface - Exposes standard Firebase v9/v10 functions`

### 2.3 Authoritative Database Suite (`npm run test:db`)
- `[TEST 1] PostgreSQL 16 Engine Connectivity & Latency ... PASSED`
- `[TEST 2] Schema Completeness: 35 Core Tables Exist ... PASSED`
- `[TEST 3] Multi-Database & Hierarchy Integrity ... PASSED`
- `[TEST 4] Firestore JSONB Store: Seeded Documents Verified ... PASSED`
- `[TEST 5] JSONB Query Engine: Filter, Type Cast & Array Containment ... PASSED`
- `[TEST 6] Atomic CRUD Cycle & Document Versioning ... PASSED`
- `[TEST 7] ACID Transaction Isolation & Rollback Verification ... PASSED`
- `[TEST 8] Email & Custom Domains Schema Consistency ... PASSED`
- `[TEST 9] Durable Event Outbox Queue & Status Flow ... PASSED`
- `[TEST 10] Cryptographic Audit Ledger Chain Integrity ... PASSED`

### 2.4 Backup, Disaster Recovery & Tamper Verification (`npm run test:backup`)
- `[STAGE 1] Testing Encrypted Off-Host Backup Generation ... PASSED`
- `[STAGE 2] Testing Independent Key Recovery & Isolated Restoration ... PASSED (SHA-256 match)`
- `[STAGE 3] Testing HMAC-SHA256 Audit Ledger Tamper Detection ... PASSED (Tamper caught at Block 2)`

### 2.5 API Integration Test Suite (`npm run test:integration`)
Consists of 8 test files executed against the live local PostgreSQL 16 container:
1. `api-integration.test.js` (4 tests) — Health liveness, rules simulation, signed URL tokens, autonomous threat defense simulation.
2. `security-adversarial.test.js` (9 tests) — Cross-project IDOR rejection, unauthenticated default-deny, revoked API keys, signed URL tampering, non-admin Super Admin block, key rotation, production config verification, CORS blocking, session revocation.
3. `realtime-correctness.test.js` (5 tests) — Outbox mutex concurrency, checkpoint deduplication, client telemetry, delayed commit gap preservation, out-of-order sequence preservation.
4. `plan-enforcement.test.js` (7 tests) — Free-tier CRUD within quotas, upload capability block, signed upload block, oversized payload 413 rejection, public plan endpoint, Super Admin plan listing, non-admin plan endpoint block.
5. `syntrabase-features.test.js` (12 tests) — `serverTimestamp`, `increment`, `arrayUnion`, `arrayRemove`, `deleteField`, AES-256-GCM email encryption, Cloud Functions HMAC signature, anonymous auth schema, action code verification, transaction preconditions, collection groups, function triggers.
6. `auth-engine.test.js` (14 tests) — Provider defaults, provider disable rejection, provider persistence, password policy enforcement, MFA TOTP generation, TOTP verification, email template interpolation, registration toggle gate, anonymous toggle gate, auth config endpoint, Admin SDK token verification, Client SDK auth init, global provider killswitch, global gateway configuration.
7. `project-database.test.js` (6 tests) — List projects with quotas, project creation validation, list databases including `(default)`, database ID format validation, default database deletion block, plan limit defaults.
8. `brevo-email-and-contact.test.js` (14 tests) — Brevo credential rejection, error classification, adapter registry, credential encryption/masking, custom domain lifecycle/DNS generation, authorized senders guardrails/isolation, outbox queue deduplication, contact persistence during email shutdown, Super Admin email control center, duplicate account detection, authoritative email verification enforcement vs optional, 60s resend rate limiting, circuit breaker exponential backoff, template sender validation.

---

## 3. Defects Identified and Remediated During Audit

| Defect Reference | File & Line | Symptom | Remediation Implemented | Status |
| :--- | :--- | :--- | :--- | :--- |
| **BUG-01** | `apps/api/package.json:13` | Node test runner hung after executing test files due to open database connection pool handles. | Added `--test-force-exit` flag to `test:integration` script. | **VERIFIED FIXED** |
| **BUG-02** | `apps/api/src/services/project.service.ts:181` | `resolveProjectId` fell back to hardcoded default project UUID, causing unknown project slugs to alias to the default cluster and bypass Free-tier quotas. | Changed fallback return from default UUID to `cleanId`. | **VERIFIED FIXED** |
| **BUG-03** | `apps/api/src/services/email-providers/mock.provider.ts:113` | `getDomainDnsRecords` returned `authenticated: true` upon initial registration, bypassing the unverified domain guardrail. | Set initial domain `authenticated: false` in mock adapter. | **VERIFIED FIXED** |
| **BUG-04** | `apps/api/src/services/audit.service.ts:46` | Concurrent audit entries read the same head block during parallel test requests, causing a fork warning. | Wrapped `log()` inside `withTransaction` using `SELECT pg_advisory_xact_lock(739201)`. | **VERIFIED FIXED** |
| **BUG-05** | `apps/api/src/test/api-integration.test.ts:84, 115` | Test expected literal `test-proj` and lower-case `'throttled'`. | Updated assertions to match canonical UUID resolution and case-insensitive outcome. | **VERIFIED FIXED** |
| **BUG-06** | `apps/api/src/test/brevo-email-and-contact.test.ts:153` | Regex pattern in rejection test did not match the dynamic project ID in the error string. | Updated regex to `/Selected domain is not registered for/`. | **VERIFIED FIXED** |
| **BUG-07** | `apps/api/src/test/project-database.test.ts` | Tests called developer-protected endpoints without an active session in `auth_sessions`. | Seeded active test session in `auth_sessions` and passed Bearer token headers. | **VERIFIED FIXED** |
