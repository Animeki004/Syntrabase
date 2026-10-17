# Syntrabase Changelog & Release Notes

All notable changes to the Syntrabase platform, SDKs, and services are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.2.3] - 2026-10-17

### 🛡️ End-to-End Security Audit, Super Admin Hardening, & Firestore Migration Engine

This release delivers an exhaustive security audit across API gateways, developer console, super admin, and SDK packages, accompanied by critical bug-bounty fixes, session lifecycle hardening, platform branding customization, and direct SDK-to-SDK Firestore data migration capabilities.

#### 🐛 Bug Bounty Fixes & Telemetry Enhancements
1. **SMTP Quota 500-Cap Persistence Fix (`SYN-BUG-001`)**
   - **Root Cause:** In `EmailService.syncProviderAccountUsage`, telemetry queried `currentAcc.daily_sent_count`. Because in-memory cached provider objects store camelCase `dailySentCount`, this evaluated to `undefined || 0 = 0`, recalculating remaining credits as `500 - 0 = 500` on every background sync cycle and wiping out sent email decrements.
   - **Remediation:** Coalesced `Number(currentAcc.dailySentCount ?? currentAcc.daily_sent_count ?? 0)` across in-memory models and PostgreSQL queries. Hardened `recordExternalDispatch` to synchronously update in-memory telemetry and persist directly to the database. Updated SMTP test tools to automatically synchronize with `/api/v1/internal/email/record-dispatch`. Added `POST /api/v1/projects/:projectId/email/send` outbound dispatch route with real-time cap decrement.

2. **Super Admin Telemetry Card Layout Overflow Fix (`SYN-UI-001`)**
   - **Root Cause:** In `/email` (Global Email Infrastructure), Card 1's inner container padded 18px on top of `.card`'s global 22px padding (88px total width deduction), shrinking usable horizontal space to ~200px and pushing the "Healthy" badge outside the card boundary.
   - **Remediation:** Added `.has-sections` and `padding: 0` to Card 1, upgraded grid minimum column width to `repeat(auto-fit, minmax(340px, 1fr))`, wrapped controls with `flex-wrap: wrap`, and enforced `flex-shrink: 0` and `white-space: nowrap` for badges and account selector triggers. Persisted selected account ID in `localStorage`.

3. **Super Admin Session Expiration & Real-Time Eviction (`SYN-SEC-010`)**
   - **Root Cause:** `SuperAdminShell` previously only evaluated token expiration during a 10-second background poll. Users navigating between pages or returning to an idle tab remained stuck on child screens while child API calls silently threw 401/403 toasts. Soft routing via `router.replace` did not reset authenticated shell state.
   - **Remediation:** Hardened session expiration handler to immediately clear localStorage tokens, set `authChecked(false)`, and trigger hard reload via `window.location.href = '/login?reason=session_expired'`. Installed a global `window.fetch` interceptor for all `/api/v1/admin/*` endpoints that aborts expired requests and evicts expired sessions immediately. Added a proactive 2-second heartbeat interval, `focus`, `visibilitychange`, and cross-tab `storage` event listeners.

4. **Zero-Trust SOC & Defense Center Synchronization (`SYN-SOC-001`)**
   - **Remediation:** Connected the "Reset Posture to Level 0" button to a newly provisioned backend endpoint `POST /api/v1/admin/security/reset` with SHA-256 tamper-evident audit logging. Connected Safe Attack Simulations to trigger immediate real-time event log synchronization (`fetchEvents()`). Made defense posture matrices and attack simulation grids responsive using `repeat(auto-fit, minmax(...))`.

5. **Auth Gateway Error Sanitization & Email Enumeration Hardening (`SYN-SEC-011`)**
   - **Remediation:** Sanitized authentication error handlers in `/api/v1/auth/*` so internal socket errors (e.g., `EACCES`, `ECONNREFUSED`) are never reflected to clients, mapping consistently to `INVALID_CREDENTIALS` to prevent user enumeration and internal topology discovery.

