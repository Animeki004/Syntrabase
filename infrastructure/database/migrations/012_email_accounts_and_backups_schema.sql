-- =============================================================================
-- SYNTRABASE: 012_EMAIL_ACCOUNTS_AND_BACKUPS_SCHEMA MIGRATION
-- Authoritative schema fixes:
-- 1. Adds dedicated_brevo_enabled column to projects table
-- 2. Adds project_id column to email_provider_accounts table
-- 3. Creates platform_backups table for disaster recovery and encrypted snapshots
-- Idempotent, Additive, and Transactional.
-- =============================================================================

-- 1. Add dedicated_brevo_enabled to projects table
ALTER TABLE projects 
  ADD COLUMN IF NOT EXISTS dedicated_brevo_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Add project_id to email_provider_accounts table (supports platform & tenant accounts)
ALTER TABLE email_provider_accounts 
  ADD COLUMN IF NOT EXISTS project_id VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_email_provider_accounts_project_id 
  ON email_provider_accounts (project_id);

-- 3. Create platform_backups table for Super Admin DR & Backup Management
CREATE TABLE IF NOT EXISTS platform_backups (
    id VARCHAR(100) PRIMARY KEY,
    type VARCHAR(50) NOT NULL DEFAULT 'MANUAL', -- 'MANUAL', 'SCHEDULED', 'DRILL'
    size_bytes BIGINT NOT NULL DEFAULT 0,
    status VARCHAR(50) NOT NULL DEFAULT 'VERIFIED', -- 'VERIFIED', 'RESTORE_VERIFIED', 'FAILED'
    checksum_sha256 VARCHAR(64) NOT NULL,
    encryption_algorithm VARCHAR(50) NOT NULL DEFAULT 'AES-256-GCM',
    duration_ms INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_backups_created_at 
  ON platform_backups (created_at DESC);
