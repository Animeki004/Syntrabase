# Syntrabase Attack Surface & Boundary Map

**Framework:** SUPREME CORE Universal Security and Engineering Assessment Engine  
**Version:** 1.0  
**Repository:** `Animeki004/Syntrabase`  
**Classification:** Internal & External Attack Surface Matrix  

---

## 1. Network & Trust Boundaries

The system enforces six explicit trust boundaries:

```
[ Public Internet / Untrusted Clients ]
                 │ (HTTPS / WSS)
                 ▼
┌────────────────────────────────────────────────────────┐
│ Traefik / Caddy Reverse Proxy & Edge Rate Limiter     │
│ [Boundary 1: Anonymous vs Edge Gate]                   │
└────────┬──────────────────────────────────────┬────────┘
         │                                      │
         ▼                                      ▼
┌─────────────────────────┐          ┌─────────────────────────┐
│ Next.js Web Consoles    │          │ Fastify Core API Engine │
│ (Console & Super Admin) │          │ (Port 3001)             │
│ [Boundary 2: UI Context]│          │ [Boundary 3: Auth & RBAC│
└─────────────────────────┘          └───────────┬─────────────┘
                                                 │
                   ┌─────────────────────────────┼─────────────────────────────┐
                   │ (SQL parameterized)         │ (Signed Tokens / Local FS)  │ (HTTP Webhooks)
                   ▼                             ▼                             ▼
      ┌─────────────────────────┐   ┌─────────────────────────┐   ┌─────────────────────────┐
      │ PostgreSQL Database     │   │ Object Storage          │   │ External Integrations   │
      │ [Boundary 4: SQL Store] │   │ [Boundary 5: File Store]│   │ [Boundary 6: Webhooks]  │
      └─────────────────────────┘   └─────────────────────────┘   └─────────────────────────┘
```

---

## 2. API Endpoint Surface Matrix

### 2.1 Public & Authentication Endpoints
| HTTP Method | Route | Authentication | Rate Limited | Function / Asset Protected |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/auth/developer/register` | None (Public) | Yes (IP & email) | Developer account creation |
| `POST` | `/api/v1/auth/developer/login` | None (Credentials) | Yes (Brute-force) | Developer authentication |
| `POST` | `/api/v1/auth/developer/forgot-password` | None (Public) | Yes (Rate limiter) | Developer password reset email dispatch |
| `POST` | `/api/v1/auth/developer/reset-password` | Action Token | Yes | Developer password reset execution |
| `POST` | `/api/v1/auth/refresh` | Refresh Token | Family Tracking | Access token renewal with reuse detection |
| `POST` | `/api/v1/auth/revoke` | Refresh Token | Session scoped | Explicit session invalidation |
| `POST` | `/api/v1/projects/:id/auth/register` | Project Context | Quota & Policy | End-user account registration |
| `POST` | `/api/v1/projects/:id/auth/login` | Project Context | Policy | End-user login |
| `POST` | `/api/v1/projects/:id/auth/anonymous` | Provider Enabled | Quota | Anonymous guest user session generation |
| `POST` | `/api/v1/projects/:id/auth/verify-email`| Action Token | Single-use | End-user email verification |
| `POST` | `/api/v1/projects/:id/auth/forgot-password` | Constant-Time | Rate limited | End-user password reset dispatch |
| `POST` | `/api/v1/projects/:id/auth/reset-password` | Action Token | Single-use | End-user password reset execution |

### 2.2 Document Database & Rules Engine
| HTTP Method | Route | Authorization Required | Verification Control |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/projects/:id/databases/:db/collections` | Developer / Project Member | `AuthService.requireProjectAccess` (`SYN-P3-003`) |
| `GET` | `/api/v1/projects/:id/databases/:db/collections/:col/documents` | Developer / Project Member | `AuthService.requireProjectAccess` (`SYN-P3-002`) |
| `DELETE` | `/api/v1/projects/:id/databases/:db/collections/:col` | Developer / Project Member | `AuthService.requireProjectAccess` (`SYN-P3-001`) |
| `GET` | `/api/v1/projects/:id/databases/:db/collectionGroups/:col` | Security Rules Evaluated | `checkPermission(..., 'list')` (`SYN-P3-004`) |
| `GET` | `/api/v1/projects/:id/databases/:db/documents/:col/:doc` | Security Rules Evaluated | `checkPermission(..., 'get')` |
| `POST` | `/api/v1/projects/:id/databases/:db/documents/:col/:doc` | Security Rules & Quotas | `PlanService.assertDocumentWrite` & Prototype Guard |
| `PATCH` | `/api/v1/projects/:id/databases/:db/documents/:col/:doc` | Security Rules & Quotas | `PlanService.assertDocumentWrite` |
| `DELETE` | `/api/v1/projects/:id/databases/:db/documents/:col/:doc` | Security Rules Evaluated | `checkPermission(..., 'delete')` |
| `POST` | `/api/v1/projects/:id/databases/:db/batch` | Security Rules on every op | `PlanService.assertDocumentWrite` |
| `POST` | `/api/v1/projects/:id/databases/:db/transaction` | Security Rules & Version check | Optimistic concurrency & transaction rollback |
| `POST` | `/api/v1/projects/:id/rules/publish` | Developer / Project Member | `AuthService.requireProjectAccess` & AST verification |
| `POST` | `/api/v1/projects/:id/rules/simulate` | Developer / Project Member | `AuthService.requireProjectAccess` & 100KB payload cap |