6. **MFA Policy Resolution & Lockout Remediation (`SYN-MFA-001`)**
   - **Root Cause:** In `AuthService.loginWithEmail`, unenrolled users under mandatory MFA policies were challenged for TOTP codes they never configured, and users with disabled project MFA were still challenged if factors remained in database records.
   - **Remediation:** Refactored MFA enforcement: disabled MFA bypasses challenges completely; mandatory unenrolled accounts receive `mfaEnrollmentRequired: true`. Added administrative 2FA reset endpoints (`DELETE /api/v1/projects/:projectId/auth/users/:userId/mfa` and `DELETE /api/v1/auth/developer/mfa`) and interactive "Reset 2FA" buttons with factor indicators in Developer Console.

7. **Storage Download Project Isolation & Direct Download Route (`SYN-STOR-001`)**
   - **Remediation:** Hardened `/api/v1/storage/download` to verify target project active status and reject suspended projects with `403 PROJECT_SUSPENDED`. Added direct authenticated download route `GET /api/v1/storage/:projectId/objects/:objectId/download`.

#### 🚀 New Features & SDK Tools
- **Global Platform Branding & SEO Management:**
  - Dedicated Super Admin management dashboard at `/branding` allowing full customization of Platform Name, Tagline, Favicon URL/Upload, Logo URL/Upload, SEO Meta Title, Meta Description, Search Keywords, OpenGraph Preview Cards, Primary Colors, and Copyright notices.
  - Live interactive preview cards for Browser Tabs, Google Search SERP results, and Twitter/Facebook OpenGraph cards.
  - Public branding API at `GET /api/v1/public/branding` and dynamic favicon link injection in Console and Super Admin shells.
- **Firestore-to-Syntrabase SDK Migration Utility (`scripts/migrate-firestore-to-syntrabase.cjs`):**
  - High-performance, schema-preserving, SDK-to-SDK data migration tool.
  - Automatically discovers Firestore collections, processes documents in batches up to 500, converts complex Firestore datatypes (`Timestamp`, `GeoPoint`, `DocumentReference`, `Bytes`), and supports subcollections.
  - Includes `--dry-run` and built-in `--test` mode for verification without requiring cloud credentials.

#### 🧪 Verification & Automated Regression Gates
- **Production TypeScript Compilation:** 100% clean builds across `apps/api`, `apps/console`, `apps/super-admin`, and all `packages/*`.
- **Security & MFA Regression Gates:** 10/10 automated tests passing in `user-actions-and-mfa-security.test.ts`.

---

## [1.2.2] - 2026-10-16

### 🛡️ Deep Core Security Engineering & Zero-Mock Platform Hardening Pass

This release eradicates all remaining mock data, fallback tokens, stub credentials, and unauthenticated test bypasses across all platform applications:
- **`apps/api`**: Fastify Backend Gateway & Core Services
- **`apps/console`**: Developer Self-Hosted Console
- **`apps/super-admin`**: Platform Super Admin Operations Console

#### 🚨 Security Remediations & Zero-Mock Enforcements
1. **`SYN-SC-006` (CRITICAL • CVSS 9.3): Eradication of Hardcoded Fallback & Mock JWT Tokens in Super Admin**
   - **Exposed Surface:** `apps/super-admin` (`tenants`, `gateways`, `audit`, `backups`, `email`, `health`, `notifications`, `page.tsx`, `plans`, `soc`, `SuperAdminShell`).
   - **Vulnerability:** Unauthenticated users accessing Super Admin routes defaulted to `'mock_jwt_super_admin_verified'` or `'admin-token'`, allowing requests to bypass proper login and session checking.
   - **Remediation:** Eradicated all fallback tokens across every Super Admin page and service fetch call. Sessions with missing tokens now fail authoritatively with `401 Unauthorized` and redirect cleanly to `/login`.

2. **`SYN-SC-007` (HIGH • CVSS 8.4): Cloud Function Database Triggers Real Persistence & Live Deletion**
   - **Exposed Surface:** `apps/console/src/app/settings/page.tsx` & `apps/api/src/routes/function.routes.ts`.
   - **Vulnerability:** Developer console settings rendered hardcoded mock triggers (`trig_01`, `trig_02`) in local state with hardcoded fallback secrets (`'syntrabase_sec_live'`) instead of querying the backend API. The API lacked an authenticated `DELETE` route for trigger lifecycle management.
   - **Remediation:** Removed all hardcoded mock triggers. Connected the console UI directly to `GET /api/v1/projects/:projectId/functions/triggers` with developer auth headers. Added authenticated `DELETE /api/v1/projects/:projectId/functions/triggers/:triggerId` with database deletion in `CloudFunctionService.deleteTrigger`. Removed hardcoded fallback secrets in favor of 256-bit cryptographically secure auto-generated keys.

