# ARCHITECTURE DECISIONS (ADR SUMMARY)

**Status:** Approved & Reconciled  
**Date:** 2026-10-13  

---

## ADR 0001: PostgreSQL JSONB as Authoritative Document Store
- **Context:** `imp1.md` originally suggested MongoDB; Addendum `imp2.md` authoritative override mandates PostgreSQL with JSONB.
- **Decision:** Use PostgreSQL 16+ as the single authoritative database. Relational schemas store tenants, auth, credentials, audit, and quotas. Flexible Firestore-style documents are stored in a `documents` table with a `data` `JSONB` column, indexed via GIN (`jsonb_path_ops`).
- **Consequences:** Eliminates multiple heterogeneous databases. Guarantees transactional ACID consistency across relational metadata and document updates.

---

## ADR 0002: Transactional Outbox for Realtime Durability
- **Context:** PostgreSQL `LISTEN/NOTIFY` is an ephemeral pub/sub mechanism without persistence. Disconnected WebSocket clients miss updates.
- **Decision:** Implement the Transactional Outbox pattern. Document writes atomically insert an event record into `event_outbox` with a monotonic `sequence_id` within the same transaction. `LISTEN/NOTIFY` is used purely as a wake-up signal. The realtime service queries `event_outbox` using checkpoint cursors to replay missed events to reconnected clients.
- **Consequences:** Guarantees zero missed events during network drops or worker restarts. Supports resumable client sync.

---

## ADR 0003: Cryptographic Hash Chaining for Tamper-Evident Audit Logging
- **Context:** A standard database table can be altered by compromised DB credentials or privileged operators without evidence.
- **Decision:** Each audit log entry includes `prev_hash` and `current_hash = HMAC_SHA256(prev_hash || timestamp || actor_id || action || payload, secret_key)`. Audit logs are also streamed to an OS-restricted append-only log file. A scheduled verification task checks hash continuity.
- **Consequences:** Any alteration, deletion, or insertion of audit entries breaks the cryptographic hash chain, immediately alerting operators.

---

## ADR 0004: Fastify Application-Layer Rate Limiting & Defense
- **Context:** Standard Caddy lacks built-in general-purpose rate limiting without external plugins (`caddy-ratelimit`).
- **Decision:** Keep Caddy focused on TLS termination, HTTP/3, host-based routing, and security headers. Enforce multi-tier rate limiting at the Fastify gateway layer using `@fastify/rate-limit` with token-bucket algorithms per IP and per API key.
- **Consequences:** Avoids custom Caddy binary compilation dependencies. Enables granular per-project and per-route rate limits.

---

## ADR 0005: Dual Isolated SDKs with Trust Boundary Enforcement
- **Context:** Exposing admin credentials or privileged APIs to browser bundles creates severe privilege escalation risks.
- **Decision:** Create two separate packages:
  - `@platform/client-sdk`: Public, zero-privileged client library. Communicates via publishable keys (`pk_live_...`) and app-user JWTs.
  - `@platform/admin-sdk`: Privileged server-only library. Communicates via secret keys (`sk_live_...`).
  - Automated tests scan client bundles to verify that admin modules and secret keys are completely absent.
- **Consequences:** Absolute compile-time and bundle-time isolation between untrusted clients and privileged backends.

---

## ADR 0006: Server-Side Verification for Privileged Administration
- **Context:** Static JWT claims (e.g. `is_platform_admin`) cannot be revoked without expiring the token and can be forged if signing keys are compromised.
- **Decision:** Privileged Super Admin actions must verify the administrator's active status against the database `platform_admins` table on every sensitive request. Require short-lived privileged session tokens (max 15 mins), check revocation blacklists, and enforce reauthentication for high-risk actions.
- **Consequences:** Prevents stale claims from executing administrative operations and supports instantaneous admin session revocation.

---

## ADR 0007: Hashed Secret Keys with One-Time Delivery
- **Context:** Plaintext API secrets stored in databases risk exposure during SQL leaks or database inspection.
- **Decision:** Generate secret keys formatted as `sk_live_<random32bytes>`. Display the raw key **once** in the UI at creation time. Hash the key with Argon2id or SHA-256 before storing it in PostgreSQL. Incoming requests hash the supplied secret to compare against the stored hash.
- **Consequences:** Prevents secret exfiltration even in the event of unauthorized read access to the credentials table.

---

## ADR 0008: VPS Resource Allocation & Docker Network Isolation
- **Context:** The deployment target is an Ubuntu VPS with ~11 GiB RAM running alongside potential other workloads.
- **Decision:** Apply explicit Docker Compose resource limits:
  - PostgreSQL: 2 GiB RAM
  - Fastify API: 1 GiB RAM
  - Developer Console: 768 MB RAM
  - Super Admin Console: 768 MB RAM
  - Caddy: 256 MB RAM
  - Workers: 512 MB RAM
  - Total allocated: ~5.3 GiB, preserving > 5.5 GiB headroom.
  - Ports: Only ports 80 and 443 bound to the host interface. PostgreSQL and API ports are bound exclusively to private Docker bridge networks.
- **Consequences:** Prevents OOM crashes and blocks external port scanning attacks.
