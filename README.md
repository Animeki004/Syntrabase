<div align="center">

  <img src="./docs/assets/syntrabase-banner.jpg" alt="Syntrabase - Open-Source Firebase Alternative" width="100%" style="border-radius: 12px; max-width: 960px; margin-bottom: 20px;" />

  # Syntrabase

  <p>
    <strong>The Self-Hosted, Open-Source Multi-Tenant Firebase Alternative Built for Production</strong>
  </p>
  <p>
    PostgreSQL 16 JSONB • Fastify • Next.js 14 • Coolify • Docker • FIDO2 Passkeys • TOTP MFA • Zero Cloud Vendor Lock-In
  </p>

  <p>
    <a href="#-quickstart-coolify-1-click"><img src="https://img.shields.io/badge/Deploy-Coolify-6B46C1?style=for-the-badge&logo=docker&logoColor=white" alt="Deploy to Coolify" /></a>
    <a href="https://github.com/Animeki004/Syntrabase/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue?style=for-the-badge" alt="License" /></a>
    <a href="https://nodejs.org"><img src="https://img.shields.io/badge/Node.js-20.x-green?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js" /></a>
    <a href="https://www.postgresql.org"><img src="https://img.shields.io/badge/PostgreSQL-16%20JSONB-336791?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL" /></a>
    <a href="https://typescriptlang.org"><img src="https://img.shields.io/badge/TypeScript-5.6-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" /></a>
    <a href="#-security-and-cryptography"><img src="https://img.shields.io/badge/Security-Argon2id%20%7C%20WebAuthn-success?style=for-the-badge" alt="Security" /></a>
  </p>

  <p>
    <a href="#-why-syntrabase">Why Syntrabase</a> •
    <a href="#-key-features">Features</a> •
    <a href="#-repository-git-clone--quickstart-details">Git Clone & Setup</a> •
    <a href="#-architectural-topology">Architecture</a> •
    <a href="#-quickstart-coolify-1-click">Coolify Guide</a> •
    <a href="#-sdk-integration">SDK Setup</a> •
    <a href="#-security-and-cryptography">Security</a> •
    <a href="#-faq--google-indexing-guide">FAQ & SEO</a>
  </p>

  <hr style="border: 0; height: 1px; background-image: linear-gradient(to right, rgba(0, 0, 0, 0), rgba(99, 102, 241, 0.75), rgba(0, 0, 0, 0)); margin: 24px 0;" />

</div>

---

## 🌟 Why Syntrabase?

Google Firebase offers exceptional developer ergonomics, but brings **unpredictable bills**, proprietary API lock-in, and strict cloud quota ceilings. 

**Syntrabase** delivers the exact modular Firestore, Auth, Storage, and Realtime developer workflow you love, powered entirely by an authoritative **PostgreSQL 16 JSONB** foundation that you own, inspect, and host anywhere (Coolify, Hetzner, AWS, DigitalOcean, or private VPS).

<br />

| Feature Capability | Google Firebase | Syntrabase |
| :--- | :---: | :---: |
| **Hosting Freedom** | ❌ Google Cloud Only | ✅ **100% Self-Hosted (Coolify, Docker, Bare Metal)** |
| **Database Engine** | ⚠️ Proprietary NoSQL | ✅ **PostgreSQL 16 JSONB + GIN Indexing** |
| **Direct SQL Queries** | ❌ Impossible | ✅ **Full Direct PostgreSQL / DDL Access** |
| **Bill Predictability** | ❌ Uncapped Pay-Per-Read | ✅ **Fixed VPS Cost ($5/mo for 10M+ operations)** |
| **Outbound Email Engine** | ⚠️ Complex Cloud Functions | ✅ **Built-in Brevo HTTPS API + Custom DNS Management** |
| **Storage Security** | ⚠️ Opaque Rules | ✅ **HMAC-Signed URLs + Strict CSP & nosniff Protection** |
| **MFA & Passkeys** | ⚠️ Costly SMS / Cloud Add-ons | ✅ **Dynamic Visual QR Codes (TOTP) + FIDO2 WebAuthn** |
| **User Actions Control** | ⚠️ Limited Console Toggles | ✅ **Email Enumeration Defense + Sign-up Gating** |
| **Multi-Tenant Consoles** | ⚠️ Single Dashboard | ✅ **Developer Console (:3000) & Super Admin Command (:3001)** |
| **Audit Compliance** | ⚠️ Paid Cloud Logging | ✅ **Tamper-Evident Cryptographic HMAC Audit Ledger** |

