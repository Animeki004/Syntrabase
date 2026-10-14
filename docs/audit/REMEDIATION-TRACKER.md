# Syntrabase Pre-Production Remediation Tracker

## 1. Confirmed Vulnerabilities & Architectural Fixes

| ID | Title | Severity | Component | Root Cause | Fix Implemented | Verification Evidence |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **SYN-FIND-001** | Tenant project resolution fallback aliasing | HIGH | `apps/api/src/services/project.service.ts:181` | Dev fallback returned default cluster UUID for unknown slugs, aliasing them to Pro plan. | Return `cleanId` instead of default UUID. | `plan-enforcement.test.ts` (7/7 passed). Unknown tenants fail closed with 403/404. |
| **SYN-FIND-002** | Concurrency race condition on audit ledger chain | HIGH | `apps/api/src/services/audit.service.ts:46` | Concurrent writes read same head block at identical millisecond, forking chain. | Serialized `log()` via `withTransaction` and `pg_advisory_xact_lock(739201)`. | `test-database-suite.js` (Test 10: Cryptographic Chain passed 100%). |
| **SYN-FIND-003** | Mock email provider premature authentication | MEDIUM | `apps/api/src/services/email-providers/mock.provider.ts:113` | Initial DNS record retrieval hardcoded `authenticated: true`, bypassing domain check. | Set initial `authenticated: false` until `verifyDomain` is invoked. | `brevo-email-and-contact.test.ts` (14/14 passed, Subtest 5 & 6 clean). |
| **SYN-FIND-004** | Node test runner process hang on open pool handles | MEDIUM | `apps/api/package.json:13` | Node event loop held open by idle database connections in test runner. | Added `--test-force-exit` to test command. | `npm run test:integration` completes in 6s and exits with code 0. |
| **SYN-FIND-005** | Developer password reset non-existent account false success & flooding risk | HIGH | `apps/api/src/routes/auth.routes.ts:145` | Endpoint returned success for non-existent accounts and lacked anti-flooding rate limiting. | Added account existence check (HTTP 404), account suspension check (HTTP 403), and sliding-window IP/email rate limiter (HTTP 429). Updated Console login UI to surface exact error. | `api-integration.test.ts` (Subtests 5 & 6 passed 100%). |
| **SYN-FIND-006** | Hardcoded production domains & legacy SMTP references in Console auth templates | MEDIUM | `apps/super-admin`, `apps/console`, `apps/api` | Hardcoded real domain (`originhub.me`) in UI copy and test fixtures; legacy SMTP references in auth templates. | Purged all hardcoded domains to generic `example.com` or env fallbacks; removed SMTP settings; integrated test dispatch with active Brevo pipeline. | `grep_search` confirmed 0 occurrences of `originhub.me`; console and super-admin Next.js builds clean. |
| **SYN-FIND-007** | Super Admin email telemetry quota & outbox delivery status credibility | MEDIUM | `apps/super-admin/src/app/email/page.tsx` | Telemetry displayed unverified account quota and generic "Sent" without provider message ID verification. | Dynamically resolves active in-use Brevo account quota and plan tier; Outbox table displays confirmed delivery message ID badge or rejection reason. | Super Admin Next.js build clean (14/14 pages). |
| **SYN-FIND-008** | Platform vs Project sender isolation and scoping | MEDIUM | `apps/api/src/routes/admin.routes.ts:511`, `apps/super-admin` | Platform system emails lacked dedicated sender scope, causing domain association conflicts with tenant projects. | Added explicit `senderScope` ('platform' vs 'project') in Super Admin modal; preserved `targetProjectId = 'platform'` in backend API. | `brevo-email-and-contact.test.ts` and `api-integration.test.ts` passed 100%. |

---

## 2. Test Suite Alignment & Assertion Fixes

| ID | Title | Category | Component | Description & Remediation | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **TEST-001** | Signed URL project ID resolution match | Test Defect | `apps/api/src/test/api-integration.test.ts:84` | Assertion expected literal `test-proj`. Updated to accept either `test-proj` or resolved UUID. | **VERIFIED FIXED** |
| **TEST-002** | Defense simulation case sensitivity | Test Defect | `apps/api/src/test/api-integration.test.ts:115` | Assertion checked for lowercase `'throttled'`. Updated to case-insensitive match for `'throttle'`. | **VERIFIED FIXED** |
| **TEST-003** | Domain registration rejection regex | Test Defect | `apps/api/src/test/brevo-email-and-contact.test.ts:153` | Assertion expected literal `for this project`. Updated regex to `/Selected domain is not registered for/`. | **VERIFIED FIXED** |
| **TEST-004** | Project database developer authentication | Test Defect | `apps/api/src/test/project-database.test.ts` | Tests called protected endpoints without active session. Seeded session in `auth_sessions` and passed Bearer token. | **VERIFIED FIXED** |

---

## 3. Technical Debt & Accepted Risks

| ID | Title | Component | Analysis & Mitigation Strategy |
| :--- | :--- | :--- | :--- |
| **DEBT-001** | Upstream Next.js and Fastify CVEs | `node_modules` | Breaking changes prevent blind `npm audit fix --force`. Frontends run behind Traefik reverse-proxy with request size controls; Fastify stream APIs are unexposed. Plan minor version bump post-launch. |
| **DEBT-002** | External Registrar DNS Verification | Cloud Boundary | Live DNS propagation and external email delivery require live registrar and Brevo production credentials post-deployment. |
