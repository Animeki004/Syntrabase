-- Syntrabase: 004_auth_engine_and_config_rollback.sql
-- Safe Rollback for 004_auth_engine_and_config.sql

BEGIN;

DROP TABLE IF EXISTS auth_activity_logs CASCADE;
DROP TABLE IF EXISTS app_user_identities CASCADE;
DROP TABLE IF EXISTS app_user_mfa CASCADE;
DROP TABLE IF EXISTS project_auth_configs CASCADE;

ALTER TABLE app_users DROP COLUMN IF EXISTS phone_number;
ALTER TABLE app_users DROP COLUMN IF EXISTS phone_verified;
ALTER TABLE app_users DROP COLUMN IF EXISTS last_sign_in_at;

COMMIT;
