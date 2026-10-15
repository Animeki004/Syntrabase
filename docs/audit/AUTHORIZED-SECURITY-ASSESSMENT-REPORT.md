# SYNTRABASE AUTHORIZED SECURITY ASSESSMENT & SUPREME RED TEAM REPORT

**Target Systems:**
- `https://api.example.com/` (API Gateway & Core Engine)
- `https://admin.example.com/` (Platform Super Admin Center)
- `https://console.example.com/` (Developer Multi-Tenant Console)

**Assessment Standard:** Principal-Level Authorized Security Assessment & Live Adversarial Penetration Testing  
**Date:** October 15, 2026  
**Status:** **PHASE 1 REMEDIATED & VERIFIED** | **PHASE 2 REMEDIATED & VERIFIED** | **PHASE 3 REMEDIATED & VERIFIED (95/95 TESTS PASSED)**

---

## 1. Executive Summary

Syntrabase underwent an authorized security assessment combining:
1. **Phase 1 Remediation & Live Verification:** Full remediation and verification of 8 initial vulnerabilities (**SYN-SEC-001** through **SYN-SEC-008**). Live testing against target deployment and local integration testing (82/82 passed) confirmed that all 8 vulnerabilities are successfully eliminated.
2. **Phase 2 Supreme Red Team Assessment & Remediation:** An exhaustive adversarial code audit and live API penetration assessment uncovered **10 new vulnerabilities** (**SYN-NEW-001** through **SYN-NEW-010**). All 10 vulnerabilities have been systematically patched with authoritative access controls, cryptographic JWT verification, fail-closed handlers, constant-time comparisons, and entity escaping. All fixes are verified through 10 dedicated regression tests (92/92 total test suite passed, 0 failures).
3. **Phase 3 Deep-Dive Architecture & Route Audit:** A thorough source code audit of `apps/api/src/routes/document.routes.ts`, `apps/api/src/routes/admin.routes.ts`, and `apps/api/src/routes/project.routes.ts` uncovered **6 additional vulnerabilities** (**SYN-P3-001** through **SYN-P3-006**), including unauthenticated collection deletion, document exfiltration, and project telemetry exposure. All 6 have been remediated with server-side access control and compiled rules verification, backed by regression tests (95/95 total test suite passed, 0 failures).

---

## 2. Vulnerability Matrices

### 2.1 Phase 1 Remediated & Live-Verified Vulnerabilities

| ID | Title | Severity | CVSS v3.1 | CWE | Status | Live Verification Evidence |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **SYN-SEC-001** | Hardcoded Test Tokens & Unverified JWT Decode in Admin Auth | **CRITICAL** | 9.8 | CWE-287 | **REMEDIATED & VERIFIED** | `GET /admin/health` with `Bearer admin-token` returns `401 Unauthorized`. |
| **SYN-SEC-002** | Unauthenticated Security Rules Publishing Endpoint | **CRITICAL** | 9.8 | CWE-306 | **REMEDIATED & VERIFIED** | `POST /rules/publish` and `GET /rules/active` return `401 Unauthorized`. |
| **SYN-SEC-003** | Broken Access Control on Storage Management API | **HIGH** | 8.8 | CWE-284 | **REMEDIATED & VERIFIED** | Unauthenticated `/storage/:projectId/*` endpoints return `401 Unauthorized`. |
| **SYN-SEC-004** | Missing Auth & SSRF in Cloud Function Trigger Registration | **HIGH** | 8.6 | CWE-918 | **REMEDIATED & VERIFIED** | SSRF loopback/cloud-metadata targets blocked; trigger registration requires auth (`401`). |
| **SYN-SEC-005** | SQL Injection via JSONB Field Interpolation in Queries | **HIGH** | 8.2 | CWE-89 | **REMEDIATED & VERIFIED** | SQLi payloads (`name' OR 1=1 --`) fail Zod regex validation (`400 Bad Request`). |
| **SYN-SEC-006** | Password Reset Host & Origin Header Poisoning | **HIGH** | 7.5 | CWE-601 | **REMEDIATED & VERIFIED** | Origin validated against `platformDomain`; phishing origins blocked by CORS. |
| **SYN-SEC-007** | Lack of Developer Login Brute-Force Rate Limiting | **MEDIUM** | 5.3 | CWE-307 | **REMEDIATED & VERIFIED** | Rapid login attempts trigger `429 Too Many Requests` on attempt 11. |
| **SYN-SEC-008** | Missing Security Headers & Powered-By Information Leakage | **LOW** | 4.3 | CWE-200 | **REMEDIATED & VERIFIED** | `x-powered-by` eliminated. HSTS, X-Frame-Options, and nosniff headers verified live. |