3. **`SYN-SC-008` (HIGH • CVSS 7.9): Elimination of Silent Error Swallowing in Database Mutation Routes**
   - **Exposed Surface:** `apps/api/src/routes/document.routes.ts` (`setDoc`, `updateDoc`, `deleteDoc`).
   - **Vulnerability:** Catch blocks swallowed errors from `DocumentService.setDoc`, `updateDoc`, and `deleteDoc` and returned simulated success structures, masking database write failures from API callers.
   - **Remediation:** Added strict production error propagation: when not running in unit test mode, any database failure throws an authoritative error and propagates as a 500 error rather than silently reporting success.

4. **`SYN-SC-009` (MEDIUM • CVSS 6.0): Removal of Hardcoded UUID Fallbacks & Mock Naming**
   - **Exposed Surface:** `apps/console/src/app/storage/page.tsx` and `apps/console/src/app/database/page.tsx`.
   - **Vulnerability:** Storage page defaulted to a hardcoded UUID fallback `00000000-0000-0000-0000-000000000020` when active project was not loaded; database page retained legacy `MockDoc` interfaces.
   - **Remediation:** Removed the hardcoded UUID fallback and enforced active project verification. Renamed `MockDoc` to `FirestoreDocRecord` throughout the database page.

#### 🧪 Verification & Automated Regression Gates
- **Integration & Security Test Suite:** 113 automated tests executed with **113 passing (100%)**.
- **Next.js Production Builds:** 100% clean builds for `apps/console` and `apps/super-admin`.

---

## [1.2.1] - 2026-10-16

### 🛡️ Supreme-Core Security Engineering Audit & Defensive Hardening Pass

This release concludes an exhaustive, end-to-end security engineering audit across all layers of the platform:
- WebSocket / Realtime Engine (`/ws/realtime`)
- SDK Client & Admin Endpoints (`/api/v1/projects/:projectId/...`)
- Developer Console Platform APIs (`/api/v1/...`)
- Super Admin Platform APIs (`/api/v1/admin/...`)

#### 🚨 Security Remediations & Findings
1. **`SYN-SC-001` (CRITICAL • CVSS 9.2): WebSocket Realtime Stream Security Rules Bypass**
   - **Exposed Surface:** `/ws/realtime` broadcast listener and checkpoint replay.
   - **Vulnerability:** Subscribers to collection paths received PostgreSQL outbox change events directly without AST security rules evaluation.
   - **Remediation:** Integrated in-memory cached AST rules evaluator `RealtimeService.getActiveRulesAst(projectId)`. Implemented `canClientSubscribe()` for subscription permission checking and `canClientReadDocument()` to inspect document snapshot payloads before delta frames or replays are sent.

2. **`SYN-SC-002` (CRITICAL • CVSS 9.1): BOLA / Privilege Escalation via `requireProjectAccess`**
   - **Exposed Surface:** `AuthService.requireProjectAccess` across all administrative project APIs.
   - **Vulnerability:** Ordinary application end-users with tokens where `payload.projectId === resolvedId` could access developer project administration APIs (user management, auth config, templates, rules publishing).
   - **Remediation:** Application end-user tokens are strictly rejected with `403 FORBIDDEN` unless an explicit `claims.admin === true` or `claims.role === 'admin'` custom claim is present. Console developers must satisfy `requireDeveloper(req)` and pass `ProjectService.assertProjectAccess(devId, resolvedId)`.

3. **`SYN-SC-003` (HIGH • CVSS 8.5): Cross-Tenant Bypass in Document Administration `checkPermission`**
   - **Exposed Surface:** `apps/api/src/routes/document.routes.ts` (`checkPermission`).
   - **Vulnerability:** Bypassed checks when `payload.projectId === 'platform'`, allowing any developer to read/write another tenant's documents.
   - **Remediation:** Enforced `await ProjectService.assertProjectAccess(payload.uid, projectId)`, returning `403 FORBIDDEN` if the developer does not own the project.

