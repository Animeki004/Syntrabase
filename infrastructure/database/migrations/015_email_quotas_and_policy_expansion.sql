-- Syntrabase: 015_email_quotas_and_policy_expansion.sql
-- Enforces email quotas per plan tier, expands platform email policy features,
-- and prepares enterprise limitations and project lockdown controls.

BEGIN;

-- 1. Expand Plans Table with Email Limits
ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS max_emails_per_day INT NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS max_emails_per_month INT NOT NULL DEFAULT 3000,
  ADD COLUMN IF NOT EXISTS max_custom_domains INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS max_dedicated_accounts INT NOT NULL DEFAULT 0;

-- 2. Expand Email Platform Policy Table
ALTER TABLE email_platform_policy
  ADD COLUMN IF NOT EXISTS monthly_project_cap INT NOT NULL DEFAULT 15000,
  ADD COLUMN IF NOT EXISTS burst_rate_limit_per_minute INT NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS enforcement_action VARCHAR(50) NOT NULL DEFAULT 'throttle_and_queue',
  ADD COLUMN IF NOT EXISTS allowed_domains_per_project INT NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS require_email_verification BOOLEAN NOT NULL DEFAULT FALSE;

-- 3. Update Existing Default Plans with Tier-Appropriate Email Quotas & Capabilities
UPDATE plans
SET max_emails_per_day = 100,
    max_emails_per_month = 3000,
    max_custom_domains = 1,
    max_dedicated_accounts = 0,
    capabilities = capabilities || '{"email.transactional": true, "email.custom_domains": true, "email.dedicated_brevo": false}'::jsonb
WHERE slug = 'free';

UPDATE plans
SET max_emails_per_day = 1000,
    max_emails_per_month = 30000,
    max_custom_domains = 5,
    max_dedicated_accounts = 1,
    capabilities = capabilities || '{"email.transactional": true, "email.custom_domains": true, "email.dedicated_brevo": true}'::jsonb
WHERE slug = 'pro';

UPDATE plans
SET max_emails_per_day = 10000,
    max_emails_per_month = 300000,
    max_custom_domains = 25,
    max_dedicated_accounts = 5,
    capabilities = capabilities || '{"email.transactional": true, "email.custom_domains": true, "email.dedicated_brevo": true}'::jsonb
WHERE slug = 'enterprise';

COMMIT;
