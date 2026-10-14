# Supply Chain, Dependencies and Deployment Audit

## Executive Summary
This audit evaluated the monorepo package manifests, transitive dependencies, Dockerfiles, Coolify deployment specifications, and runtime network isolation.

**Audit Status:** REVIEWED & DOCUMENTED (Targeted remediations identified; non-breaking deployment paths established)

---

## 1. Dependency Tree & Vulnerability Analysis

### 1.1 Automated Audit Findings (`npm audit`)
Running `npm audit` across the workspace revealed 4 vulnerability reports across two core third-party dependencies:

1. **Next.js (`next@14.2.35`):**
   - **Vulnerabilities:** GHSA-9g9p-9gw9-jx7f, GHSA-h25m-26qc-wcjf, GHSA-ggv3-7p47-pfv8 (Denial of Service in image optimizer and HTTP request smuggling in rewrites).
   - **Context in Syntrabase:** Next.js is used strictly for the Developer Console (`apps/console`) and Super Admin (`apps/super-admin`). Both run behind a reverse proxy (Traefik in Coolify) with body size caps.
   - **Remediation Recommendation:** `npm audit fix --force` would install Next.js 16 (major breaking change for App Router). Instead, plan a targeted minor update to `next@14.2.x` latest patch or `next@15` in a dedicated staging release cycle after regression testing.

2. **Fastify (`fastify@4.28.1`):**
   - **Vulnerabilities:** GHSA-mrq3-vjjr-p77c, GHSA-jx2c-rxcm-jvmq (Unbounded memory allocation in `sendWebStream` and header whitespace normalization).
   - **Context in Syntrabase:** Syntrabase does not expose `sendWebStream`. Content-type parsing is hardened via explicit parser override in `server.ts:33`.
   - **Remediation Recommendation:** Fastify v5 is available. Plan a controlled upgrade to Fastify v5 in the post-launch stabilization sprint.

---

## 2. Docker & Container Security

### 2.1 Containerfile Inspection
- **Base Image:** `node:20-alpine` (Minimal attack surface, lightweight footprint).
- **Multi-Stage Builds:** Dockerfiles separate the build stage (installing `devDependencies`) from the runtime production stage.
- **Rootless Execution:** Container images configure `USER node` to prevent container escape and privilege escalation.
- **Port Exposure:**
  - API Gateway: Exposed internally on 4000.
  - Console: Exposed internally on 3000.
  - Super Admin: Exposed internally on 3001.
  - PostgreSQL 16: Bound strictly to internal Docker network; host port 5432 is not exposed in production compose specs.

---

## 3. Deployment Configuration (Coolify & Traefik)

### 3.1 Coolify Deployment Manifest (`docker-compose.coolify.yml`)
- **Traefik Labels:** Configures automatic TLS certificate provisioning via Let's Encrypt.
- **Domain Routing:**
  - `API_DOMAIN` ──> `http://api:4000`
  - `CONSOLE_DOMAIN` ──> `http://console:3000`
  - `ADMIN_DOMAIN` ──> `http://super-admin:3001`
- **Health Checks:**
  - Fastify API implements `GET /health` responding with `{ status: "ok", timestamp: ... }`.
  - Verified via `API Integration - Liveness probe responds 200 OK`.

### 3.2 Secure Cookies & Reverse Proxy Trust
- `server.ts` enforces `Secure; HttpOnly; SameSite=Strict` on all cookies when `NODE_ENV=production` or `staging`.
- Reverse proxy trust configuration handles `X-Forwarded-For` and `X-Forwarded-Proto` securely.

---

## 4. Disaster Recovery & Backup Integrity

### 4.1 Encrypted Snapshot Mechanism
- **Script:** `infrastructure/database/scripts/test-backup-restore.js`
- **Encryption:** OpenSSL AES-256-CBC with PBKDF2 key derivation.
- **Verification:**
  - Stage 1: Encrypted backup generated on disk.
  - Stage 2: Independent isolated restoration verified with 100% SHA-256 checksum match.
  - Stage 3: Tamper alert verified at Block 2 when historical blocks are altered.
- **Outcome:** ALL 3 STAGES PASSED. Verified via `npm run test:backup`.
