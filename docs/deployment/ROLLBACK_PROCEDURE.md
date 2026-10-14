# Rollback & Recovery Procedures

This runbook specifies the exact procedure to roll back deployments or recover from failures on an existing Coolify VPS.

---

## 1. Application-Level Rollback (Zero Downtime)

When a new application image introduces a regression, roll back immediately in the Coolify Dashboard:

1. In **Coolify**, navigate to your **Docker Compose Resource**.
2. Click on the **Deployments** tab.
3. Locate the last known healthy deployment commit/hash.
4. Click **Redeploy This Commit**.
5. Coolify will pull the previous images and perform an in-place container swap.
6. Target Recovery Time Objective (RTO): **< 2 minutes**.

---

## 2. Emergency Database Rollback & Point-in-Time Restore

If a bad migration or data corruption occurs, restore from the last encrypted backup snapshot:

### Step 1: Identify Last Healthy Encrypted Snapshot
List encrypted backups:
```bash
ls -la infrastructure/database/backups/
# Example: test_backup_1791867348654.dump.enc
```

### Step 2: Decrypt the Backup Offline
Using the standalone decryption tool or script:
```bash
node -e '
  const fs = require("fs");
  const crypto = require("crypto");
  const file = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
  const key = Buffer.from(process.env.BACKUP_KEY, "hex");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(file.iv, "hex"));
  decipher.setAuthTag(Buffer.from(file.authTag, "hex"));
  let dec = decipher.update(file.ciphertext, "hex", "utf8");
  dec += decipher.final("utf8");
  fs.writeFileSync("/tmp/restored.sql", dec);
' /path/to/backup.dump.enc
```

### Step 3: Restore Into Temporary Database Schema
```bash
docker exec -i platform-postgres psql -U postgres -d firestore_platform -c "CREATE SCHEMA IF NOT EXISTS restore_sandbox;"
docker exec -i platform-postgres psql -U postgres -d firestore_platform < /tmp/restored.sql
```

### Step 4: Validate Checksums & Switch Over
```bash
# Verify row counts and checksums
docker exec -i platform-postgres psql -U postgres -d firestore_platform -c "SELECT count(*) FROM documents;"
```

---

## 3. Post-Rollback Integrity Verification

After completing a rollback:
1. Hit the liveness probe: `curl https://api.yourdomain.com/health` $\implies$ `{"status":"ok"}`.
2. Run audit ledger verification: Visit `https://admin.yourdomain.com/audit` and click **Verify Chain Integrity**.
3. Verify Traefik proxy routes: Ensure no 502 Bad Gateway responses are reported in Coolify Traefik logs.