---

## 🚀 Key Features

<table>
  <tr>
    <td width="50%" valign="top">
      <h3>⚡ PostgreSQL JSONB Document Engine</h3>
      <ul>
        <li><strong>ACID Document Store</strong>: High-throughput JSONB with GIN indexing (<code>jsonb_path_ops</code>).</li>
        <li><strong>Subcollections & Compounds</strong>: Native support for subcollection hierarchies and multi-field compound filters.</li>
        <li><strong>Interactive Transactions</strong>: <code>SELECT ... FOR UPDATE</code> with concurrency conflict detection and jittered backoff.</li>
        <li><strong>Server Transforms</strong>: <code>serverTimestamp</code>, <code>increment</code>, <code>arrayUnion</code>, <code>arrayRemove</code>, <code>deleteField</code>.</li>
      </ul>
    </td>
    <td width="50%" valign="top">
      <h3>🛡️ Declarative Security Rules</h3>
      <ul>
        <li><strong>AST Compilation</strong>: High-speed Abstract Syntax Tree evaluator supporting <code>request.auth</code> and <code>resource.data</code>.</li>
        <li><strong>Monaco Code Studio</strong>: In-browser editor with syntax highlighting, token simulation, and 1-click live publishing.</li>
        <li><strong>Version History</strong>: Snapshot versioning with instant rollback and cryptographic audit tracking.</li>
      </ul>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <h3>🔐 Multi-Factor Authentication & Passkeys</h3>
      <ul>
        <li><strong>TOTP with Visual QR Codes</strong>: Instant scannable QR code generation for Google Authenticator, 1Password, and Microsoft Authenticator.</li>
        <li><strong>FIDO2 WebAuthn Passkeys</strong>: Touch ID, Face ID, Windows Hello, and hardware security key biometric sign-in.</li>
        <li><strong>Passkey Login on Console</strong>: One-click passwordless login on the developer console (<code>/login</code>).</li>
        <li><strong>Recovery Codes</strong>: 8 single-use hashed backup codes for account emergency access.</li>
      </ul>
    </td>
    <td width="50%" valign="top">
      <h3>🛡️ User Actions Gating & Admin SDK Control</h3>
      <ul>
        <li><strong>Email Enumeration Protection</strong>: Identical response timing and payloads preventing attacker reconnaissance.</li>
        <li><strong>Self-Deletion & Sign-Up Gating</strong>: Granular toggles to disable public sign-ups or block user self-deletion.</li>
        <li><strong>Programmatic Admin SDK</strong>: Full server-side control via <code>admin.auth().setUserActions()</code> and <code>admin.auth().setMfaPolicy()</code>.</li>
        <li><strong>Per-User Factor Revocation</strong>: Inspect and revoke compromised factors or passkeys via privileged API.</li>
      </ul>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <h3>📬 Transactional Email Infrastructure</h3>
      <ul>
        <li><strong>Brevo HTTPS API Engine</strong>: Cloud-native port 443 dispatch (bypasses ISP port 25 blocking on Oracle/Hetzner).</li>
        <li><strong>Durable Outbox Queue</strong>: Concurrent processing with <code>FOR UPDATE SKIP LOCKED</code> and circuit breakers.</li>
        <li><strong>Custom Sender Domains</strong>: Full DKIM TXT, SPF TXT, MX records and 1-click Cloudflare DNS synchronization.</li>
        <li><strong>AES-256-GCM Vault</strong>: Hardware-accelerated encryption of email provider credentials.</li>
      </ul>
    </td>
    <td width="50%" valign="top">
      <h3>🗄️ Fortified Signed Storage</h3>
      <ul>
        <li><strong>Cryptographic Signed URLs</strong>: Expiring HMAC tokens with instant path traversal containment.</li>
        <li><strong>Defense-in-Depth Headers</strong>: Enforces <code>X-Content-Type-Options: nosniff</code> and <code>Content-Security-Policy: default-src 'none'</code>.</li>
        <li><strong>Plan Capacity Enforcement</strong>: Authoritative real-time storage quotas preventing rogue consumption.</li>
      </ul>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <h3>🎛️ Dual Production Consoles</h3>
      <ul>
        <li><strong>Developer Console (Port 3000)</strong>: Next.js 14 App Router, live database studio, storage explorer, and API key rotation.</li>
        <li><strong>Super Admin Center (Port 3001)</strong>: Multi-tenant fleet control, plan quotas, disaster recovery drills, and security posture.</li>
        <li><strong>Responsive 720p/768p Design</strong>: Fully optimized viewports for laptops and desktops without awkward vertical scrolling.</li>
      </ul>
    </td>
    <td width="50%" valign="top">
      <h3>📦 Modular SDK Ecosystem</h3>
      <ul>
        <li><strong>Client SDK (<code>@syntrabase/client-sdk</code>)</strong>: Drop-in modular Firebase v9/v10 syntax with tree-shaking and offline caching.</li>
        <li><strong>Admin SDK (<code>@syntrabase/admin-sdk</code>)</strong>: Privileged Node.js server SDK for backend microservices and automated jobs.</li>
        <li><strong>Test Bench Studio (Port 5000)</strong>: Visual in-browser interactive verification suite for SDK testing.</li>
      </ul>
    </td>
  </tr>