### 2.3 Storage & File Operations
| HTTP Method | Route | Authorization Required | Verification Control |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/storage/:id/upload` | Project Member / Plan Check | `PlanService.assertStorageUpload` & MIME validation |
| `POST` | `/api/v1/storage/:id/signed-upload-url` | Project Member | `PlanService.assertStorageUpload` & HMAC token generation |
| `POST` | `/api/v1/storage/:id/signed-url` | Project Member | `PlanService.assertCapability` |
| `GET` | `/api/v1/storage/download` | Signed HMAC Token | Path traversal check, `nosniff`, `CSP: default-src 'none'` |
| `GET` | `/api/v1/storage/:id/objects` | Project Member | Project scoped list query |
| `DELETE` | `/api/v1/storage/:id/objects/:objectId` | Project Member | Storage unlinking & disk purge |

### 2.4 Realtime Gateway
| Protocol | Route | Authentication Flow | Isolation Enforced |
| :--- | :--- | :--- | :--- |
| `WSS` | `/ws/realtime` | Token-First Auth Frame (`msg.type: 'auth'`) | Client restricted to subscriptions matching token `projectId` |

### 2.5 Super Admin & Governance
| HTTP Method | Route | Authorization Required | Verification Control |
| :--- | :--- | :--- | :--- |
| `ALL` | `/api/v1/admin/*` | Verified Platform Admin | Direct query against `platform_admins` DB table |
| `POST` | `/api/v1/admin/developers/:id/status` | Super Admin | Suspend / activate developer accounts |
| `POST` | `/api/v1/admin/projects/:id/suspend` | Super Admin | Tenant suspension and session revocation |
| `GET` | `/api/v1/admin/health` | Super Admin | Real database latency, memory, and pool metrics |
| `POST` | `/api/v1/admin/backups/restore-drill` | Super Admin | Database backup restoration drill |

---

## 3. Data Flow & State Lifecycle

1. **Client Ingress:** Requests enter Fastify via HTTPS/WSS.
2. **Identity Verification:** Validated via `AuthService.verifyAccessToken` (ed25519/HMAC-SHA256 signature, expiry, and revoked-at checks).
3. **Tenant Context Resolution:** Project ID slug resolved to UUID; environment ID defaulted or header-specified.
4. **Authorization Decisions:**
   - Client Apps: Evaluated against compiled security rules AST (`packages/rules-engine`).
   - Developers: Evaluated against developer membership in `project_developers`.
   - Super Admins: Evaluated against server-side `platform_admins` records.
5. **Business Execution & Quota:** Checked against `PlanService` before executing writes.
6. **Persistence:** Parameterized queries to PostgreSQL `documents` and `storage_objects` tables with durable transactional outbox events.
7. **Audit Trail:** Asynchronously dispatched to `AuditService.log` with tamper-evident HMAC chaining.
