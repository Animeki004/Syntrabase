# Syntrabase — Master Documentation Index

Welcome to the central documentation index for **Syntrabase**, the high-performance, developer-friendly, self-hosted alternative to Firebase.

This documentation directory contains all architectural decisions, deployment guides, security runbooks, API & SDK references, test strategies, and audit reports for the Syntrabase platform.

---

## 🗺️ Documentation Directory Map

```
docs/
├── README.md                              <- Master documentation index (this file)
├── API_REFERENCE.md                       <- Full HTTP REST and WebSocket API Reference
├── SDK_REFERENCE.md                       <- Client SDK (@syntrabase/client-sdk) & Admin SDK (@syntrabase/admin-sdk) Reference
├── TEST_STRATEGY.md                       <- Test suite architecture (50/50 tests: unit, integration, security)
│
├── deployment/                            <- Production & Hosting Guides
│   ├── COOLIFY_DEPLOYMENT_GUIDE.md        <- Step-by-step Coolify VPS deployment & Traefik routing
│   ├── ENV_REFERENCE.md                   <- Authoritative reference for all environment variables & secrets
│   ├── ROLLBACK_PROCEDURE.md              <- Zero-downtime rollback runbooks & schema downgrades
│   └── STAGING_VERIFICATION_REPORT.md     <- Staging deployment checks, port scans, and validation logs
│
├── implementation/                        <- Architecture & Engineering Records
│   ├── ARCHITECTURE_DECISIONS.md          <- Key Architectural Decision Records (ADRs)
│   ├── AUDIT_RELEASE_REPORT.md            <- Comprehensive platform release audit & compliance sign-off
│   ├── IMPLEMENTATION_TRACKER.md          <- Status tracker for all 10 core phases & feature matrices
│   ├── KNOWN_GAPS.md                      <- Firebase vs Syntrabase feature parity & compatibility matrix
│   └── REPOSITORY_AUDIT.md                <- Initial code inspection & structural audit
│
└── security/                              <- Security Operations & Hardening
    ├── SECURITY_RUNBOOK.md                <- SOC operations, key rotation, incident response runbook
    └── threat-model.md                    <- Zero-Trust threat model, STRIDE analysis, defense layers
```

---

## 📚 Section Breakdown

### 1. Developer Guides & API Specifications
- [API Reference](./API_REFERENCE.md): Comprehensive documentation of all Fastify endpoints including Auth, Documents, Transactions, Field Transforms, Collection Groups, Webhooks, Storage, and Super Admin fleet APIs.
- [SDK Reference](./SDK_REFERENCE.md): Modular Firebase v9/v10 compatible Client SDK and Node.js Admin SDK reference with working TypeScript examples.
- [Test Strategy](./TEST_STRATEGY.md): Adversarial test suite, isolated database restore verification, and client bundle zero-secret leak tests.

### 2. Deployment & Operations
- [Coolify VPS Deployment Guide](./deployment/COOLIFY_DEPLOYMENT_GUIDE.md): Complete setup for Coolify PaaS, Docker Compose integration, Traefik TLS termination, and health checks.
- [Environment Variable Reference](./deployment/ENV_REFERENCE.md): Full listing of production secrets, database parameters, encryption keys, and rate limits.
- [Rollback Procedures](./deployment/ROLLBACK_PROCEDURE.md): Standard operating procedures for rolling back containers, schema migrations, and configuration changes.
- [Staging Verification Report](./deployment/STAGING_VERIFICATION_REPORT.md): Audit logs verifying port isolation, memory budgets, and functional correctness.

### 3. Architecture & Implementation
- [Architecture Decisions (ADR)](./implementation/ARCHITECTURE_DECISIONS.md): Justifications for PostgreSQL JSONB, Durable Outbox, Fastify, Next.js, and AES-256-GCM encryption.
- [Implementation Tracker](./implementation/IMPLEMENTATION_TRACKER.md): Phase-by-phase completion matrix (Phases 1 through 9 + Phase 10 verification).
- [Audit & Release Report](./implementation/AUDIT_RELEASE_REPORT.md): Final system verification confirming all 50/50 test suites pass.
- [Known Gaps & Feature Parity](./implementation/KNOWN_GAPS.md): Firebase vs Syntrabase feature comparison matrix.

### 4. Security & Threat Modeling
- [Security Runbook](./security/SECURITY_RUNBOOK.md): Procedures for JWT secret rotation, credential compromise response, and SOC Level 0–4 incident management.
- [Threat Model & STRIDE Analysis](./security/threat-model.md): Detailed threat modeling covering cross-project isolation, timing attacks, SSRF prevention, and cryptographic audit chains.
