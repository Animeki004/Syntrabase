-- Rollback migration for 003_syntrabase_core_features.sql
BEGIN;

DROP TABLE IF EXISTS cloud_function_executions CASCADE;
DROP TABLE IF EXISTS cloud_function_triggers CASCADE;
DROP INDEX IF EXISTS idx_documents_collection_group;
DROP TABLE IF EXISTS email_delivery_logs CASCADE;
DROP TABLE IF EXISTS email_provider_configs CASCADE;
DROP TABLE IF EXISTS email_action_tokens CASCADE;
ALTER TABLE app_users DROP COLUMN IF EXISTS sessions_revoked_at;
ALTER TABLE app_users DROP COLUMN IF EXISTS is_anonymous;

COMMIT;
