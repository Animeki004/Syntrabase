-- =============================================================================
-- SYNTRABASE: 005_PROJECT_DATABASES_AND_LIMITS MIGRATION
-- Project-scoped Databases, Database Isolation, and Plan Limit Enforcement
-- =============================================================================

-- 1. Extend plans table with max_projects and max_databases
ALTER TABLE plans 
  ADD COLUMN IF NOT EXISTS max_projects INT NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS max_databases INT NOT NULL DEFAULT 1;

-- 2. Update default plans with production-calibrated limits
UPDATE plans 
SET max_projects = 3, max_databases = 1 
WHERE slug = 'free';

UPDATE plans 
SET max_projects = 25, max_databases = 5 
WHERE slug = 'pro';

UPDATE plans 
SET max_projects = 100, max_databases = 50 
WHERE slug = 'enterprise';

-- 3. Project-scoped Databases Table
CREATE TABLE IF NOT EXISTS databases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  database_id VARCHAR(100) NOT NULL,
  name VARCHAR(100) NOT NULL,
  engine VARCHAR(50) NOT NULL DEFAULT 'syntrabase-jsonb',
  status VARCHAR(20) NOT NULL DEFAULT 'ready',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_project_database_id UNIQUE (project_id, database_id)
);

CREATE INDEX IF NOT EXISTS idx_databases_project ON databases(project_id);

-- 4. Automatically seed (default) database for every existing project
INSERT INTO databases (project_id, database_id, name, engine, status)
SELECT id, '(default)', 'Default Database', 'syntrabase-jsonb', 'ready'
FROM projects
ON CONFLICT (project_id, database_id) DO NOTHING;

-- 5. Extend documents table with database_id for multi-database namespacing
ALTER TABLE documents 
  ADD COLUMN IF NOT EXISTS database_id VARCHAR(100) NOT NULL DEFAULT '(default)';

CREATE INDEX IF NOT EXISTS idx_documents_database 
  ON documents (project_id, environment_id, database_id);
