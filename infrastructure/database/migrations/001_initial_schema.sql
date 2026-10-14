-- =============================================================================
-- FIRESTORE PLATFORM: COMPREHENSIVE INITIAL SCHEMA MIGRATION
-- Authoritative Database: PostgreSQL 16+
-- Modules: Tenancy, Auth, Document Store (JSONB + GIN), Durable Outbox,
--          Cryptographic Audit Ledger, Rules, Storage, Quotas, SOC Events.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------------------------------------
-- 1. DEVELOPER ACCOUNTS & PLATFORM OPERATORS
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS developers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  display_name VARCHAR(100),
  email_verified BOOLEAN DEFAULT FALSE,
  is_platform_admin BOOLEAN DEFAULT FALSE,
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Server-side verified platform admins table (prevents reliance on static JWT claims)
CREATE TABLE IF NOT EXISTS platform_admins (
  developer_id UUID PRIMARY KEY REFERENCES developers(id) ON DELETE CASCADE,
  granted_by UUID REFERENCES developers(id),
  mfa_enabled BOOLEAN DEFAULT FALSE,
  mfa_secret VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 2. ORGANIZATIONS, WORKSPACES & PROJECTS
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  owner_id UUID REFERENCES developers(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS organization_members (
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  developer_id UUID REFERENCES developers(id) ON DELETE CASCADE,
  role VARCHAR(20) DEFAULT 'developer',
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (organization_id, developer_id)
);

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(100) NOT NULL,
  status VARCHAR(20) DEFAULT 'active', -- active, suspended, archived
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (organization_id, slug)
);

CREATE TABLE IF NOT EXISTS environments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  name VARCHAR(50) NOT NULL,
  slug VARCHAR(50) NOT NULL,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (project_id, slug)
);

-- -----------------------------------------------------------------------------
-- 3. APPLICATION USERS & SESSIONS (ISOLATED PER PROJECT & ENVIRONMENT)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  environment_id UUID REFERENCES environments(id) ON DELETE CASCADE,
  email VARCHAR(255),
  password_hash VARCHAR(255),
  display_name VARCHAR(100),
  photo_url TEXT,
  email_verified BOOLEAN DEFAULT FALSE,
  disabled BOOLEAN DEFAULT FALSE,
  custom_claims JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (project_id, environment_id, email)
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES app_users(id) ON DELETE CASCADE,
  refresh_token_hash VARCHAR(255) NOT NULL,
  family_id UUID DEFAULT gen_random_uuid(),
  user_agent TEXT,
  ip_address VARCHAR(45),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id ON auth_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_refresh_token_hash ON auth_sessions(refresh_token_hash);

-- -----------------------------------------------------------------------------
-- 4. API CREDENTIALS & KEY LIFECYCLE (PUBLISHABLE VS HASHED SECRETS)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS api_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  environment_id UUID REFERENCES environments(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  type VARCHAR(20) NOT NULL, -- 'publishable' or 'secret'
  key_prefix VARCHAR(20) NOT NULL, -- 'pk_live_' or 'sk_live_'
  key_identifier VARCHAR(64) UNIQUE NOT NULL,
  hashed_secret VARCHAR(255), -- ONLY stored as Argon2id/SHA-256 hash for secret keys
  allowed_origins TEXT[] DEFAULT '{}',
  scopes TEXT[] DEFAULT '{"read", "write"}',
  revoked BOOLEAN DEFAULT FALSE,
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_credentials_identifier ON api_credentials(key_identifier);

-- -----------------------------------------------------------------------------
-- 5. FIRESTORE DOCUMENT DATABASE ENGINE (JSONB + GIN INDEXING)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  environment_id UUID REFERENCES environments(id) ON DELETE CASCADE,
  collection_path TEXT NOT NULL,
  document_id VARCHAR(255) NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  version BIGINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (project_id, environment_id, collection_path, document_id)
);