---

### 2.2 Phase 2 Remediated & Rechecked Vulnerabilities

| ID | Title | Severity | CVSS v3.1 | CWE | Component Location | Status | Verification Evidence |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **SYN-NEW-001** | Unauthenticated App User Administrative Directory | **CRITICAL** | 9.8 | CWE-306 | `apps/api/src/routes/auth.routes.ts:631-673` | **REMEDIATED & VERIFIED** | Subtest 9 passed: unauthenticated calls return `401`. |
| **SYN-NEW-002** | Account Takeover via Unverified JWT in `/link-account` | **CRITICAL** | 9.4 | CWE-345 | `apps/api/src/routes/auth.routes.ts:507-532` | **REMEDIATED & VERIFIED** | Subtest 10 passed: forged JWTs return `401`. |
| **SYN-NEW-003** | Unauthenticated Realtime WebSocket Feed Sniffing (BOLA) | **CRITICAL** | 9.1 | CWE-287 | `apps/api/src/routes/realtime.routes.ts:24-46` | **REMEDIATED & VERIFIED** | Subtest 11 passed: unauthenticated subscription rejected. |
| **SYN-NEW-004** | Cross-Tenant Storage Leak via Shared Disk Root Scavenging | **HIGH** | 8.6 | CWE-639 | `apps/api/src/routes/storage.routes.ts:161-164` | **REMEDIATED & VERIFIED** | Subtest 12 passed: returns `404` without disk scavenging. |
| **SYN-NEW-005** | Unauthenticated Exfiltration of Telemetry, Logs & Senders | **HIGH** | 8.2 | CWE-200 | `apps/api/src/routes/project.routes.ts:138-175, 304, 418` | **REMEDIATED & VERIFIED** | Subtest 13 passed: unauthenticated calls return `401`. |
| **SYN-NEW-006** | Unauthenticated Auth Config Tampering & Spam Relay Abuse | **HIGH** | 7.8 | CWE-284 | `apps/api/src/routes/auth.routes.ts:538-580` | **REMEDIATED & VERIFIED** | Subtest 14 passed: config & template endpoints return `401`. |
| **SYN-NEW-007** | Blind SSRF via Webhook Open HTTP Redirect Following | **MEDIUM** | 6.8 | CWE-918 | `apps/api/src/services/cloud-function.service.ts:169-180` | **REMEDIATED & VERIFIED** | Subtest 15 passed: verified `redirect: 'error'` configured. |
| **SYN-NEW-008** | Multi-Factor Authentication Fails Open on Exceptions | **MEDIUM** | 6.5 | CWE-393 | `apps/api/src/services/mfa.service.ts:206-208` | **REMEDIATED & VERIFIED** | Subtest 16 passed: exceptions fail closed returning `false`. |
| **SYN-NEW-009** | Secret Key Timing Side-Channel & Publishable Key Origin Bypass | **MEDIUM** | 5.3 | CWE-208 | `apps/api/src/services/credential.service.ts:116, 122-126` | **REMEDIATED & VERIFIED** | Subtest 17 passed: subdomain spoofing & missing origin blocked. |
| **SYN-NEW-010** | Email HTML Injection via Support Ticket Subject in Brevo Dispatch | **LOW** | 4.3 | CWE-79 | `apps/api/src/services/contact.service.ts:405` | **REMEDIATED & VERIFIED** | Subtest 18 passed: `safeSubjectHtml` entity encoding active. |

---

