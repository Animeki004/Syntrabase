# Platform Security Runbook & Incident Response

This document governs operational security procedures, credential rotation, and emergency response workflows for platform operators.

---

## 1. Autonomous Defense Escalation Postures (Levels 0–4)

| Level | Posture | Trigger | System Actions | Operator Responsibility |
| :--- | :--- | :--- | :--- | :--- |
| **Level 0** | **Observe** | Baseline / Nominal | Continuous HMAC-SHA256 audit chaining; normal rate limits. | Monitor daily telemetry. |
| **Level 1** | **Throttle** | Sustained > 100 req/min from single IP or brute-force pattern | Token bucket reduced to 10%; 429 Too Many Requests returned with 2-second backpressure delay. | Review IP source in SOC Threat Log. |
| **Level 2** | **Quarantine**| Repeated failed secret key auth or cross-project IDOR attempt | IP address or tenant API credential quarantined for 60 minutes. | Investigate tenant logs; verify if intentional attack or misconfiguration. |
| **Level 3** | **Emergency Containment** | Suspicious admin session or critical tampering detected | Affected project frozen into read-only mode (`status = suspended`); compromised API keys revoked. | Confirm breach containment; rotate root signing secrets. |
| **Level 4** | **Human Recovery** | Total integrity violation or multi-region anomaly | Global write freeze; database isolation; automated actions suspended. | Super Admin manual MFA override required to clear locks. |

---

## 2. Emergency Credential Revocation

### Scenario A: Compromised Admin Secret Key (`sk_live_...`)
1. Log into **Super Admin Console** $\rightarrow$ Navigate to **Tenant Fleet** or **Project Settings**.
2. Locate the compromised credential $\rightarrow$ Click **Revoke Key**.
3. The API Gateway marks `revoked = true` in PostgreSQL. Subsequent calls with that key immediately fail with `401 Unauthorized`.
4. Generate a replacement secret key (one-time display) and migrate worker processes.

### Scenario B: Compromised User or Leaked JWT Signing Secret
To invalidate all active tokens across the entire platform:
1. Append the current `JWT_SECRET` to `JWT_PREVIOUS_SECRETS` (to allow graceful refresh if desired) OR discard completely for emergency invalidation.
2. Set a new random `JWT_SECRET`:
   ```bash
   openssl rand -hex 32
   ```
3. Update `JWT_ACTIVE_KID=key_2026_v2`.
4. Redeploy Fastify API in Coolify. All existing access tokens signed by the old key will fail validation immediately.

---

## 3. Cryptographic Audit Chain Verification

To independently verify that no historical audit log entries have been tampered with or deleted:

```bash
node -e '
  const { query } = require("./apps/api/dist/apps/api/src/db/pool.js");
  const { CryptoUtil } = require("./apps/api/dist/apps/api/src/utils/crypto.js");
  const { config } = require("./apps/api/dist/apps/api/src/config.js");

  async function verify() {
    const res = await query("SELECT * FROM audit_ledger ORDER BY sequence_id ASC");
    let prev = "0000000000000000000000000000000000000000000000000000000000000000";
    for (const row of res.rows) {
      const expected = CryptoUtil.hmacSha256(prev + ":" + JSON.stringify(row.payload), config.security.auditHmacSecret);
      if (row.current_hash !== expected) {
        console.error("TAMPER DETECTED AT SEQUENCE:", row.sequence_id);
        process.exit(1);
      }
      prev = row.current_hash;
    }
    console.log("Audit ledger: 100% verified across " + res.rows.length + " records.");
  }
  verify();
'
```
