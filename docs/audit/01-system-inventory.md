# Syntrabase System & Component Inventory (Pre-Production Audit)

## Executive Summary
This document provides a comprehensive, ground-truth inventory of all tracked applications, shared packages, database models, background services, external integrations, deployment manifests, and test suites across the Syntrabase repository.

**Repository Commit Baseline:** `91b4e50f32e4ac9fab7f4bd0731fe215a510b11c`  
**Monorepo Architecture:** npm workspaces (Node.js >= 20.0.0, npm >= 10.0.0)  
**Verification Date:** October 2026

---

## 1. Monorepo Structure & Package Manifest

```
web-test/
├── apps/
│   ├── api/                     # Backend API Gateway & Realtime Engine (@syntrabase/api)
│   ├── console/                 # Next.js 14 Developer Console (@syntrabase/console)
│   └── super-admin/             # Next.js 14 Super Admin Operations Portal (@syntrabase/super-admin)
├── packages/
│   ├── admin-sdk/               # Node.js Server Admin SDK (@syntrabase/admin-sdk)
│   ├── client-sdk/              # Browser/Mobile Firebase v9/v10 compatible Client SDK (@syntrabase/client-sdk)
│   ├── rules-engine/            # Security Rules AST Compiler & Evaluator (@syntrabase/rules-engine)
│   ├── schemas/                 # Canonical Zod Validation Schemas (@syntrabase/schemas)
│   └── shared-types/            # Shared TypeScript Interfaces (@syntrabase/shared-types)
├── infrastructure/
│   ├── database/
│   │   ├── migrations/          # 13 SQL Migrations (PostgreSQL 16+)
│   │   └── scripts/             # Verification suites (DB, Backup & Restore)
│   └── docker/                  # Dockerfiles, Compose specs & Coolify configs
└── docs/                        # Architectural, API, and Security Documentation
```

---

## 2. Core Applications Inventory

### 2.1 Backend API Gateway (`apps/api`)
- **Package Name:** `@syntrabase/api`
- **Framework:** Fastify v4.28.1 (TypeScript, ESM)
- **Primary Entrypoint:** `src/server.ts`
- **Port / Bindings:** Port 4000 (configurable via `PORT`), bound to `0.0.0.0`
- **Core Responsibilities:**
  1. Edge security & header hardening (`@fastify/helmet`, `@fastify/cors`, `@fastify/rate-limit`).
  2. Multi-tenant document database engine supporting full Firestore v1 REST semantics with JSONB indexing.
  3. WebSocket Realtime Transport (`@fastify/websocket`) streaming document mutation outbox events.
  4. Authentication Gateway: Argon2id password hashing, rotating JWT access/refresh token pairs, MFA TOTP (RFC 6238), anonymous authentication, and token revocation.
  5. Security Rules AST Evaluation: Pre-execution rule validation for collection and document operations.
  6. Email & Custom Domain Subsystem: Brevo transactional email adapter, DNS generation (SPF/DKIM/ownership TXT), and Cloudflare DNS automation.
  7. Cloud Functions Dispatcher: Webhook delivery with HMAC-SHA256 request signatures.
  8. Object Storage: Local and S3 signed download/upload URL generators with quota enforcement.
  9. Autonomous Threat Defense: Real-time request monitoring, dynamic rate-limiting, and incident response.
  10. Cryptographic Audit Ledger: Forward-chained HMAC-SHA256 tamper-evident event stream with transactional advisory locking.

### 2.2 Developer Console (`apps/console`)
- **Package Name:** `@syntrabase/console`
- **Framework:** Next.js 14.2.35 (App Router, React 18, TypeScript, TailwindCSS)
- **Primary Routes:**
  - `/` — Project Dashboard, real-time metrics, active quotas
  - `/database` — Firestore document explorer, collection viewer, document editor, and JSON query runner
  - `/storage` — Storage bucket manager, signed upload generator, file preview
  - `/auth` — Developer & App User management, provider toggles, password policies, session revocation
  - `/email` — Custom domain verification, SPF/DKIM DNS diagnostics, sender identity registration
  - `/rules` — Security rules IDE with real-time AST syntax validation and simulation
  - `/settings` — Project API credentials, key lifecycle (rotation, revocation), and plan quota view
  - `/sdk-setup` — Code snippets for Node.js, Web, and React Native SDK setup
  - `/contact` — Developer inquiry submission and threaded support center
  - `/login`, `/register` — Authentication workflows with persistent sessions

### 2.3 Super Admin Portal (`apps/super-admin`)
- **Package Name:** `@syntrabase/super-admin`
- **Framework:** Next.js 14.2.35 (App Router, React 18, TypeScript, TailwindCSS)
- **Primary Routes:**
  - `/` — Cluster-wide overview, active tenant counts, system load, throughput
  - `/tenants` — Tenant lifecycle: suspension, reactivation, quota overrides, plan reassignments
  - `/plans` — Plan catalog manager: Free, Pro, Enterprise limits and capability feature-flags
  - `/gateways` — Edge defense & security killswitches, autonomous defense simulator
  - `/email` — Global relay accounts, Brevo provider credentials, dedicated vs shared routing, outbox queue
  - `/audit` — Cryptographic ledger viewer with forward-chain verification tool
  - `/backups` — Automated snapshot trigger, encrypted backup downloads, point-in-time disaster recovery
  - `/soc` — Security Operations Center: live attack vectors, blocked IP table, rate-limit statistics
  - `/notifications` — Cluster-wide broadcast notification dispatcher