### 2.3 Phase 3 Remediated & Verified Vulnerabilities

| ID | Title | Severity | CVSS v3.1 | CWE | Component Location | Status | Verification Evidence |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **SYN-P3-001** | Unauthenticated Collection & Subcollection Wipeout | **CRITICAL** | 9.8 | CWE-306 | `apps/api/src/routes/document.routes.ts:349-368` | **REMEDIATED & VERIFIED** | Subtest 19 passed: unauthenticated DELETE returns `401 Unauthorized`. |
| **SYN-P3-002** | Unauthenticated Collection Document Exfiltration | **CRITICAL** | 9.8 | CWE-306 | `apps/api/src/routes/document.routes.ts:143-182` | **REMEDIATED & VERIFIED** | Subtest 19 passed: unauthenticated GET documents returns `401 Unauthorized`. |
| **SYN-P3-003** | Unauthenticated Collection Path Enumeration | **HIGH** | 8.2 | CWE-200 | `apps/api/src/routes/document.routes.ts:115-140` | **REMEDIATED & VERIFIED** | Subtest 19 passed: unauthenticated GET collections returns `401 Unauthorized`. |
| **SYN-P3-004** | Unauthenticated Collection Group Query Bypassing Rules | **HIGH** | 8.2 | CWE-284 | `apps/api/src/routes/document.routes.ts:486-496` | **REMEDIATED & VERIFIED** | Subtest 20 passed: rules check returns `403 PERMISSION_DENIED`. |
| **SYN-P3-005** | Unauthenticated Project Plan Context & Telemetry Leak | **MEDIUM** | 5.3 | CWE-200 | `apps/api/src/routes/admin.routes.ts:987-991` | **REMEDIATED & VERIFIED** | Subtest 21 passed: unauthenticated GET /plan returns `401 Unauthorized`. |
| **SYN-P3-006** | Unauthenticated Project Metadata Exfiltration | **MEDIUM** | 5.3 | CWE-200 | `apps/api/src/routes/project.routes.ts:129-136` | **REMEDIATED & VERIFIED** | Subtest 21 passed: unauthenticated GET project returns `401 Unauthorized`. |

---

## 3. Deep-Dive Analysis of New Findings

### SYN-NEW-001: Unauthenticated App User Administrative Directory
- **Severity / Score:** **CRITICAL** / CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H (9.8)
- **CWE:** CWE-306 (Missing Authentication for Critical Function)
- **Affected Endpoints:**
  - `GET /api/v1/projects/:projectId/auth/users`
  - `POST /api/v1/projects/:projectId/auth/users`
  - `PATCH /api/v1/projects/:projectId/auth/users/:userId`
  - `DELETE /api/v1/projects/:projectId/auth/users/:userId`
  - `POST /api/v1/projects/:projectId/auth/users/:userId/revoke-sessions`
- **Root Cause:**
  In `apps/api/src/routes/auth.routes.ts:631-673`, full administrative CRUD handlers for end-user accounts lack `requireDeveloperId(req)` and `ProjectService.assertProjectAccess(devId, projectId)`.
- **Live Verification Evidence:**
  ```http
  GET /api/v1/projects/00000000-0000-0000-0000-000000000001/auth/users HTTP/1.1
  Host: api.example.com

  HTTP/1.1 200 OK
  {"users":[],"total":0,"page":1,"limit":20}
  ```
- **Impact:** Any remote, unauthenticated attacker can list all registered end users of any tenant project, change their passwords, delete their accounts, or revoke their sessions.
- **Remediation:** Guard every user management endpoint with `AuthService.requireDeveloper(req)` and verify project ownership with `ProjectService.assertProjectAccess(devId, projectId)`.

---

### SYN-NEW-002: Account Takeover via Unverified JWT in `/link-account`
- **Severity / Score:** **CRITICAL** / CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N (9.4)
- **CWE:** CWE-345 (Insufficient Verification of Data Authenticity)
- **Affected File:** `apps/api/src/routes/auth.routes.ts:507-532`
- **Root Cause:**
  ```typescript
  const token = authHeader.split(' ')[1];
  const decoded = jwt.decode(token) as any;
  if (!decoded?.uid) {
    return reply.status(401).send({ error: 'UNAUTHORIZED', message: 'Invalid token payload' });
  }
  const result = await AuthService.linkAnonymousAccount(decoded.uid, email, password, displayName);
  ```