-- Fast GIN path ops index for compound queries on document fields
CREATE INDEX IF NOT EXISTS idx_documents_data_gin ON documents USING gin (data jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_documents_lookup ON documents (project_id, environment_id, collection_path, document_id);
CREATE INDEX IF NOT EXISTS idx_documents_collection ON documents (project_id, environment_id, collection_path);

-- -----------------------------------------------------------------------------
-- 6. TRANSACTIONAL OUTBOX (DURABLE REALTIME CHANGE STREAM)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS event_outbox (
  sequence_id BIGSERIAL PRIMARY KEY,
  project_id UUID NOT NULL,
  environment_id UUID NOT NULL,
  collection_path TEXT NOT NULL,
  document_id VARCHAR(255) NOT NULL,
  event_type VARCHAR(30) NOT NULL, -- 'document_created', 'document_updated', 'document_deleted'
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  version BIGINT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_outbox_replay ON event_outbox(sequence_id);
CREATE INDEX IF NOT EXISTS idx_event_outbox_filter ON event_outbox(project_id, environment_id, collection_path);

-- Trigger to notify WebSocket streamer workers upon new outbox inserts
CREATE OR REPLACE FUNCTION notify_outbox_event()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_notify('outbox_wakeup', NEW.sequence_id::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notify_outbox ON event_outbox;
CREATE TRIGGER trg_notify_outbox
AFTER INSERT ON event_outbox
FOR EACH ROW
EXECUTE FUNCTION notify_outbox_event();

-- -----------------------------------------------------------------------------
-- 7. DECLARATIVE SECURITY RULES
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS security_rule_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  version_number INT NOT NULL,
  source_code TEXT NOT NULL,
  ast_json JSONB NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft', -- draft, published, archived
  published_at TIMESTAMPTZ,
  published_by UUID REFERENCES developers(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (project_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_rules_project_status ON security_rule_versions(project_id, status);

-- -----------------------------------------------------------------------------
-- 8. CRYPTOGRAPHIC TAMPER-EVIDENT AUDIT LEDGER
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS audit_ledger (
  sequence_id BIGSERIAL PRIMARY KEY,
  prev_hash VARCHAR(64) NOT NULL,
  current_hash VARCHAR(64) NOT NULL,
  actor_id VARCHAR(100) NOT NULL,
  actor_type VARCHAR(30) NOT NULL,
  action VARCHAR(100) NOT NULL,
  target_resource TEXT NOT NULL,
  project_id UUID,
  ip_address VARCHAR(45),
  user_agent TEXT,
  payload JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_ledger_seq ON audit_ledger(sequence_id);
CREATE INDEX IF NOT EXISTS idx_audit_ledger_project ON audit_ledger(project_id, created_at);

-- -----------------------------------------------------------------------------
-- 9. SECURITY OPERATIONS & INCIDENT TELEMETRY
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  severity VARCHAR(20) NOT NULL, -- low, medium, high, critical
  category VARCHAR(50) NOT NULL,
  source_ip VARCHAR(45),
  actor_id VARCHAR(100),
  project_id UUID,
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_security_events_severity ON security_events(severity, created_at);

-- -----------------------------------------------------------------------------
-- 10. FILE STORAGE SUBSYSTEM
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS storage_buckets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  name VARCHAR(64) NOT NULL,
  is_public BOOLEAN DEFAULT FALSE,
  quota_bytes BIGINT DEFAULT 1073741824, -- 1 GB default quota
  used_bytes BIGINT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (project_id, name)
);

CREATE TABLE IF NOT EXISTS storage_objects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id UUID REFERENCES storage_buckets(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  object_path TEXT NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(128) NOT NULL,
  size_bytes BIGINT NOT NULL,
  content_hash VARCHAR(64) NOT NULL,
  is_public BOOLEAN DEFAULT FALSE,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (bucket_id, object_path)
);

CREATE INDEX IF NOT EXISTS idx_storage_objects_path ON storage_objects(bucket_id, object_path);

-- -----------------------------------------------------------------------------
-- 11. USAGE ACCOUNTING & QUOTAS
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS usage_counters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  api_requests BIGINT DEFAULT 0,
  document_reads BIGINT DEFAULT 0,
  document_writes BIGINT DEFAULT 0,
  storage_bytes_peak BIGINT DEFAULT 0,
  realtime_connections_peak INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (project_id, period_start)
);
