-- Syntrabase: 006_brevo_email_and_contact_center_rollback.sql
-- Safe Rollback for Migration 006 in Reverse Dependency Order

BEGIN;

DROP TABLE IF EXISTS internal_notifications CASCADE;
DROP TABLE IF EXISTS contact_submissions CASCADE;
DROP TABLE IF EXISTS email_platform_policy CASCADE;
DROP TABLE IF EXISTS email_outbox_queue CASCADE;
DROP TABLE IF EXISTS authorized_sender_identities CASCADE;
DROP TABLE IF EXISTS custom_sender_domains CASCADE;
DROP TABLE IF EXISTS email_provider_accounts CASCADE;

COMMIT;
