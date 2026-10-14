-- =============================================================================
-- SYNTRABASE: ALLOW DEVELOPER & APP USER SESSIONS IN AUTH_SESSIONS
-- =============================================================================

ALTER TABLE auth_sessions DROP CONSTRAINT IF EXISTS auth_sessions_user_id_fkey;
