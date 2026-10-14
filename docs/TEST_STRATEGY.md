# COMPREHENSIVE TEST STRATEGY & QUALITY GATES

**Authoritative References:** `imp1.md` through `imp5.md`, `Execution.md`

---

## 1. Quality Gates & Release Criteria
No phase is considered complete without passing its corresponding automated tests.
Production approval requires:
1. All unit, integration, and security tests passing with zero errors.
2. Clean compilation across all TypeScript packages and Next.js applications.
3. Verification that zero database ports are exposed on host network interfaces.
4. Client SDK bundle inspection proving zero secret or admin module leaks.
5. Automated test restoration of an encrypted database backup verifying row checksums.

---

## 2. Test Suites

### Suite A: Unit Tests (`npm run test:unit`)
- **Rules Engine Evaluator**:
  - Validates AST parsing of declarative rules.
  - Tests allow/deny conditions for `request.auth`, `resource.data`, and `request.resource.data`.
  - Verifies fail-closed behavior on timeout or syntax errors.
- **Query Parser**:
  - Verifies translation of Firestore query constraints (`==`, `in`, `array-contains`, `orderBy`, `limit`) into safe SQL parameters.
- **Cryptographic Hash Ledger**:
  - Tests HMAC-SHA256 continuity calculations.
  - Verifies that altering any field in an audit entry invalidates the chain.
- **Token Verification**:
  - Tests JWT issuance, signature validation, expiration, and algorithm confusion defenses (e.g. rejecting `none` algorithm).

### Suite B: Integration Tests (`npm run test:integration`)
- **PostgreSQL Data Access**:
  - Tests document CRUD, hierarchical path traversal, and JSONB GIN index queries.
  - Tests transactional outbox: verifies that document mutations insert records into `event_outbox` atomically in the same SQL transaction.
  - Tests optimistic concurrency control via document version increments.
- **Authentication Lifecycle**:
  - Developer registration, login, and Argon2id verification.
  - Rotating refresh token lifecycle and reuse detection.
  - App user authentication isolated per project.
- **Realtime Synchronization**:
  - Tests WebSocket connection handshake and subscription registration.
  - Tests event push from `event_outbox` to active client sockets.
  - Tests cursor checkpoint recovery after client reconnection.
- **Storage Subsystem**:
  - File upload with MIME magic byte detection.
  - Signed time-limited download URL generation and expiry validation.

### Suite C: Adversarial Security Tests (`npm run test:security`)
- **Cross-Tenant Isolation Test**:
  - User from Project A attempts to read/write/delete documents in Project B $\implies$ MUST return 403 Forbidden.
- **Rule Bypass Attempt**:
  - Unauthenticated client attempts to query protected collection $\implies$ MUST return `PERMISSION_DENIED`.
- **Privilege Escalation Test**:
  - Standard developer attempts to invoke Super Admin endpoints with forged claim $\implies$ MUST be rejected by DB-backed check.
- **Rate Limit Tripping**:
  - Simulates 20 rapid login attempts $\implies$ Verifies that Fastify rate limiter responds with 429 and emits Level 1 alert.
- **SDK Bundle Leak Scanner**:
  - Scans `@syntrabase/client-sdk` build artifacts for keywords (`sk_live`, `admin_key`, `@syntrabase/admin-sdk`, `DATABASE_URL`) $\implies$ MUST be 100% clean.

### Suite D: Backup & Isolated Restore Test (`npm run test:backup`)
- Script dumps PostgreSQL database to encrypted file (`.dump.enc`).
- Launches disposable temporary PostgreSQL container on private network.
- Restores database dump into temporary instance.
- Queries row counts across `developers`, `projects`, `documents`, and `audit_ledger`, verifying exact match with source database.

---

## 3. Test Automation Commands
```bash
npm run test:unit          # Fast in-memory unit tests
npm run test:integration   # Database and API integration tests
npm run test:security      # Adversarial security & bundle leak tests
npm run test:backup        # Automated isolated backup restore verification
npm test                   # Full test suite execution
```
