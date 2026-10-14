-- Syntrabase: 013_credentials_and_composite_indexes.sql
-- Add updated_at to api_credentials, create composite_indexes table for Firestore studio indexes.
-- Idempotent, Additive, and Transactional.

BEGIN;

-- 1. Ensure api_credentials has updated_at column
ALTER TABLE api_credentials 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 2. Create composite_indexes table for database studio index management
CREATE TABLE IF NOT EXISTS composite_indexes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id VARCHAR(255) NOT NULL,
    database_id VARCHAR(100) NOT NULL DEFAULT '(default)',
    collection_path VARCHAR(255) NOT NULL,
    fields JSONB NOT NULL DEFAULT '[]'::jsonb,
    query_scope VARCHAR(50) NOT NULL DEFAULT 'Collection',
    status VARCHAR(50) NOT NULL DEFAULT 'Enabled',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_composite_indexes_project_db
ON composite_indexes (project_id, database_id);

COMMIT;
