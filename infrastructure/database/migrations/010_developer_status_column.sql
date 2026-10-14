-- =============================================================================
-- SYNTRABASE: ADD STATUS COLUMN TO DEVELOPERS TABLE
-- =============================================================================

ALTER TABLE developers ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active';