---

## 3. Shared Packages & SDKs

### 3.1 Client SDK (`packages/client-sdk`)
- **Exports:** `initializeApp`, `getAuth`, `signInWithEmailAndPassword`, `createUserWithEmailAndPassword`, `signOut`, `getFirestore`, `doc`, `collection`, `getDoc`, `setDoc`, `updateDoc`, `deleteDoc`, `query`, `where`, `onSnapshot`, `getStorage`, `ref`, `uploadBytesResumable`, `getDownloadURL`
- **Surface Verification:** Zero administrative functions exported. Zero server-side environment variables or secrets bundled. Verified via `npm run test:security`.

### 3.2 Server Admin SDK (`packages/admin-sdk`)
- **Exports:** `initializeAdminApp`, `getAdminAuth`, `getAdminFirestore`, `getAdminStorage`, `getAdminAudit`
- **Security Guardrails:** Rejects initialization in browser runtimes (`window` detection). Strictly requires `sk_live_` secret key prefixes.

### 3.3 Security Rules Engine (`packages/rules-engine`)
- **Exports:** `compileRules(sourceCode)`, `evaluateRules(ast, path, context)`
- **Evaluation Capabilities:** `request.auth`, `request.time`, `request.resource.data`, `resource.data`. Default-deny semantics on unmatched paths or evaluation exceptions.

### 3.4 Schemas & Types (`packages/schemas`, `packages/shared-types`)
- **Validation Engine:** Zod v3.23.8
- **Schemas:** `SetDocumentSchema`, `UpdateDocumentSchema`, `ExecuteQuerySchema`, `BatchWriteSchema`, `TransactionCommitSchema`, `CreateSignedUploadUrlSchema`, `CreateSignedDownloadUrlSchema`, `EmailSendSchema`, `ContactInquirySchema`.

---

## 4. PostgreSQL Database Schema & Migrations

All 13 migrations are located in `infrastructure/database/migrations/` and verified with PostgreSQL 16:

1. `001_initial_schema.sql` — Organizations, Projects, Environments, Developers, Platform Admins, App Users, API Credentials, Documents, Event Outbox, Audit Ledger.
2. `002_plans_and_limits.sql` — Plans catalog, project plan assignment, limits, and capabilities JSONB.
3. `003_syntrabase_core_features.sql` — Field transforms, signed URLs, Cloud Functions registry, dispatch log.
4. `004_auth_engine_and_config.sql` — Auth configs, TOTP MFA, action tokens, password reset tokens.
5. `005_project_databases_and_limits.sql` — Multi-database support per project (`databases` table).
6. `006_brevo_email_and_contact_center.sql` — Brevo provider accounts, custom sender domains, authorized sender identities, outbox queue, contact inquiries.
7. `007_email_account_and_domain_lifecycle.sql` — Domain lifecycle statuses, verification timestamps.
8. `008_developer_password_reset_and_contact_replies.sql` — Console developer password resets and admin replies.
9. `009_contact_message_threads.sql` — Threaded support messages with actor attribution.
10. `010_developer_status_column.sql` — Developer suspension flag (`status: 'active' | 'suspended'`).
11. `011_drop_auth_sessions_fk.sql` — Polished session constraints supporting developer and user sessions.
12. `012_email_accounts_and_backups_schema.sql` — Database backup tracking table.
13. `013_credentials_and_composite_indexes.sql` — Performance indexes on credentials, documents, and ledger.

---

## 5. External Integrations & Cloud Boundaries

| Integration | Purpose | Auth Mechanism | Secret Location |
| :--- | :--- | :--- | :--- |
| **Brevo (Sendinblue)** | Transactional email & verification delivery | API Key (`xkeysib-...`) | Encrypted at rest in DB (`AES-256-GCM`) via `CREDENTIALS_ENCRYPTION_KEY` |
| **Cloudflare DNS API** | Automated custom domain DNS provisioning | Bearer API Token | Transmitted dynamically in Super Admin requests; never hardcoded |
| **PostgreSQL 16** | Core relational & JSONB primary datastore | User/Password / SSL | Environment variable `DATABASE_PASSWORD` |
| **Coolify / Traefik** | Reverse proxy, SSL termination, domain routing | Docker networks / labels | `docker-compose.coolify.yml` |
| **AI / LLM Components** | Autonomous threat defense simulations | Deterministic rule engine | Built-in heuristics in `defense.service.ts` (Zero external LLM API cost/leakage) |

---

## 6. Verification Status Matrix

| Component | Code Status | Automated Test Coverage | Verified Status |
| :--- | :--- | :--- | :--- |
| Fastify API Gateway | Complete | 71 integration tests | **VERIFIED (PASSED)** |
| Next.js Console | Complete | Production Build (14 routes) | **VERIFIED (PASSED)** |
| Next.js Super Admin | Complete | Production Build (14 routes) | **VERIFIED (PASSED)** |
| Client SDK | Complete | Bundle leak & surface tests | **VERIFIED (PASSED)** |
| Admin SDK | Complete | Runtime & guardrail unit tests | **VERIFIED (PASSED)** |
| Rules Engine | Complete | Evaluator unit tests | **VERIFIED (PASSED)** |
| Database Engine | Complete | 10 ACID & JSONB tests | **VERIFIED (PASSED)** |
| Backup & DR | Complete | 3-stage backup/restore test | **VERIFIED (PASSED)** |
| Email Subsystem | Complete | 14 Brevo & custom domain tests | **VERIFIED (PASSED)** |
