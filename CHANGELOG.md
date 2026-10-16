# Syntrabase Changelog & Release Notes

All notable changes to the Syntrabase platform, SDKs, and services are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