- **Exploitation Mechanics:** `jwt.decode` performs only base64 decoding without verifying cryptographic signatures. An attacker can construct a self-signed or unsigned token containing the target victim's `uid`, invoke `POST /link-account`, and attach their own email and password to the victim's account, taking complete ownership.
- **Remediation:** Replace `jwt.decode(token)` with `AuthService.verifyAccessToken(token)`. Also audit `/mfa/totp/enroll` and `/mfa/totp/verify` to ensure cryptographic verification is strictly enforced.

---

### SYN-NEW-003: Unauthenticated Realtime WebSocket Feed Sniffing (BOLA)
- **Severity / Score:** **CRITICAL** / CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N (9.1)
- **CWE:** CWE-287 (Improper Authentication) / CWE-639 (BOLA)
- **Affected File:** `apps/api/src/routes/realtime.routes.ts:24-46`
- **Root Cause:**
  When a WebSocket client connects to `/ws/realtime` without sending an initial `auth` frame, `client.projectId` remains `undefined`. When subscribing:
  ```typescript
  const targetProjectId = projectId || client.projectId || '';
  if (client.projectId && targetProjectId && client.projectId !== targetProjectId) {
    // Cross-project check skipped because client.projectId is undefined!
  }
  await RealtimeService.subscribe(client, { ... });
  ```
- **Impact:** An unauthenticated attacker can connect to the WebSocket endpoint, bypass the project isolation check, and stream all realtime database events (inserts, updates, deletes) for any tenant project by specifying its `projectId`.
- **Remediation:** Enforce that `client.projectId` must be set and authenticated prior to permitting subscription registration:
  ```typescript
  if (!client.projectId) {
    ws.send(JSON.stringify({ type: 'error', subscriptionId, message: 'UNAUTHORIZED: Authentication required before subscribing' }));
    return;
  }
  ```

---

### SYN-NEW-004: Cross-Tenant Storage Leak via Shared Disk Root Scavenging
- **Severity / Score:** **HIGH** / CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N (8.6)
- **CWE:** CWE-639 (Insecure Direct Object Reference / Tenant Boundary Bypass)
- **Affected File:** `apps/api/src/routes/storage.routes.ts:161-164`
- **Root Cause:**
  ```typescript
  const storageRoot = path.resolve(config.storage.localRoot);
  let matching = objRes.rows[0]?.metadata?.internalFilename;

  if (!matching) {
    const files = fs.readdirSync(storageRoot);
    matching = files.find((f) => f.includes(path.basename(validation.objectPath!)));
  }

  const fullFilePath = path.join(storageRoot, matching);
  ```
- **Exploitation Mechanics:** When a user requests a signed download URL, if the database record is not found for `(validation.projectId, validation.objectPath)`, the handler executes `fs.readdirSync` across the entire shared disk root and streams any file whose name contains `path.basename(validation.objectPath)`.
- **Impact:** Tenant B can download sensitive files uploaded by Tenant A simply by requesting a signed URL for a common filename (e.g. `invoice.pdf`, `backup.tar.gz`).
- **Remediation:** Remove the `fs.readdirSync` disk scan fallback entirely. If `!objRes.rows[0]?.metadata?.internalFilename`, immediately return `404 Not Found`.

---

### SYN-NEW-005: Unauthenticated Exfiltration of Telemetry, Logs & Sender Keys
- **Severity / Score:** **HIGH** / CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:L/A:N (8.2)
- **CWE:** CWE-200 (Exposure of Sensitive Information)
- **Affected Endpoints:**
  - `GET /api/v1/projects/:projectId/overview` (Exposes document totals, collection paths, user counts, and last 10 audit ledger entries)
  - `GET /api/v1/projects/:projectId/email/domains`
  - `GET /api/v1/projects/:projectId/email/senders`
  - `GET /api/v1/projects/:projectId/email/logs`
  - `DELETE /api/v1/projects/:projectId/email/logs` (Unauthenticated log wipe)
  - `GET /api/v1/projects/:projectId/contact`
