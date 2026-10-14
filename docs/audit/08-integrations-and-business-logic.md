# Email, Custom Domains, Storage, Billing & Business Logic Audit

## Executive Summary
This audit evaluated the transactional email pipeline, Brevo provider integration, custom domain DNS automation, Cloudflare integration, object storage quotas, plan entitlement engine, and developer contact center.

**Audit Status:** PASSED (Email delivery lifecycle, DNS records, and plan quotas verified)

---

## 1. Transactional Email Pipeline & Brevo Integration

### 1.1 Provider Architecture & Registry
- **Interface:** `IEmailProviderAdapter` (`email-provider.interface.ts`)
- **Supported Adapters:**
  - `BrevoEmailProvider` (`brevo.provider.ts`) — Real-world HTTP integration with the Brevo API v3 (`https://api.brevo.com/v3`).
  - `MockEmailProvider` (`mock.provider.ts`) — In-memory test adapter for offline deterministic verification.
- **Provider Registry:** `EmailProviderRegistry` manages active adapters and provides seamless failover.

### 1.2 Credential Validation & Classification
- **Invalid Key Rejection:** Tests confirm empty keys or invalid `xkeysib-...` keys fail validation with actionable error descriptions without crashing the gateway.
- **Error Categorization:** Failed deliveries are classified as:
  - `AUTH_ERROR` (e.g. 401 Invalid Key)
  - `RATE_LIMITED` (e.g. 429 Provider Throttled)
  - `TEMPORARY_ERROR` (e.g. 503 Network Timeout)
  - `PERMANENT_ERROR` (e.g. 400 Malformed Email)

### 1.3 Outbox Queue & Circuit Breakers
- **Durable Queue:** Outbound emails are enqueued in `email_outbox_queue`.
- **Idempotency:** Re-enqueuing duplicate messages with identical idempotency keys is deduplicated.
- **Circuit Breaker:** Rate-limited provider responses trigger exponential backoff:
  ```ts
  const backoffDelay = Math.min(Math.pow(2, msg.retry_count) * 1000, 60000);
  ```
- **Verification:** Verified via `Outbox Scheduler — Rate Limit & Quota Circuit Breaker with Exponential Backoff`.

---

## 2. Custom Domains & DNS Provisioning

### 2.1 Lifecycle Statuses
Domains progress through three authoritative states:
`pending` ──> `verified` ──> `failed`

### 2.2 DNS Record Generation
Upon registration (`EmailService.registerCustomDomain`), Syntrabase generates 4 standard RFC-compliant DNS records:
1. **DKIM:** `mail._domainkey.<domain>` (TXT) with RSA public key.
2. **SPF:** `@` (TXT) with `v=spf1 include:spf.brevo.com ~all`.
3. **DMARC:** `_dmarc.<domain>` (TXT) with `v=DMARC1; p=none;`.
4. **Ownership:** `syntrabase-code.<domain>` (TXT) for domain ownership verification.

### 2.3 Cloudflare DNS Automation
- `EmailService.syncCloudflareDns()` interacts directly with the Cloudflare v4 API:
  - Resolves zone ID from domain name.
  - Merges multiple SPF records to prevent RFC 7208 violations.
  - Strips outer quotes to prevent double-quoted TXT values.
  - Deletes stale ownership tokens automatically.

---

## 3. Object Storage Subsystem

### 3.1 Drivers & Quota Enforcement
- **Storage Driver:** Supports `local` filesystem driver and `s3` compatible object stores.
- **Plan Enforcement:**
  - Free Tier: `storage.objects` capability is disabled (`maxFileStorageBytes = 0`). Direct uploads and signed upload URL generation are blocked with `HTTP 403 FEATURE_DISABLED`.
  - Pro Tier: 5 GB file storage quota enabled.
  - Enterprise Tier: 100 GB file storage quota enabled.
- **Verification:** Verified via `Plan Enforcement - Free-tier project is strictly BLOCKED from direct file upload` and `Plan Enforcement - Free-tier project is strictly BLOCKED from generating signed upload URLs`.

---

## 4. Plans, Quotas & Entitlement Enforcement

### 4.1 Plan Catalog (`plans` table)
| Plan | Database Storage | Max Doc Size | File Storage | Max Realtime Connections | Projects Limit |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Free Tier** | 50 MB | 1 MB | 0 B (Disabled) | 25 | 3 |
| **Pro Tier** | 1 GB | 4 MB | 5 GB | 500 | 15 |
| **Enterprise**| 50 GB | 16 MB | 100 GB | 10,000 | 100 |

### 4.2 Concurrency-Safe Quota Enforcement
- `PlanService.assertProjectQuota()` validates project creation limits before executing project insertions.
- `PlanService.assertDatabaseQuota()` verifies database count within a project before allowing new database creation.
- `PlanService.assertDocumentWrite()` verifies document size and aggregated project database storage before writes.

---

## 5. Developer Contact Center & Support Threads

### 5.1 Decoupled Persistence
- Contact inquiries (`POST /api/v1/projects/:projectId/contact`) persist directly into `contact_inquiries` and `contact_messages`.
- Inquiries are never dropped if the outbound email provider is offline or rate-limited. Verified via `Contact Center — Decoupled Persistence During Email Shutdown`.

### 5.2 Threaded Support Replies
- Super Admins can reply to developer inquiries (`POST /api/v1/admin/contact/inquiries/:inquiryId/reply`).
- Replies update the inquiry timeline and emit email notifications via the outbox queue.
