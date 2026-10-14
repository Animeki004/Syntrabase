# Environment Variable Reference

This document provides the authoritative reference for all environment variables used across the Syntrabase platform.

---

## 1. Core Platform Configuration

| Variable | Required? | Default | Description |
| :--- | :--- | :--- | :--- |
| `NODE_ENV` | Yes | `production` | Runtime mode (`production` or `development`). |
| `PLATFORM_DOMAIN` | Yes | `example.com` | Base platform root domain. |
| `API_DOMAIN` | Yes (Coolify) | `api.yourdomain.com` | Public routing domain for Fastify API Gateway. |
| `CONSOLE_DOMAIN` | Yes (Coolify) | `console.yourdomain.com` | Public routing domain for Developer Console. |
| `ADMIN_DOMAIN` | Yes (Coolify) | `admin.yourdomain.com` | Public routing domain for Super Admin Console. |
| `PORT` | Optional | `4000` | Internal HTTP listening port for Fastify. |
| `HOST` | Optional | `0.0.0.0` | Internal listening interface. |

---

## 2. PostgreSQL Database (`data-net` Internal)

| Variable | Required? | Default | Description |
| :--- | :--- | :--- | :--- |
| `DATABASE_HOST` | Yes | `postgres` | Internal container hostname on `data-net`. |
| `DATABASE_PORT` | Optional | `5432` | Internal database port. |
| `DATABASE_NAME` | Yes | `syntrabase` | Name of the primary PostgreSQL database. |
| `DATABASE_USER` | Yes | `postgres` | Database administrator username. |
| `DATABASE_PASSWORD` | **Yes (Secret)**| - | Strong random password for PostgreSQL. |
| `DATABASE_SSL` | Optional | `false` | Whether to require SSL on internal Docker network. |
| `DATABASE_POOL_MIN`| Optional | `2` | Minimum active connections in pool. |
| `DATABASE_POOL_MAX`| Optional | `20` | Maximum connections allocated per instance. |

---

## 3. Cryptographic & JWT Signing Secrets

| Variable | Required? | Default | Description |
| :--- | :--- | :--- | :--- |
| `JWT_ACTIVE_KID` | Yes | `key_2026_v1` | Identifier for currently active JWT signing key. |
| `JWT_SECRET` | **Yes (Secret)**| - | 64-character hex string for signing HMAC-SHA256 JWTs. |
| `JWT_PREVIOUS_SECRETS` | Optional | `""` | Comma-separated list of retiring secrets for rotation. |
| `JWT_ACCESS_EXPIRES_IN` | Optional | `15m` | Lifetime of short-lived access tokens. |
| `JWT_REFRESH_EXPIRES_IN`| Optional | `7d` | Lifetime of rotating refresh tokens. |
| `PASSWORD_PEPPER` | **Yes (Secret)**| - | 32-character pepper applied to password hashes. |
| `AUDIT_HMAC_SECRET` | **Yes (Secret)**| - | 64-character secret for HMAC-SHA256 audit ledger chaining. |
| `AUDIT_LOG_FILE_PATH`| Optional | `/var/log/audit/tamper_evident.log` | Path for disk-based audit ledger mirror. |
| `CREDENTIALS_ENCRYPTION_KEY` | **Yes (Secret)**| - | 32-character hex key for AES-256-GCM email provider credential encryption. |

---

## 4. Rate Limiting & Storage Quotas

| Variable | Required? | Default | Description |
| :--- | :--- | :--- | :--- |
| `RATE_LIMIT_GLOBAL_MAX` | Optional | `100` | Max requests per minute per IP for general endpoints. |
| `RATE_LIMIT_AUTH_MAX` | Optional | `5` | Max login attempts per minute per IP. |
| `STORAGE_DRIVER` | Optional | `local` | Storage driver (`local` or `s3`). |
| `STORAGE_LOCAL_ROOT` | Optional | `/var/data/storage` | Container storage volume path. |
| `STORAGE_MAX_FILE_SIZE_BYTES` | Optional | `10485760` (10 MB) | Max allowed upload size per file. |
