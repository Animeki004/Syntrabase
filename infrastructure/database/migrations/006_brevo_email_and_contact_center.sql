-- Syntrabase: 006_brevo_email_and_contact_center.sql
-- Provider-Independent Outbound Email (Brevo HTTPS), Custom Domains, Authorized Senders,
-- Durable Outbox Queue, Platform Policy, Contact Submissions & Internal Operations Notifications.
-- Idempotent, Additive, and Transactional.

BEGIN;

-- 1. Email Provider Accounts (Stores AES-256-GCM Encrypted Credentials)
CREATE TABLE IF NOT EXISTS email_provider_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id VARCHAR(255),
    provider_type VARCHAR(50) NOT NULL DEFAULT 'brevo', -- 'brevo', 'smtp', 'resend', 'mock'
    account_name VARCHAR(255) NOT NULL,
    encrypted_credentials JSONB NOT NULL DEFAULT '{}'::jsonb, -- {"iv": "...", "authTag": "...", "ciphertext": "..."}
    masked_api_key VARCHAR(100) NOT NULL, -- e.g. "xkeysib-...abcd"
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    status VARCHAR(50) NOT NULL DEFAULT 'healthy', -- 'healthy', 'rate_limited', 'quota_exhausted', 'invalid_credentials', 'disabled'
    account_email VARCHAR(255),
    last_health_check_at TIMESTAMP WITH TIME ZONE,
    last_error TEXT,
    provider_plan_info JSONB NOT NULL DEFAULT '{}'::jsonb, -- {"credits": 300, "planType": "free"}
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_provider_accounts_status
ON email_provider_accounts (provider_type, is_enabled, status);

-- 2. Custom Sender Domains (Tenant Custom Sending Domains & DNS Parameters)
CREATE TABLE IF NOT EXISTS custom_sender_domains (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id VARCHAR(255) NOT NULL,
    domain_name VARCHAR(255) NOT NULL,
    provider_domain_id VARCHAR(100),
    verification_status VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'pending', 'verified', 'failed', 'suspended'
    dns_records JSONB NOT NULL DEFAULT '[]'::jsonb,
    last_dns_check_at TIMESTAMP WITH TIME ZONE,
    last_error TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    verified_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT uq_custom_domain_project_name UNIQUE (project_id, domain_name)
);

CREATE INDEX IF NOT EXISTS idx_custom_domains_lookup
ON custom_sender_domains (project_id, verification_status);

-- 3. Authorized Sender Identities (Project-Scoped From Addresses)
CREATE TABLE IF NOT EXISTS authorized_sender_identities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id VARCHAR(255) NOT NULL,
    domain_id UUID NOT NULL REFERENCES custom_sender_domains(id) ON DELETE CASCADE,
    display_name VARCHAR(255) NOT NULL,
    email_address VARCHAR(255) NOT NULL,
    provider_sender_id VARCHAR(100),
    status VARCHAR(50) NOT NULL DEFAULT 'active', -- 'active', 'pending_verification', 'revoked'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_authorized_sender_project_email UNIQUE (project_id, email_address)
);

CREATE INDEX IF NOT EXISTS idx_authorized_senders_project
ON authorized_sender_identities (project_id, status);

-- 4. Durable Email Outbox Queue (ACID-Guaranteed Asynchronous Dispatch)
CREATE TABLE IF NOT EXISTS email_outbox_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id VARCHAR(255) NOT NULL,
    recipient_email VARCHAR(255) NOT NULL,
    recipient_name VARCHAR(255),
    sender_email VARCHAR(255) NOT NULL,
    sender_name VARCHAR(255) NOT NULL,
    reply_to VARCHAR(255),
    subject VARCHAR(500) NOT NULL,
    html_body TEXT,
    text_body TEXT,
    action_type VARCHAR(50) NOT NULL DEFAULT 'custom', -- 'verify_email', 'password_reset', 'email_change', 'custom'
    status VARCHAR(50) NOT NULL DEFAULT 'queued', -- 'queued', 'processing', 'sent', 'deferred', 'failed'
    attempts INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 5,
    next_retry_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    idempotency_key VARCHAR(255) UNIQUE,
    provider_account_id UUID REFERENCES email_provider_accounts(id) ON DELETE SET NULL,
    provider_message_id VARCHAR(255),
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_email_outbox_queue_pending
ON email_outbox_queue (status, next_retry_at)
WHERE status IN ('queued', 'deferred');

CREATE INDEX IF NOT EXISTS idx_email_outbox_queue_project
ON email_outbox_queue (project_id, created_at DESC);

-- 5. Email Platform Policy & Global Emergency Controls
CREATE TABLE IF NOT EXISTS email_platform_policy (
    id INT PRIMARY KEY DEFAULT 1,
    global_sending_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    emergency_shutdown BOOLEAN NOT NULL DEFAULT FALSE,
    daily_project_cap INT NOT NULL DEFAULT 500,
    max_retry_attempts INT NOT NULL DEFAULT 5,
    default_provider_type VARCHAR(50) NOT NULL DEFAULT 'brevo',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT single_row_policy CHECK (id = 1)
);

-- Seed initial default policy row
INSERT INTO email_platform_policy (id, global_sending_enabled, emergency_shutdown, daily_project_cap, max_retry_attempts, default_provider_type)
VALUES (1, TRUE, FALSE, 500, 5, 'brevo')
ON CONFLICT (id) DO NOTHING;

-- 6. Contact Submissions (Persisted Durably & Fully Decoupled from Email)
CREATE TABLE IF NOT EXISTS contact_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_reference VARCHAR(50) NOT NULL UNIQUE, -- e.g. "TKT-2026-89104"
    project_id VARCHAR(255) NOT NULL,
    user_id VARCHAR(255),
    user_email VARCHAR(255),
    category VARCHAR(100) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    reply_email VARCHAR(255),
    status VARCHAR(50) NOT NULL DEFAULT 'open', -- 'open', 'in_progress', 'resolved', 'closed'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contact_submissions_lookup
ON contact_submissions (project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_contact_submissions_status
ON contact_submissions (status, created_at DESC);

-- 7. Internal Operations Notifications (Super Admin In-App Notifications Feed)
CREATE TABLE IF NOT EXISTS internal_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category VARCHAR(100) NOT NULL, -- 'contact', 'email_infra', 'email_queue', 'security'
    severity VARCHAR(50) NOT NULL DEFAULT 'info', -- 'info', 'warning', 'critical'
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    related_id VARCHAR(255),
    project_id VARCHAR(255),
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_internal_notifications_unread
ON internal_notifications (is_read, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_internal_notifications_category
ON internal_notifications (category, created_at DESC);

COMMIT;