</table>

---

## 📥 Repository Git Clone & Quickstart Details

Follow these instructions to clone the repository and run Syntrabase locally or in CI/CD pipelines.

### System Requirements & Prerequisites

| Tool | Minimum Version | Recommended | Notes |
| :--- | :---: | :---: | :--- |
| **Node.js** | `>= 20.0.0` | `20.17.0+ LTS` | Required for Fastify API Gateway & Next.js 14 |
| **npm** | `>= 10.0.0` | `10.8.0+` | Monorepo workspaces require modern npm |
| **PostgreSQL** | `>= 16.0` | `PostgreSQL 16.x` | Native JSONB document store with GIN index support |
| **Git** | `>= 2.30` | `Git 2.40+` | Standard version control client |
| **Docker** (Optional) | `>= 24.0` | `Docker Compose v2` | For 1-click containerized deployment |

<br />

### 1. Clone the Repository

Choose the clone method that matches your environment:

#### Option A: Standard HTTPS Clone (Recommended for Developers)
```bash
git clone https://github.com/Animeki004/Syntrabase.git
cd Syntrabase
```

#### Option B: High-Speed Shallow Clone (Fastest for CI/CD & Deployments)
Downloads only the latest commit to save bandwidth and maximize download speed:
```bash
git clone --depth 1 https://github.com/Animeki004/Syntrabase.git
cd Syntrabase
```

#### Option C: SSH Clone (Recommended for Registered GitHub Keys)
```bash
git clone git@github.com:Animeki004/Syntrabase.git
cd Syntrabase
```

#### Option D: Clone Specific Branch
```bash
git clone -b main https://github.com/Animeki004/Syntrabase.git
cd Syntrabase
```

<br />

### 2. Install Monorepo Dependencies
Syntrabase uses native npm workspaces. A single command installs all dependencies across `apps/` and `packages/`:
```bash
npm install
```

