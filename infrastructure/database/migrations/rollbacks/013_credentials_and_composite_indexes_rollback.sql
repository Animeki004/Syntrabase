-- Syntrabase: 013_credentials_and_composite_indexes_rollback.sql
BEGIN;

DROP TABLE IF EXISTS composite_indexes;
ALTER TABLE api_credentials DROP COLUMN IF EXISTS updated_at;

COMMIT;