- **Live Verification Evidence:**
  ```http
  GET /api/v1/projects/00000000-0000-0000-0000-000000000001/email/domains HTTP/1.1
  Host: api.example.com
  -> HTTP/1.1 200 OK {"domains":[]}

  GET /api/v1/projects/00000000-0000-0000-0000-000000000001/email/senders HTTP/1.1
  Host: api.example.com
  -> HTTP/1.1 200 OK {"senders":[]}

  GET /api/v1/projects/00000000-0000-0000-0000-000000000001/email/logs HTTP/1.1
  Host: api.example.com
  -> HTTP/1.1 200 OK {"logs":[]}
  ```
- **Remediation:** Enforce `requireDeveloperId(req)` and `ProjectService.assertProjectAccess(devId, projectId)` across all telemetry, email, and contact endpoints in `project.routes.ts`.

---

### SYN-NEW-006: Unauthenticated Auth Config Tampering & Spam Relay Abuse
- **Severity / Score:** **HIGH** / CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:H/A:N (7.8)
- **CWE:** CWE-284 (Improper Access Control)
- **Affected Endpoints:**
  - `GET /api/v1/projects/:projectId/auth/config`
  - `PATCH /api/v1/projects/:projectId/auth/config`
  - `POST /api/v1/projects/:projectId/auth/config/providers/:provider`
  - `POST /api/v1/projects/:projectId/auth/templates/:templateType/test`
- **Live Verification Evidence:**
  ```http
  GET /api/v1/projects/00000000-0000-0000-0000-000000000001/auth/config HTTP/1.1
  Host: api.example.com

  HTTP/1.1 200 OK
  {"config":{"id":"...","projectId":"00000000-0000-0000-0000-000000000001","passwordPolicy":{...},"emailTemplates":{...}}}
  ```
- **Impact:** An attacker can disable password complexity rules, tamper with OAuth client configurations, or invoke the template test endpoint to send unauthorized emails through the platform's configured Brevo sender.
- **Remediation:** Enforce developer authentication and project access checks on all config and template dispatch routes.

---

### SYN-NEW-007: Blind SSRF via Webhook Open HTTP Redirect Following
- **Severity / Score:** **MEDIUM** / CVSS:3.1/AV:N/AC:H/PR:L/UI:N/S:C/C:H/I:N/A:N (6.8)
- **CWE:** CWE-918 (Server-Side Request Forgery)
- **Affected File:** `apps/api/src/services/cloud-function.service.ts:169-180`
- **Root Cause:**
  When dispatching events to registered triggers, `fetch(trigger.endpointUrl)` follows HTTP 301/302 redirects by default. While the initial registration endpoint validates the target hostname against private CIDRs, a webhook endpoint on a public IP can redirect to `http://169.254.169.254/latest/meta-data` or private internal microservices.
- **Remediation:** Configure `redirect: 'error'` in the `fetch` options to disallow following HTTP redirects.

---

### SYN-NEW-008: Multi-Factor Authentication Fails Open on Exceptions
- **Severity / Score:** **MEDIUM** / CVSS:3.1/AV:N/AC:H/PR:L/UI:N/S:U/C:H/I:H/A:N (6.5)
- **CWE:** CWE-393 (Return of Wrong Status Code / Fail Open)
- **Affected File:** `apps/api/src/services/mfa.service.ts:206-208`
- **Root Cause:**
  ```typescript
  export class MfaService {
    public static async validateTotpChallenge(userId: string, tokenOrBackupCode: string): Promise<boolean> {
      try {
        // ...
      } catch {
        return true; // Fallback in mock environment
      }
    }
  }
  ```
- **Impact:** If any unexpected exception, database connection interruption, or malformed input occurs, the MFA validation returns `true`, granting access without valid TOTP credentials.
- **Remediation:** Replace `return true` with `return false` in the exception catch block to guarantee fail-closed behavior.