<br />

### 3. Configure Environment Variables
Copy the pre-configured high-entropy environment template:
```bash
# On Linux / macOS
cp .env.example .env

# On Windows PowerShell
Copy-Item .env.example .env
```

Ensure your PostgreSQL connection credentials match your local or hosted database:
```ini
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/syntrabase
API_URL=http://localhost:4000
JWT_SECRET=pre_seeded_syntrabase_master_jwt_secret_must_be_minimum_64_bytes_secure
PASSWORD_PEPPER=pre_seeded_32_bytes_argon2id_pepper
CREDENTIALS_ENCRYPTION_KEY=pre_seeded_32_bytes_aes256gcm_vault_key
AUDIT_HMAC_SECRET=pre_seeded_audit_ledger_hmac_sha256_integrity_key
```

<br />

### 4. Run Database Schema Migrations
Execute all 14 authoritative PostgreSQL DDL migrations (creates document store, outbox queue, audit ledger, WebAuthn tables, and indexes):
```bash
npm run db:migrate
```

<br />

### 5. Build Workspace Packages
Compile TypeScript across all shared packages and Next.js applications:
```bash
npm run build
```

<br />

### 6. Start the Production Cluster
Launch the API Gateway, Developer Console, and Super Admin Command Center concurrently:
```bash
npm start
```

Or run development mode with live reloading:
```bash
npm run dev:api       # Fastify REST & WebSocket API Gateway (Port 4000)
npm run dev:console   # Developer Console (Port 3000)
npm run dev:admin     # Super Admin Command Center (Port 3001)
```

<br />

### 7. Run Full Automated Test Suite
Syntrabase includes 114+ automated tests covering security boundaries, user actions, MFA replay protection, and WebAuthn standards:
```bash
npm test
```

---

## 🏗️ Architectural Topology

```mermaid
flowchart TD
    subgraph Edge ["🌐 Public Traffic (Internet / CDN / Clients)"]
        User["Client Browser / Mobile App (SDK)"]
        Dev["Developer Console (Port 3000)"]
        Admin["Super Admin Console (Port 3001)"]
    end

    subgraph Proxy ["🛡️ Edge Routing (Traefik / Coolify / Caddy)"]
        EdgeProxy["SSL/TLS 1.3 Termination & Domain Router"]
    end

    subgraph Core ["⚡ Syntrabase Platform Core"]
        FastifyAPI["Fastify API Gateway (Port 4000)"]
        Realtime["WebSocket Event Engine"]
        RulesAST["Security Rules Evaluator"]
        StorageEngine["Signed Storage Provider"]
        EmailOutbox["Durable Brevo Email Outbox"]
        AuthMFA["MFA & WebAuthn Passkeys Engine"]
    end

    subgraph Data ["🔒 Internal Isolated Network (data-net)"]
        Postgres[("PostgreSQL 16 JSONB\n- Document Store\n- Outbox Queue\n- Audit Ledger\n- Auth & Passkey Engine")]
        StorageVol[("Persistent Volume\n/var/data/storage")]
    end

    User -->|api.domain.com| EdgeProxy
    Dev -->|console.domain.com| EdgeProxy
    Admin -->|admin.domain.com| EdgeProxy

    EdgeProxy -->|HTTP / WS| FastifyAPI
    FastifyAPI --> RulesAST
    FastifyAPI --> StorageEngine
    FastifyAPI --> EmailOutbox
    FastifyAPI --> Realtime
    FastifyAPI --> AuthMFA

    Realtime <-->|NOTIFY / LISTEN| Postgres
    EmailOutbox -->|FOR UPDATE SKIP LOCKED| Postgres
    StorageEngine --> StorageVol
    FastifyAPI <-->|Connection Pool| Postgres
```

---

## 📁 Repository Structure

