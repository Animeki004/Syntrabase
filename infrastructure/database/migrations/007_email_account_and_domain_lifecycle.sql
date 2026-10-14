-- Syntrabase: 007_email_account_and_domain_lifecycle.sql
-- Adds observed usage counters, pause states, and domain-to-account associations.
-- Idempotent, Additive, and Transactional.

BEGIN;

-- 1. Extend email_provider_accounts with observed usage, reset intervals, and pause state
ALTER TABLE email_provider_accounts
ADD COLUMN IF NOT EXISTS daily_sent_count INT NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS monthly_sent_count INT NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS daily_reset_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '1 day'),
ADD COLUMN IF NOT EXISTS monthly_reset_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '30 days'),
ADD COLUMN IF NOT EXISTS paused_until TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS company_name VARCHAR(255);

-- 2. Extend custom_sender_domains with explicit provider account association
ALTER TABLE custom_sender_domains
ADD COLUMN IF NOT EXISTS provider_account_id UUID REFERENCES email_provider_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_custom_domains_provider_acc
ON custom_sender_domains (provider_account_id);

-- 3. Ensure project_auth_configs has require_email_verification
ALTER TABLE project_auth_configs
ADD COLUMN IF NOT EXISTS require_email_verification BOOLEAN NOT NULL DEFAULT FALSE;

COMMIT;
