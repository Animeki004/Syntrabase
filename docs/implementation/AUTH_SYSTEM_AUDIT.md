# Syntrabase — Authentication System Audit & Feature Matrix

## Phase 0: Repository Audit Report

Date: 2026-10-13  
Platform: **Syntrabase**  
Scope: Authentication Engine, Provider Configuration, Developer Console UI, SDKs, Database Schema.

---

## 1. Executive Summary

Syntrabase provides foundational authentication services including Argon2id password hashing, rotating refresh tokens with reuse detection, atomic single-use email action tokens, and basic anonymous authentication. 

However, prior to this upgrade:
1. **Missing Project Auth Configuration**: New projects had no persisted authentication settings table (`project_auth_configs`). All implemented sign-in mechanisms were globally active without per-project switches, violating the core rule that *new projects must start with all optional providers disabled*.
2. **Missing Provider Enforcement**: The API gateway did not check project configuration before accepting registrations, logins, or anonymous sign-ins.
3. **Developer Console UI Was A Static Mock**: `apps/console/src/app/auth/page.tsx` contained a hardcoded mock user list with no tabs for **Sign-in method**, **Templates**, **Usage**, or **Settings**.
4. **Email Templates Were Hardcoded**: Action emails sent hardcoded text rather than configurable project-scoped templates with variable interpolation.
5. **Multi-Factor Authentication (MFA)**: TOTP enrollment and challenge verification were absent.
6. **OAuth & SMS Capabilities**: OAuth providers (Google, GitHub, Apple) and SMS lacked backend configuration schemas and state validation adapters.

---

## 2. Feature Matrix & Implementation Status

| Feature / Subsystem | Status Before Upgrade | Target Status | Relevant Files | Security Risks & Constraints |
| :--- | :--- | :--- | :--- | :--- |
| **Project Auth Configuration** | `ABSENT` | `PRODUCTION_APPROVED` | `infrastructure/database/migrations/004_auth_engine_and_config.sql`, `apps/api/src/services/auth-config.service.ts` | Concurrency race during updates; requires schema validation & tenant isolation. |
| **Provider Enforcement (Server-Side)** | `ABSENT` | `PRODUCTION_APPROVED` | `apps/api/src/routes/auth.routes.ts`, `apps/api/src/services/auth.service.ts` | Default-allow risk: new projects must fail closed with 403 `PROVIDER_DISABLED`. |
| **Email/Password Provider** | `PARTIALLY_IMPLEMENTED` | `PRODUCTION_APPROVED` | `apps/api/src/services/auth.service.ts` | Needs project-level disable switch & password complexity policy enforcement. |
| **Anonymous Authentication** | `PARTIALLY_IMPLEMENTED` | `PRODUCTION_APPROVED` | `apps/api/src/services/auth.service.ts` | Must be disabled by default; needs abandonment cleanup policy & account linking guardrails. |
| **OAuth Providers (Google, GitHub, Apple)** | `ABSENT` | `CONFIG_READY` | `packages/schemas`, `apps/api/src/services/auth-config.service.ts` | Plaintext secret exposure risk; OAuth client secrets must be AES-256-GCM encrypted. |
| **Phone / SMS Provider** | `ABSENT` | `CONFIG_READY` | `packages/schemas`, `apps/api/src/services/auth-config.service.ts` | Abuse risk; daily SMS quota & region policy must be enforced before gateway send. |
| **Multi-Factor Auth (TOTP MFA)** | `ABSENT` | `PRODUCTION_APPROVED` | `apps/api/src/services/mfa.service.ts`, `apps/api/src/routes/auth.routes.ts` | Unencrypted TOTP secrets; requires AES-256-GCM encryption & one-time recovery codes. |
| **Email Template Engine** | `PARTIALLY_IMPLEMENTED` | `PRODUCTION_APPROVED` | `apps/api/src/services/template.service.ts`, `email_templates` JSONB | Injection / XSS in emails; requires strict variable escaping and safe URL construction. |
| **Developer Console UI (5 Tabs)** | `UI_ONLY_MOCK` | `PRODUCTION_APPROVED` | `apps/console/src/app/auth/page.tsx` | Must reflect real backend data; pixel-accurate to Firebase Console layout. |
| **User Directory & Actions** | `PARTIALLY_IMPLEMENTED` | `PRODUCTION_APPROVED` | `apps/api/src/routes/auth.routes.ts`, `apps/console` | Exposure of sensitive fields; password hashes and refresh tokens must never be sent to UI. |
| **User Activity Logging** | `PARTIALLY_IMPLEMENTED` | `PRODUCTION_APPROVED` | `auth_activity_logs` table, `apps/api/src/services/audit.service.ts` | Password leaks in logs; strict redaction of raw tokens and secrets required. |
| **Client SDK (`@platform/client-sdk`)** | `IMPLEMENTED` | `EXTENDED` | `packages/client-sdk/src/auth.ts` | Add TOTP MFA challenge, updateEmail, password policy helpers. |
| **Admin SDK (`@platform/admin-sdk`)** | `PARTIALLY_IMPLEMENTED` | `EXTENDED` | `packages/admin-sdk/src/auth.ts` | Add user management (`createUser`, `updateUser`, `deleteUser`, `listUsers`, `setCustomClaims`). |

---

## 3. Architecture & Migration Strategy

1. **Migration `004_auth_engine_and_config.sql`**:
   - `project_auth_configs`: Stores enabled providers (all `FALSE` by default for new projects), password policies, authorized domains, session TTLs, and email templates.
   - `app_user_mfa`: Stores TOTP secrets (encrypted with AES-256-GCM), recovery codes, and verification status.
   - `app_user_identities`: Tracks linked identities (Google, GitHub, Apple, Email, Anonymous) for account linking.
   - `auth_activity_logs`: Project-scoped security events (signups, failed logins, session revocations, provider rejections).
   - `app_users` extensions: `phone_number`, `phone_verified`, `last_sign_in_at`.

2. **Rollback Strategy**:
   - `infrastructure/database/migrations/rollbacks/004_auth_engine_and_config_rollback.sql` created in dedicated rollbacks directory.

3. **Backend Enforcement Layer**:
   - Middleware/helper in `AuthService.assertProviderEnabled(projectId, provider)` called on all registration, login, and auth endpoints.
