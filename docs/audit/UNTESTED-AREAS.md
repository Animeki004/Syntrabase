# Explicit Untested Areas & Deployment Prerequisites

**Framework:** SUPREME CORE Universal Security and Engineering Assessment Engine  
**Version:** 1.0  
**Repository:** `Animeki004/Syntrabase`  
**Assessment Mode:** `REPOSITORY_AUDIT` & `LOCAL_SECURITY_TEST`  

---

## 1. Operating Principle

A repository audit and local security test suite—no matter how rigorous—cannot prove that deployed production infrastructure is secure. In accordance with the SUPREME CORE Constitution:

> "A local audit cannot prove production infrastructure is secure. Explicitly list deployment-specific checks that remain."

The following boundaries and environments remain outside local testing capabilities and require explicit operational verification upon deployment to Staging and Production.

---

## 2. Inventory of Untested Areas & External Dependencies

### 2.1 Live DNS Propagation & Cloudflare Edge Verification
- **Status:** **UNTESTED LIVE**
- **Reason:** Local testing utilizes loopback networks and simulated domain endpoints (`example.com`, `syntrabase.example.com`).
- **Prerequisites for Production:**
  1. Delegation of NS records to Cloudflare nameservers.
  2. Live CNAME record validation and TLS certificate issuance via ACME.
  3. Verification that proxying is disabled (`DNS only`) on required verification records.

### 2.2 External Transactional Outbound Email Delivery (Brevo & Resend)
- **Status:** **UNTESTED LIVE INBOXES**
- **Reason:** Local test suite executes against mocked or transactional outbox records (`inMemoryOutboxQueue` and PostgreSQL `outbox_events`). Outbound requests to `api.brevo.com` require live production API keys and credits.
- **Prerequisites for Production:**
  1. Injection of active `BREVO_API_KEY` into production environment variables.
  2. Domain verification (DKIM, SPF, DMARC) in the Brevo management console.
  3. Live end-to-end receipt of welcome, password reset, and verification emails in real customer inboxes (Gmail, Outlook).

### 2.3 Edge Reverse-Proxy Header Spoofing & TLS Ciphers
- **Status:** **REQUIRES STAGING RUNTIME VERIFICATION**
- **Reason:** Local Fastify integration tests inject HTTP requests via `server.inject()`. While header trust (`x-forwarded-for`, `x-real-ip`) has been hardened in code, the edge proxy configuration (`Traefik` / `Caddy`) must enforce:
  1. Stripping untrusted upstream client headers before forwarding to Fastify.
  2. Enforcing TLS 1.3 / modern cipher suites.
  3. Rate limiting and DDoS protection at the cloud edge.

### 2.4 High-Concurrency Distributed Outbox Processing
- **Status:** **BENCHMARKED IN-MEMORY / REQUIRES CLUSTER VERIFICATION**
- **Reason:** Local unit tests verify sequential and atomic batch processing up to 100 concurrent requests. Multi-node cluster behavior where multiple Fastify instances process the same PostgreSQL outbox queue simultaneously must be verified under staging load.

### 2.5 Disaster Recovery & Bare-Metal Database Restoration
- **Status:** **VERIFIED BY SCRIPT / REQUIRES OPERATIONAL DRILL**
- **Reason:** Script `infrastructure/database/scripts/test-backup-restore.js` verifies schema dump and restore integrity locally. A live failover drill simulating a hard-drive crash or container eviction with live customer write traffic must be conducted prior to General Availability (GA).

---

## 3. Recommended Staging Verification Protocol

Prior to production traffic release, execute the following non-destructive checks against the deployed Staging environment:

1. **Staging Smoke Test:** Verify `GET /api/v1/health` returns HTTP 200 with active PostgreSQL pool latency < 15ms.
2. **Super Admin Isolation:** Confirm that non-whitelisted developer accounts receive HTTP 403 on all `/api/v1/admin/*` routes.
3. **Outbox Ingestion:** Trigger a password reset from the staging console and observe successful receipt via Brevo webhook.
4. **Rules Compilation:** Publish a new security rule version and verify that forbidden operations are immediately rejected by the rules engine with HTTP 403.