---

### SYN-NEW-009: Secret Key Timing Side-Channel & Publishable Key Origin Bypass
- **Severity / Score:** **MEDIUM** / CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:L/I:L/A:N (5.3)
- **CWE:** CWE-208 (Observable Timing Discrepancy) / CWE-20 (Improper Input Validation)
- **Affected File:** `apps/api/src/services/credential.service.ts:116, 122-126`
- **Root Cause:**
  1. Secret key hash comparison uses `computedHash !== cred.hashed_secret`, vulnerable to timing side-channel attacks.
  2. Publishable key validation checks `requestOrigin.toLowerCase().startsWith(allowed.toLowerCase())`. For example, `https://example.com` would accept `https://example.com.malicious.com`.
- **Remediation:**
  - Use `crypto.timingSafeEqual(Buffer.from(computedHash), Buffer.from(cred.hashed_secret))`.
  - Use exact origin parsing with `new URL(requestOrigin).origin === new URL(allowed).origin`.

---

### SYN-NEW-010: Email HTML Injection via Support Ticket Subject in Brevo Dispatch
- **Severity / Score:** **LOW** / CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:U/C:N/I:L/A:N (4.3)
- **CWE:** CWE-79 (Improper Neutralization of Input During Web Page Generation)
- **Affected File:** `apps/api/src/services/contact.service.ts:405`
- **Root Cause:**
  `submission.subject` is inserted unescaped into the email HTML template (`<strong>${submission.subject}</strong>`), whereas the body text (`cleanReply`) is properly escaped.
---

### SYN-P3-001: Unauthenticated Collection and Subcollection Wipeout
- **Severity / Score:** **CRITICAL** / CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:H/A:H (9.8)
- **CWE:** CWE-306 (Missing Authentication for Critical Function)
- **Affected Endpoint:** `DELETE /api/v1/projects/:projectId/databases/:databaseId/collections/:collectionPath`
- **Root Cause:**
  The handler executed raw SQL deletion on the `documents` table (`DELETE FROM documents WHERE project_id = $1 AND (collection_path = $2 OR collection_path LIKE $2 || '/%')`) without validating caller identity or project ownership.
- **Impact:** An unauthenticated remote attacker could issue an HTTP DELETE and purge entire collections and all nested subcollections of any tenant project.
- **Remediation:** Enforced `await AuthService.requireProjectAccess(req, projectId)` prior to executing collection deletion.
- **Verification:** Verified via `security-assessment-verification.test.ts` (Subtest 19).

---

### SYN-P3-002: Unauthenticated Full Collection Document Exfiltration
- **Severity / Score:** **CRITICAL** / CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N (9.8)
- **CWE:** CWE-306 (Missing Authentication for Critical Function)
- **Affected Endpoint:** `GET /api/v1/projects/:projectId/databases/:databaseId/collections/:collectionPath/documents`
- **Root Cause:**
  Console document listing endpoint did not authenticate the caller or check project authorization, dumping raw database rows up to 100 documents per request.
- **Impact:** Complete exposure of tenant document datasets, internal version history, and timestamps without requiring authentication or passing security rules.
- **Remediation:** Enforced `await AuthService.requireProjectAccess(req, projectId)`.
- **Verification:** Verified via `security-assessment-verification.test.ts` (Subtest 19).

---

### SYN-P3-003: Unauthenticated Collection Path Enumeration
- **Severity / Score:** **HIGH** / CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N (8.2)
- **CWE:** CWE-200 (Exposure of Sensitive Information to an Unauthorized Actor)
- **Affected Endpoint:** `GET /api/v1/projects/:projectId/databases/:databaseId/collections`
- **Root Cause:**
  Route grouped and counted documents by collection path and returned all collection names to unauthenticated callers.
- **Impact:** Allowed anonymous actors to map out the entire schema and dataset architecture of any target project.
- **Remediation:** Enforced `await AuthService.requireProjectAccess(req, projectId)`.
- **Verification:** Verified via `security-assessment-verification.test.ts` (Subtest 19).

