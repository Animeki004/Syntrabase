# Syntrabase — Coolify VPS Deployment Guide

This guide details the exact procedure for deploying the **Syntrabase** platform onto an existing **Coolify VPS** instance without disrupting existing services, port conflicts, or host network settings.

---

## 1. Coolify Architecture Compatibility

In Coolify, Traefik acts as the centralized edge proxy binding directly to host ports `80` and `443`.
The Syntrabase platform is configured to integrate natively with Coolify:
- **Zero Host Port Clashes:** The platform's [docker-compose.yml](../../infrastructure/docker/docker-compose.yml) publishes **no host ports** (`80`, `443`, `4000`, `3000`, `3001`, `5432` are never mapped directly to the VPS host).
- **Coolify Proxy Routing:** Services join the external `coolify` Docker network and expose declarative Traefik labels for automatic Let's Encrypt TLS termination and WebSocket forwarding.
- **Database Isolation:** PostgreSQL 16 resides strictly on an internal bridge network (`data-net` with `internal: true`), completely unreachable from the internet and the Coolify proxy.
- **Database Initialization:** Forward migrations (`001_initial_schema.sql`, `002_plans_and_limits.sql`, `003_syntrabase_core_features.sql`) execute automatically in order upon first volume creation. Rollback scripts are safely stored in `migrations/rollbacks/` to prevent unintended rollbacks.

---

## 2. Pre-Deployment Prerequisites

1. An operational Coolify instance on your Ubuntu VPS.
2. Three DNS A-records pointed to your VPS public IP:
   - `api.yourdomain.com` $\rightarrow$ Fastify API Gateway & WebSocket Outbox
   - `console.yourdomain.com` $\rightarrow$ Developer Console (Next.js 14)
   - `admin.yourdomain.com` $\rightarrow$ Super Admin Center (Next.js 14)
3. The `coolify` Docker network running on the host (created by Coolify by default).

---

## 3. Step-by-Step Deployment in Coolify

### Step 1: Create a New Project / Resource
1. Open your **Coolify Dashboard**.
2. Navigate to **Projects** $\rightarrow$ Select your Project $\rightarrow$ **Production Environment**.
3. Click **+ Add Resource** $\rightarrow$ Select **Docker Compose**.

### Step 2: Configure Repository & Compose Path
1. Connect your Git repository (`main` branch) or paste the contents of `infrastructure/docker/docker-compose.yml`.
2. Ensure the base directory is set to repository root (`.`).
3. Set Compose file path to: `infrastructure/docker/docker-compose.yml`.

### Step 3: Populate Environment Variables
In the Coolify **Environment Variables** tab, define the required production parameters:

```ini
NODE_ENV=production
PLATFORM_DOMAIN=yourdomain.com

# Coolify Domain Routing
API_DOMAIN=api.yourdomain.com
CONSOLE_DOMAIN=console.yourdomain.com
ADMIN_DOMAIN=admin.yourdomain.com

# PostgreSQL Database (Internal credentials)
DATABASE_NAME=syntrabase
DATABASE_USER=postgres
DATABASE_PASSWORD=GENERATE_STRONG_RANDOM_PASSWORD_64_CHARS

# JWT & Cryptographic Signing Keys (Generate with openssl rand -hex 32)
JWT_ACTIVE_KID=key_2026_prod_v1
JWT_SECRET=GENERATE_64_CHAR_HEX_SECRET
PASSWORD_PEPPER=GENERATE_32_CHAR_HEX_PEPPER
AUDIT_HMAC_SECRET=GENERATE_64_CHAR_HEX_AUDIT_SECRET
AUDIT_LOG_FILE_PATH=/var/log/audit/tamper_evident.log

# AES-256-GCM Email Provider Encryption Key (Generate with openssl rand -hex 16)
CREDENTIALS_ENCRYPTION_KEY=GENERATE_32_CHAR_HEX_KEY

# Initial Super Admin Bootstrap
PLATFORM_ADMIN_EMAIL=admin@yourdomain.com
PLATFORM_ADMIN_PASSWORD=GENERATE_MIN_16_CHAR_ADMIN_PASSWORD
```

### Step 4: Deploy & Verify
1. Click **Deploy**.
2. Coolify will:
   - Pull PostgreSQL 16 image and run initial schema migrations (`001`, `002`, `003`).
   - Build `syntrabase-api`, `syntrabase-console`, and `syntrabase-super-admin` Docker images via multi-stage builds.
   - Connect all services to the `coolify` network.
   - Issue Let's Encrypt SSL/TLS certificates automatically via Traefik.
3. Verify status:
   - Check container health: `api` runs `/health` checks every 15s.
   - Check logs: `docker logs syntrabase-api` confirms:
     `[API GATEWAY] Server listening on http://0.0.0.0:4000`

---

## 4. Verification Checklist

- [ ] Visit `https://api.yourdomain.com/health` $\implies$ Returns `{"status":"ok"}`.
- [ ] Visit `https://console.yourdomain.com` $\implies$ Developer Console renders with full project settings, email provider, and database tools.
- [ ] Visit `https://admin.yourdomain.com` $\implies$ Super Admin Command Center renders with Plan & Limit governance.
- [ ] Run `docker ps` on the VPS host $\implies$ Confirm **no host ports are published** directly by the Syntrabase containers (routed 100% via Traefik).
