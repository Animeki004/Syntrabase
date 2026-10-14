-- =============================================================================
-- SYNTRABASE: 002_PLANS_AND_LIMITS MIGRATION
-- Authoritative Plan Management, Capabilities, and Quotas
-- =============================================================================

CREATE TABLE IF NOT EXISTS plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(50) UNIQUE NOT NULL,
  description TEXT,
  is_default BOOLEAN DEFAULT FALSE,
  max_db_storage_bytes BIGINT NOT NULL DEFAULT 52428800,       -- 50 MB for Free
  max_doc_size_bytes INT NOT NULL DEFAULT 1048576,              -- 1 MB max doc size
  max_api_requests_per_window INT NOT NULL DEFAULT 1000,        -- 1,000 req / minute
  max_file_storage_bytes BIGINT NOT NULL DEFAULT 0,             -- 0 bytes (disabled) for Free
  max_realtime_connections INT NOT NULL DEFAULT 25,
  capabilities JSONB NOT NULL DEFAULT '{
    "database.documents": true,
    "database.realtime": true,
    "storage.objects": false,
    "auth.email": true,
    "auth.anonymous": true
  }'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Link Plans to Projects with Per-Project Overrides
ALTER TABLE projects 
  ADD COLUMN IF NOT EXISTS plan_id UUID REFERENCES plans(id),
  ADD COLUMN IF NOT EXISTS plan_overrides JSONB DEFAULT '{}'::jsonb;

-- Seed Default Plans (Free, Pro, Enterprise)
INSERT INTO plans (name, slug, description, is_default, max_db_storage_bytes, max_doc_size_bytes, max_file_storage_bytes, max_realtime_connections, capabilities)
VALUES
  (
    'Free Tier', 
    'free', 
    'Default developer plan with document database enabled and dedicated file storage disabled', 
    TRUE, 
    52428800,        -- 50 MB database storage
    1048576,         -- 1 MB max document size
    0,               -- 0 B file storage (disabled)
    25,              -- 25 max realtime connections
    '{"database.documents": true, "database.realtime": true, "storage.objects": false, "auth.email": true, "auth.anonymous": true}'::jsonb
  ),
  (
    'Pro Tier', 
    'pro', 
    'Production plan with high database limits and 5GB dedicated object storage enabled', 
    FALSE, 
    1073741824,      -- 1 GB database storage
    4194304,         -- 4 MB max document size
    5368709120,      -- 5 GB file storage
    500,             -- 500 max realtime connections
    '{"database.documents": true, "database.realtime": true, "storage.objects": true, "auth.email": true, "auth.anonymous": true}'::jsonb
  ),
  (
    'Enterprise', 
    'enterprise', 
    'Dedicated high-throughput fleet with custom quotas and 100GB storage', 
    FALSE, 
    53687091200,     -- 50 GB database storage
    10485760,        -- 10 MB max document size
    107374182400,    -- 100 GB file storage
    5000,            -- 5000 max realtime connections
    '{"database.documents": true, "database.realtime": true, "storage.objects": true, "auth.email": true, "auth.anonymous": true}'::jsonb
  )
ON CONFLICT (slug) DO UPDATE SET
  capabilities = EXCLUDED.capabilities,
  max_doc_size_bytes = EXCLUDED.max_doc_size_bytes,
  max_file_storage_bytes = EXCLUDED.max_file_storage_bytes;

-- Ensure all existing projects are assigned to the default Free plan
UPDATE projects SET plan_id = (SELECT id FROM plans WHERE slug = 'free') WHERE plan_id IS NULL;