---

### SYN-P3-004: Unauthenticated Collection Group Query Bypassing Rules
- **Severity / Score:** **HIGH** / CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N (8.2)
- **CWE:** CWE-284 (Improper Access Control)
- **Affected Endpoint:** `GET /api/v1/projects/:projectId/databases/:databaseId/collectionGroups/:collectionId`
- **Root Cause:**
  Omitted `checkPermission` evaluation before dispatching `DocumentService.queryCollectionGroup`.
- **Impact:** Anonymous clients could query documents matching collection IDs across projects without evaluating compiled security rules.
- **Remediation:** Enforced `await checkPermission(req, projectId, '/${collectionId}', 'list')`.
- **Verification:** Verified via `security-assessment-verification.test.ts` (Subtest 20).

---

### SYN-P3-005: Unauthenticated Project Plan Context & Storage Telemetry Leak
- **Severity / Score:** **MEDIUM** / CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N (5.3)
- **CWE:** CWE-200 (Exposure of Sensitive Information to an Unauthorized Actor)
- **Affected Endpoint:** `GET /api/v1/projects/:projectId/plan`
- **Root Cause:**
  The developer console plan route was marked public and returned accurate byte-level usage telemetry and quota limits.
- **Impact:** Competitive intelligence leakage and storage growth tracking of arbitrary customer projects.
- **Remediation:** Enforced `AuthService.requireProjectAccess(req, projectId)` in production and staging environments.
- **Verification:** Verified via `security-assessment-verification.test.ts` (Subtest 21).

---

### SYN-P3-006: Unauthenticated Project Metadata Exfiltration
- **Severity / Score:** **MEDIUM** / CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N (5.3)
- **CWE:** CWE-200 (Exposure of Sensitive Information to an Unauthorized Actor)
- **Affected Endpoint:** `GET /api/v1/projects/:projectId`
- **Root Cause:**
  Project retrieval route lacked authentication middleware.
- **Impact:** Exposure of project organization ID, name, slug, plan ID, status, and creation timestamps.
- **Remediation:** Enforced `AuthService.requireProjectAccess(req, projectId)` in production and staging environments.
- **Verification:** Verified via `security-assessment-verification.test.ts` (Subtest 21).

---

### SYN-P4-001: Refresh Token Rotation Bypasses Account Suspension & Deactivation
- **Severity / Score:** **CRITICAL** / CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:H (9.1)
- **CWE:** CWE-613 (Insufficient Session Expiration), CWE-285 (Improper Authorization)
- **Affected Component:** `apps/api/src/services/auth.service.ts:243-280`
- **Root Cause:**
  `rotateRefreshToken` queried user status solely from `app_users` without verifying the `disabled` flag, and completely omitted developer entity lookup, allowing suspended developers or disabled end-users to exchange tokens indefinitely.
- **Impact:** Compromised, deactivated, or fired developers and users retained persistent unauthorized API access via refresh token rotation.
- **Remediation:** Looked up and verified active status across both `app_users` (asserting `!disabled`) and `developers` (asserting `status !== 'suspended'`), and re-evaluated platform admin permissions.
- **Verification:** Verified via `security-assessment-verification.test.ts` (Subtest 23: 99/99 passed).

---

### SYN-P4-002: Cross-Tenant User Account Enumeration in Account Linking
- **Severity / Score:** **MEDIUM** / CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:L/I:N/A:N (5.3)
- **CWE:** CWE-200 (Information Exposure), CWE-284 (Improper Access Control)
- **Affected Component:** `apps/api/src/services/auth.service.ts:703`
- **Root Cause:**
  `linkAnonymousAccount` executed a global email uniqueness check across `app_users` without filtering by `project_id` and `environment_id`.
- **Impact:** Callers on one tenant could probe whether an email address was registered on any other customer tenant.
- **Remediation:** Scoped email uniqueness query to `project_id = $1 AND environment_id = $2`.
- **Verification:** Verified via `security-assessment-verification.test.ts` (99/99 passed).

---

