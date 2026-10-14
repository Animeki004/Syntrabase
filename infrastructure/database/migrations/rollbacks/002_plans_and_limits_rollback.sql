-- =============================================================================
-- SYNTRABASE: 002_PLANS_AND_LIMITS ROLLBACK MIGRATION
-- =============================================================================

ALTER TABLE projects 
  DROP COLUMN IF EXISTS plan_overrides,
  DROP COLUMN IF EXISTS plan_id;

DROP TABLE IF EXISTS plans;
