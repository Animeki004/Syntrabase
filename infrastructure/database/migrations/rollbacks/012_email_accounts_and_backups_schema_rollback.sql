-- Syntrabase: 012_email_accounts_and_backups_schema_rollback.sql
-- Rolls back dedicated_brevo_enabled, email_provider_accounts.project_id, and platform_backups

BEGIN;

ALTER TABLE projects DROP COLUMN IF EXISTS dedicated_brevo_enabled;
ALTER TABLE email_provider_accounts DROP COLUMN IF EXISTS project_id;
DROP TABLE IF EXISTS platform_backups CASCADE;

COMMIT;
