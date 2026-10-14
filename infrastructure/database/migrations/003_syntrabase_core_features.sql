-- Syntrabase Core Features Migration: Email Lifecycle, Anonymous Auth, Collection Groups & Cloud Functions
-- Idempotent, Additive, and Transactional

BEGIN;

-- 1. App Users Extension (Anonymous Auth & Revocation Epoch)
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS is_anonymous BOOLEAN DEFAULT FALSE;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS sessions_revoked_at TIMESTAMP WITH TIME ZONE;

-- 2. Email Action Tokens Table (Atomic Single-Use Redemption)
CREATE TABLE IF NOT EXISTS email_action_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id VARCHAR(255) NOT NULL,
    environment_id VARCHAR(255) NOT NULL DEFAULT 'default',
    user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    action_type VARCHAR(50) NOT NULL, -- 'VERIFY_EMAIL', 'PASSWORD_RESET'
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    redeemed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_action_tokens_lookup 
ON email_action_tokens (token_hash, action_type);

CREATE INDEX IF NOT EXISTS idx_email_action_tokens_user 
ON email_action_tokens (project_id, user_id, action_type);

-- 3. Email Provider Configurations Table (AES-256-GCM Encrypted Credentials)
CREATE TABLE IF NOT EXISTS email_provider_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id VARCHAR(255) NOT NULL,
    provider_type VARCHAR(50) NOT NULL DEFAULT 'smtp', -- 'smtp', 'resend', 'mock'
    from_email VARCHAR(255) NOT NULL,
    from_name VARCHAR(255) DEFAULT 'Syntrabase App',
    host VARCHAR(255),
    port INT DEFAULT 587,
    secure BOOLEAN DEFAULT FALSE,
    encrypted_credentials JSONB NOT NULL DEFAULT '{}'::jsonb, -- {"iv": "...", "authTag": "...", "ciphertext": "..."}
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_email_provider_project_type UNIQUE (project_id, provider_type)
);

-- 4. Email Delivery Logs Table (Audit Trail)
CREATE TABLE IF NOT EXISTS email_delivery_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id VARCHAR(255) NOT NULL,
    recipient_email VARCHAR(255) NOT NULL,
    action_type VARCHAR(50) NOT NULL,
    provider VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL, -- 'sent', 'failed'
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_delivery_logs_project 
ON email_delivery_logs (project_id, created_at DESC);

-- 5. Collection Group Subcollection Index
CREATE INDEX IF NOT EXISTS idx_documents_collection_group 
ON documents (project_id, environment_id, (substring(collection_path from '[^/]+$')));

-- 6. Cloud Function Triggers Table
CREATE TABLE IF NOT EXISTS cloud_function_triggers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id VARCHAR(255) NOT NULL,
    environment_id VARCHAR(255) NOT NULL DEFAULT 'default',
    name VARCHAR(255) NOT NULL,
    collection_path VARCHAR(255) NOT NULL,
    event_type VARCHAR(50) NOT NULL, -- 'create', 'update', 'delete', 'write'
    endpoint_url TEXT NOT NULL,
    secret_key VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cloud_triggers_event 
ON cloud_function_triggers (project_id, environment_id, collection_path, event_type);

-- 7. Cloud Function Executions & Dead Letter Queue (DLQ)
CREATE TABLE IF NOT EXISTS cloud_function_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trigger_id UUID REFERENCES cloud_function_triggers(id) ON DELETE CASCADE,
    project_id VARCHAR(255) NOT NULL,
    event_id VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL, -- 'success', 'failed', 'retrying'
    attempt_count INT DEFAULT 1,
    http_status INT,
    error_message TEXT,
    payload JSONB,
    executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cloud_executions_status 
ON cloud_function_executions (project_id, status, executed_at DESC);

COMMIT;