```text
syntrabase/
├── apps/
│   ├── api/                   # Fastify HTTP REST & WebSocket Gateway (:4000)
│   ├── console/               # Developer Console — Next.js 14 App Router (:3000)
│   └── super-admin/           # Super Admin Command Center — Next.js 14 (:3001)
├── packages/
│   ├── client-sdk/            # Modular Firebase v9/v10 Client SDK (@syntrabase/client-sdk)
│   ├── admin-sdk/             # Node.js Privileged Server Admin SDK (@syntrabase/admin-sdk)
│   ├── rules-engine/          # AST Security Rules Compiler & Evaluator
│   ├── schemas/               # Shared Zod validation schemas
│   └── shared-types/          # Universal TypeScript interfaces
├── infrastructure/
│   ├── database/migrations/  # PostgreSQL DDL migrations (001 - 014)
│   ├── docker/                # Multi-stage production Dockerfiles
│   └── caddy/                 # Production Caddyfile configuration
├── scripts/
│   └── start-production.js    # Production cluster launcher (API + Consoles)
├── docs/                      # Comprehensive platform architecture & operational runbooks
├── docker-compose.yml         # Coolify & production Docker topology
└── .env.example               # Pre-seeded cryptographic environment template
```

---

## 🚀 Quickstart: Coolify 1-Click Deployment

