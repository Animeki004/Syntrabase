-- Syntrabase: 008_developer_password_reset_and_contact_replies.sql
-- Developer self-service password reset tokens & official Super Admin support inquiry replies.
-- Idempotent, Additive, and Transactional.

BEGIN;

-- 1. Developer Password Reset Tokens Table (Single-Use Token Redemption)
CREATE TABLE IF NOT EXISTS developer_password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    developer_id UUID NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    redeemed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dev_reset_tokens_hash 
ON developer_password_reset_tokens (token_hash);

CREATE INDEX IF NOT EXISTS idx_dev_reset_tokens_dev 
ON developer_password_reset_tokens (developer_id, created_at DESC);

-- 2. Contact Submissions Official Super Admin Reply Columns
ALTER TABLE contact_submissions ADD COLUMN IF NOT EXISTS admin_reply TEXT;
ALTER TABLE contact_submissions ADD COLUMN IF NOT EXISTS replied_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE contact_submissions ADD COLUMN IF NOT EXISTS replied_by VARCHAR(255);

COMMIT;