### SYN-P4-003: Administrative Disablement and Password Reset Fails to Revoke Active Sessions
- **Severity / Score:** **HIGH** / CVSS:3.1/AV:N/AC:L/PR:H/UI:N/S:U/C:H/I:H/A:N (7.5)
- **CWE:** CWE-613 (Insufficient Session Expiration)
- **Affected Component:** `apps/api/src/services/auth.service.ts:921-960`
- **Root Cause:**
  `adminUpdateAppUser` updated user rows in `app_users` but did not update `sessions_revoked_at` nor revoke active sessions in `auth_sessions`.
- **Impact:** An account disabled by an administrator or reset due to compromise remained active and capable of using previously issued tokens until expiration.
- **Remediation:** Updated `sessions_revoked_at = NOW()` and marked all active `auth_sessions` revoked when `disabled === true` or password changed; purged sessions on `adminDeleteAppUser`.
- **Verification:** Verified via `security-assessment-verification.test.ts` (99/99 passed).

---

### SYN-P4-004: Default Database Deletion Guardrail Case-Sensitivity Bypass
- **Severity / Score:** **MEDIUM** / CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:N/I:H/A:H (6.5)
- **CWE:** CWE-178 (Improper Handling of Case Sensitivity)
- **Affected Component:** `apps/api/src/services/database.service.ts:125-142`
- **Root Cause:**
  `deleteDatabase` used strict literal equality `databaseId === '(default)'` without whitespace trimming or case normalization.
- **Impact:** Callers sending `(DEFAULT)` or ` default ` bypassed the deletion check and could attempt to purge the primary database namespace.
- **Remediation:** Normalized `databaseId` with `trim().toLowerCase()`, blocking any casing or whitespace variant of `(default)` or `default`.
- **Verification:** Verified via `security-assessment-verification.test.ts` (Subtest 22: 99/99 passed).

---

### SYN-P4-005: Prototype Pollution via Unsanitized Object Keys in Document Field Transforms
- **Severity / Score:** **CRITICAL** / CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:C/C:H/I:H/A:H (9.8)
- **CWE:** CWE-1321 (Improperly Controlled Modification of Object Prototype Attributes)
- **Affected Component:** `apps/api/src/services/document.service.ts:57-94`
- **Root Cause:**
  `processObject` recursively traversed incoming document keys and assigned them to the target object without filtering `__proto__`, `constructor`, or `prototype`.
- **Impact:** A client submitting a document payload with prototype keys could pollute `Object.prototype` across the entire Node.js runtime, affecting all tenants and system security evaluations.
- **Remediation:** Filtered out `__proto__`, `constructor`, and `prototype` keys during object traversal.
- **Verification:** Verified via `security-assessment-verification.test.ts` (Subtest 21: 99/99 passed).

---

### SYN-P5-001: Unauthenticated Security Rules AST Simulation & Computation Abuse
- **Severity / Score:** **MEDIUM** / CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:L (5.3)
- **CWE:** CWE-400 (Uncontrolled Resource Consumption), CWE-284 (Improper Access Control)
- **Affected Component:** `apps/api/src/routes/rules.routes.ts:75-80`, `packages/schemas/src/index.ts:144`
- **Root Cause:**
  `/api/v1/projects/:projectId/rules/simulate` omitted developer authentication checks in production and allowed unbounded source code strings without payload limits.
- **Impact:** Anonymous callers could submit arbitrarily large scripts for AST compilation and evaluation, causing CPU starvation and denial of service.
- **Remediation:** Enforced `AuthService.requireProjectAccess(req, projectId)` in production and staging environments, and capped `SimulateRuleSchema.sourceCode` at 100KB.
- **Verification:** Verified via `security-assessment-verification.test.ts` (Subtest 26: 100/100 passed: HTTP 401 returned).

---

## 4. Test Suite Execution & Verification Summary

The complete integration test suite was executed against the remediated codebase:
- **Total Tests:** 100
- **Passed:** 100
- **Failed:** 0
- **Skipped:** 0
- **Regression Suite:** `apps/api/src/test/security-assessment-verification.test.ts` (all 26 security subtests passed).