Syntrabase is designed natively for zero-friction deployment on [Coolify](https://coolify.io).

### 1. Configure DNS Records
At your domain registrar (e.g. Cloudflare, Namecheap), point 3 A-records to your VPS IP:
* `api.yourdomain.com` $\rightarrow$ `YOUR_VPS_IP`
* `console.yourdomain.com` $\rightarrow$ `YOUR_VPS_IP`
* `admin.yourdomain.com` $\rightarrow$ `YOUR_VPS_IP`

### 2. Deploy in Coolify
1. In your Coolify dashboard, click **+ Add Resource** $\rightarrow$ **Docker Compose**.
2. Select your repository (`https://github.com/Animeki004/Syntrabase`), branch `main`.
3. Set **Docker Compose Location** to `/docker-compose.yaml` (or `/docker-compose.yml`).
4. In the **Environment Variables** tab, configure your domain names and secrets (or copy pre-seeded high-entropy keys from [`.env.example`](./.env.example)):
   ```ini
   NODE_ENV=production
   PLATFORM_DOMAIN=yourdomain.com

   # Coolify Traefik Routing Domains
   API_DOMAIN=api.yourdomain.com
   CONSOLE_DOMAIN=console.yourdomain.com
   ADMIN_DOMAIN=admin.yourdomain.com

   # PostgreSQL Database Credentials
   DATABASE_NAME=syntrabase
   DATABASE_USER=postgres
   DATABASE_PASSWORD=your_secure_postgres_password_here

   # Cryptographic Authentication & Security Keys
   JWT_SECRET=your_jwt_secret_key_minimum_64_characters_long
   PASSWORD_PEPPER=your_password_pepper_32_characters_long
   CREDENTIALS_ENCRYPTION_KEY=your_credentials_encryption_key_32b
   AUDIT_HMAC_SECRET=your_audit_hmac_secret_sha256_key_here

   # Platform Super Admin Initial Credentials
   PLATFORM_ADMIN_EMAIL=admin@yourdomain.com
   PLATFORM_ADMIN_PASSWORD=your_super_admin_secure_password_here
   ```
5. Click **Deploy**. Coolify will automatically create persistent volumes, run migrations, compile production images, and provision SSL certificates via Traefik.

---

## 💻 Local Production Launch

You can run the entire production cluster locally without Docker:

```bash
# 1. Clone the repository
git clone https://github.com/Animeki004/Syntrabase.git
cd Syntrabase

# 2. Install dependencies
npm install

# 3. Build optimized bundles across all workspaces
npm run build

# 4. Start the production cluster directly
npm start
```

```text
========================================================
  SYNTRABASE PRODUCTION CLUSTER LAUNCHER
========================================================

Starting API GATEWAY (Production) on port 4000...
Starting CONSOLE (Production) on port 3000...
Starting SUPER ADMIN (Production) on port 3001...
[API GATEWAY] Server listening on http://0.0.0.0:4000
[CONSOLE]  ✓ Ready in 800ms
[SUPER ADMIN]  ✓ Ready in 780ms
```

---

## 📦 SDK Integration

Syntrabase provides modular client and server SDKs that mirror Firebase v9/v10:

### Client SDK (`@syntrabase/client-sdk`)

```typescript
import { initializeApp } from '@syntrabase/client-sdk';
import { getAuth, signInWithEmailAndPassword, enrollTotp, verifyAndActivateTotp } from '@syntrabase/client-sdk/auth';
import { getFirestore, collection, doc, setDoc, getDoc } from '@syntrabase/client-sdk/firestore';

const app = initializeApp({
  apiKey: "pk_live_default_key_syntrabase_2026",
  projectId: "default-project",
  apiBaseUrl: "https://api.yourdomain.com",
});

// Authenticate User
const auth = getAuth(app);
await signInWithEmailAndPassword(auth, "developer@example.com", "SecretPass123!");

// Enroll in Multi-Factor Authentication (Visual Scannable QR Code)
const { secret, otpauthUrl, qrCodeUrl, backupCodes } = await enrollTotp(auth);

// Render qrCodeUrl in your React/Vue/HTML frontend:
// <img src={qrCodeUrl} alt="Scan QR Code in Authenticator" />

// Activate factor with 6-digit confirmation code
await verifyAndActivateTotp(auth, "123456");

// Firestore-compatible JSONB document write
const db = getFirestore(app);
await setDoc(doc(db, "projects", "proj_alpha"), {
  title: "Syntrabase Engine",
  tier: "enterprise",
  active: true,
  createdAt: new Date().toISOString(),
});
```

### Admin SDK (`@syntrabase/admin-sdk`)

The privileged Node.js server SDK provides full programmatic control over documents, authentication policies, user actions, and MFA:

```typescript
import { initializeAdminApp } from '@syntrabase/admin-sdk';
import { getAdminFirestore } from '@syntrabase/admin-sdk/firestore';
import { getAdminAuth } from '@syntrabase/admin-sdk/auth';

const adminApp = initializeAdminApp({
  projectId: "default-project",
  serviceAccountKey: "sk_live_syntrabase_secret_master_key",
  apiBaseUrl: "https://api.yourdomain.com",
});

const adminAuth = getAdminAuth(adminApp);

// 1. Programmatic User Actions Control
await adminAuth.setUserActions({
  emailEnumerationProtection: true, // Thwarts user discovery timing attacks
  enableCreate: true,               // Allows or blocks public user sign-ups
  enableDelete: false,              // Blocks users from self-deleting accounts
});

// 2. Programmatic MFA Policy Enforcement
await adminAuth.setMfaPolicy({
  state: 'enforced',                // 'disabled' | 'optional' | 'enforced'
  enforceAllUsers: true,
  allowedFactors: ['totp', 'passkey'],
});

// 3. User MFA Factor & Passkey Management
const userMfa = await adminAuth.getUserMfa("user_123");
console.log("Enrolled factors:", userMfa.factors);

// Revoke a specific MFA factor administratively
if (userMfa.factors.length > 0) {
  await adminAuth.unenrollUserMfa("user_123", userMfa.factors[0].id);
}

// List and revoke user WebAuthn Passkeys
const passkeys = await adminAuth.listUserPasskeys("user_123");
if (passkeys.length > 0) {
  await adminAuth.deleteUserPasskey("user_123", passkeys[0].id);
}

// 4. Firestore Operations Bypassing Security Rules
const adminDb = getAdminFirestore(adminApp);
await adminDb.collection("audit_reports").add({
  type: "DAILY_SNAPSHOT",
  verified: true,
});
```

---

## 🔒 Security and Cryptography

* **Multi-Layered Password Hashing**: Passwords undergo salted `scrypt` and `Argon2id` key derivation combined with a server-side 256-bit `PASSWORD_PEPPER`.
* **Zero-Trust Super Admin Authorization**: Every privileged operation enforces real-time database lookup against the `platform_admins` table; static JWT claims are never trusted blindly.
* **FIDO2 WebAuthn Passkeys**: Standards-compliant WebAuthn integration with discoverable credentials, user verification (`required`), and challenge replay prevention.
* **RFC 6238 TOTP with Visual QR Code**: Time-based one-time password generation compatible with Google Authenticator, 1Password, and Microsoft Authenticator with 8 hashed single-use recovery codes.
* **Tamper-Evident Audit Ledger**: Every administrative change creates an immutable row verified with HMAC-SHA256 chaining.
* **Storage Path Containment**: Storage downloads enforce strict root boundary containment checks to eliminate directory traversal attacks (`../`).
* **Content Security Policy**: Download endpoints force `default-src 'none'`, `X-Content-Type-Options: nosniff`, and `X-Frame-Options: DENY`.

---

## ❓ FAQ & Google Indexing Guide

### What is Syntrabase?
Syntrabase is an open-source, self-hosted alternative to Google Firebase and Supabase. It provides Firestore-compatible JSONB document storage, real-time WebSockets, modular client SDKs (Firebase v9/v10 syntax), a transactional Brevo email engine, signed cloud storage, multi-factor authentication (MFA with QR codes), and FIDO2 Passkeys—all running on an authoritative PostgreSQL 16 foundation.

### Can I migrate from Google Firebase to Syntrabase without rewriting my frontend?
Yes! The Syntrabase Client SDK (`@syntrabase/client-sdk`) is designed as a drop-in replacement for the modular Firebase v9/v10 JavaScript SDK. Function signatures (`getFirestore`, `doc`, `setDoc`, `getDoc`, `collection`, `query`, `where`, `onSnapshot`, `getAuth`, `signInWithEmailAndPassword`) mirror Firebase, allowing developers to switch backend providers by simply updating import statements.

### How does Syntrabase handle Multi-Factor Authentication (MFA)?
Syntrabase supports dual MFA mechanisms:
1. **RFC 6238 TOTP**: Enrolls authenticator apps (Google Authenticator, Microsoft Authenticator, 1Password) by providing both an `otpauth://` URI and an immediately scannable visual Base64 PNG QR code, paired with 8 hashed backup recovery codes.
2. **FIDO2 WebAuthn Passkeys**: Biometric authentication via Apple Touch ID/Face ID, Windows Hello, and hardware security keys (YubiKey). Developers can also sign in passwordlessly directly from the Developer Console login screen.

### How do I deploy Syntrabase to Coolify?
Syntrabase includes a production-ready `docker-compose.yaml` optimized for Coolify. Connect your Git repository (`https://github.com/Animeki004/Syntrabase`), configure your domain routing environment variables (`API_DOMAIN`, `CONSOLE_DOMAIN`, `ADMIN_DOMAIN`), and click Deploy. Coolify and Traefik handle automatic SSL/TLS certificate provisioning and container orchestration.

---

## 📜 License

Distributed under the **MIT License**. See [`LICENSE`](./LICENSE) for full details.

<div align="center">
  <br />
  <p>
    Built with ❤️ by <strong><a href="https://github.com/Animeki004">Mr. Developer</a></strong>
  </p>
  <p>
    <sub>Keywords: self-hosted firebase alternative, open source firebase, postgresql jsonb baas, firebase v9 sdk replacement, backend as a service, supabase alternative, firestore self hosted, coolify 1-click deployment, docker compose firebase, webauthn passkeys, totp mfa qr code, brevo email gateway, argon2id password hashing</sub>
  </p>
</div>