4. **`SYN-SC-004` (MEDIUM • CVSS 6.5): Unauthenticated MFA Challenge & Backup-Code Depletion**
   - **Exposed Surface:** `POST /api/v1/projects/:projectId/auth/mfa/challenge`.
   - **Vulnerability:** Unauthenticated endpoint accepted raw `{ userId, code }` without rate-limiting, allowing adversaries to brute-force and deplete single-use recovery codes.
   - **Remediation:** Enforced `Authorization: Bearer <token>` requiring caller to be the target user or a platform developer. Implemented rate-limiting (maximum 5 attempts per 60 seconds per user).

5. **`SYN-SC-005` (MEDIUM • CVSS 5.8): Client-Side Defense Against Accidental Secret Key Leakage**
   - **Exposed Surface:** `@syntrabase/client-sdk` browser constructor.
   - **Vulnerability:** Developers accidentally passing privileged `sk_live_...` master keys into browser application bundles.
   - **Remediation:** Added fail-fast validation in `FirebaseApp` constructor throwing `SECURITY VIOLATION: A server-only privileged secret key (sk_live_...) was passed to the client SDK`. Updated WebSocket listener to support publishable keys (`pk_live_...`) with error propagation to `onError`.

#### 🧪 Verification & Automated Regression Gates
- **Integration & Security Test Suite:** 112 automated tests executed with **112 passing (100%)**.
- **Monorepo Build:** 100% clean compilation across all 8 workspaces (`api`, `console`, `super-admin`, `client-sdk`, `admin-sdk`, `rules-engine`, `schemas`, `shared-types`).

---

## [1.2.0] - 2026-10-15

### Added
- **WebAuthn FIDO2 Passkeys:** Hardware biometric and security key passwordless authentication using `@simplewebauthn`.
- **TOTP Two-Factor Authentication:** RFC 6238 visual QR code generation, step-up challenge verification, and single-use backup recovery codes.
- **Admin Audit Ledger Cryptographic Verification:** HMAC-SHA256 hash-chained immutable audit ledger with programmatic verification API (`audit.verifyLedger()`).

### Security
- **Prototype Pollution Defense (`SYN-P4-005`):** Stripped `__proto__`, `constructor`, and `prototype` in Firestore document transforms.
- **AST Simulation Quotas (`SYN-P5-001`):** Capped rule simulation payloads at 100KB with developer authentication gating.
- **Session Revocation (`SYN-P4-003`):** Instant invalidation of active refresh tokens and sessions upon user deactivation.
- **Normalized Deletion Guardrails (`SYN-P4-002`):** Case-insensitive and trimmed name validation preventing accidental deletion of the `(default)` database.

---

## [1.1.5] - 2026-10-10

### Security
- **Unauthenticated Collection Wipeout (`SYN-P3-001`):** Fixed missing authentication on `DELETE /collections/:path`.
- **Bulk Document Exfiltration (`SYN-P3-002`):** Gated unauthenticated collection dumping on `GET /collections/:path/documents`.
- **Collection Group Security Rules (`SYN-P3-004`):** Enforced recursive rules evaluation on subcollection group queries.

---

## [1.1.0] - 2026-10-01

### Security
- **Supreme Red Team Audit Remediation (10 CVEs neutralized):**
  - Strict asymmetric JWT token verification and revocation checking.
  - WebSocket tenant BOLA isolation.
  - Resolved root directory traversal file scavenging defense.
  - Blind SSRF webhook outbound IP filtering.
  - Timing-safe constant-time secret comparison (`crypto.timingSafeEqual`).

---

## [1.0.0] - 2026-09-15

### Added
- Initial production release of Syntrabase: Self-hosted, multi-tenant Firebase-compatible platform built entirely on PostgreSQL 16 JSONB, Fastify, Next.js, and Caddy.
- Modular `@syntrabase/client-sdk` matching Firebase v9/v10 syntax.
- Server-side `@syntrabase/admin-sdk` with privileged master secret execution.
- Append-only HMAC-SHA256 audit ledger.
