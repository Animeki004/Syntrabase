-- Syntrabase: 016_contact_ticket_retention.sql
-- Adds ticket retention and auto-remove settings table for Super Admin.

BEGIN;

CREATE TABLE IF NOT EXISTS contact_retention_policy (
  id INT PRIMARY KEY DEFAULT 1,
  auto_remove_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  retention_days INT NOT NULL DEFAULT 30,
  resolved_only BOOLEAN NOT NULL DEFAULT TRUE,
  last_pruned_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT single_retention_row CHECK (id = 1)
);

INSERT INTO contact_retention_policy (id, auto_remove_enabled, retention_days, resolved_only)
VALUES (1, FALSE, 30, TRUE)
ON CONFLICT (id) DO NOTHING;

COMMIT;
