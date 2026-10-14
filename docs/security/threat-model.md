# COMPREHENSIVE THREAT MODEL & SECURITY CONTROL MATRIX

**Version:** 1.0  
**Target Platform:** Self-Hosted Firebase-Compatible Platform (Option 2)  
**Authoritative References:** `imp1.md`, `imp2.md`, `imp3.md`, `imp4.md`, `imp5.md`, `Execution.md`

---

## 1. System Assets & Trust Boundaries

### Critical Assets
1. **Developer Accounts & Credentials**: Password hashes, sessions, MFA secrets.
2. **Platform Secret Keys**: JWT signing keys (`kid`), database credentials, backup encryption keys.
3. **Application Tenant Data**: Documents, subcollections, user profile records, private files.
4. **Audit & Event Logs**: Tamper-evident ledger, access logs, SOC incident records.
5. **Infrastructure Compute & Memory**: VPS RAM (~11 GiB), CPU, disk storage, network sockets.

### Trust Boundaries
- **Boundary 1 (Public Edge)**: Public Internet $\leftrightarrow$ Caddy (Ports 80/443). Untrusted requests must be sanitized and routed.
- **Boundary 2 (API Gateway)**: Caddy $\leftrightarrow$ Fastify Gateway (`app-net`). Inbound requests lack authentication until verified.
- **Boundary 3 (Tenant Isolation)**: Project A $\leftrightarrow$ Project B. Strict isolation in all queries, outbox events, and storage buckets.
- **Boundary 4 (SDK Boundary)**: Public `@syntrabase/client-sdk` (untrusted) $\leftrightarrow$ Privileged `@syntrabase/admin-sdk` (trusted server).
- **Boundary 5 (Data Storage)**: Fastify API $\leftrightarrow$ PostgreSQL (`data-net`). Zero public internet access.
- **Boundary 6 (Administrative Control Plane)**: Developer Console $\leftrightarrow$ Super Admin Console. Strict server-side verification.

---

## 2. Threat Analysis & Control Matrix

| Threat ID | Threat Description | Attack Vector | Preventive Control | Detection & Mitigation |
| :--- | :--- | :--- | :--- | :--- |
| **THREAT-01** | **Brute-Force & Credential Stuffing** | Rapid POSTs to `/api/v1/auth/login` | Argon2id hashing, Fastify rate limiter (max 5 attempts/min per IP/email), progressive delays. | Emit `failed_login` security event. Level 1 Throttle or Level 2 Quarantine if sustained. |
| **THREAT-02** | **Refresh Token Theft & Replay** | Attacker intercepts stolen refresh token | Refresh token rotation with family reuse detection. When an old token is reused, the entire token family is immediately revoked. | Record security event `refresh_token_reuse_detected`. Invalidate all sessions for that user. |
| **THREAT-03** | **Cross-Tenant IDOR (Data Leakage)** | Tenant A requests document with path `/projects/proj-B/...` | Database repository strictly enforces tenant context from authenticated JWT/API key. Queries parameterized with `project_id`. | Reject with 403 Forbidden. Emit `cross_tenant_access_attempt` alert. |
| **THREAT-04** | **Security Rules Bypass** | Client crafts malformed queries or bypasses filters | Rules engine executes in sandboxed AST evaluator. Default-deny on all routes. Fails closed on any timeout or error. | Evaluator unit tests; positive and negative authorization regression tests. |
| **THREAT-05** | **SQL Injection / JSONB Injection** | Malicious payloads in document keys or query filters | 100% Parameterized queries using `pg` driver. JSONB path filters safely parameterized via `jsonb_path_ops` and prepared statements. | Query parser rejects non-allowlisted operators and invalid identifiers. |
| **THREAT-06** | **Privilege Escalation via JWT Claim** | Attacker alters or forges `is_platform_admin` claim | Super Admin actions verify caller identity against active `platform_admins` DB table on every request. Short session lifetime (15m). | Reauthentication required for destructive operations. Immediate session revocation capability. |
| **THREAT-07** | **Tampering with Audit History** | Malicious DB admin deletes or alters audit logs | Cryptographic hash chaining (`HMAC-SHA256(prev_hash, ...)`) + append-only disk logging. | Scheduled verifier runs continuous hash chain integrity checks. Sequence break triggers Level 3 Alert. |
| **THREAT-08** | **Secret Leaks in Client Bundles** | Developer accidentally imports Admin SDK in frontend | Separate packages: `@syntrabase/client-sdk` vs `@syntrabase/admin-sdk`. Hashed storage for secret keys (`sk_live`). | Automated bundle inspection test scans client build outputs for server secrets. |
| **THREAT-09** | **Resource Exhaustion / DoS** | Enormous payloads, unbounded pagination, connection floods | Fastify body limits (max 1MB JSON, max 10MB storage), max query limit (500 items), connection pool limits (max 50 DB clients). | Monitored memory ceilings; 429 Too Many Requests responses with backpressure. |
| **THREAT-10** | **Unauthorized Realtime Eavesdropping** | Attacker listens to WebSocket channel for another user's document | Handshake authenticated via JWT. Every subscription evaluated against Security Rules before registering listener. | Unauthorized subscriptions rejected with `PERMISSION_DENIED` and socket closed if repeated. |
| **THREAT-11** | **Path Traversal & Malicious File Uploads** | Malicious filenames (`../../etc/passwd`), malware uploads | Randomized UUID storage keys; filenames sanitized; MIME type sniffing via magic bytes; private buckets; signed time-limited URLs. | Non-executable storage volume; quota enforcement. |

---

## 3. Autonomous Threat Response Levels

- **Level 0 (Observe)**: Record security event in `audit_ledger`, increment metrics, log correlation ID.
- **Level 1 (Throttle)**: Apply strict IP/Tenant rate limits, add 2-second sleep to responses, limit connection concurrency.
- **Level 2 (Quarantine)**: Temporarily invalidate suspected user session or API key, require reauthentication.
- **Level 3 (Emergency Containment)**: Revoke compromised credentials, disable affected project endpoint, isolate suspicious worker.
- **Level 4 (Human-Authorized Recovery)**: Database point-in-time restore, host reprovisioning, root key rotation.
