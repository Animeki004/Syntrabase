-- Syntrabase: 009_contact_message_threads.sql
-- Multi-message conversation thread for support inquiries and follow-ups.
-- Idempotent, Additive, and Transactional.

BEGIN;

CREATE TABLE IF NOT EXISTS contact_inquiry_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inquiry_id UUID NOT NULL REFERENCES contact_submissions(id) ON DELETE CASCADE,
    sender_type VARCHAR(20) NOT NULL, -- 'operator' | 'developer'
    sender_name VARCHAR(255),
    sender_email VARCHAR(255),
    message TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contact_messages_inquiry
ON contact_inquiry_messages (inquiry_id, created_at ASC);

-- Backfill existing single admin replies into messages table if any exist
INSERT INTO contact_inquiry_messages (inquiry_id, sender_type, sender_name, sender_email, message, created_at)
SELECT id, 'operator', COALESCE(replied_by, 'Syntrabase Support Operations'), 'support@syntrabase.app', admin_reply, COALESCE(replied_at, NOW())
FROM contact_submissions
WHERE admin_reply IS NOT NULL AND admin_reply <> ''
ON CONFLICT DO NOTHING;

COMMIT;
