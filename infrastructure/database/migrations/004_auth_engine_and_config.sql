-- Syntrabase: 004_auth_engine_and_config.sql
-- Comprehensive Firebase-Style Project Authentication Configuration, Provider Enforcement,
-- MFA (TOTP), Email Templates, Identity Links, and User Activity Logs.
-- Idempotent, Additive, and Transactional.

BEGIN;

-- 1. Extend app_users table with phone number, verification and last sign-in timestamp
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS phone_number VARCHAR(50);
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS last_sign_in_at TIMESTAMP WITH TIME ZONE;

-- 2. Project Authentication Configuration Table
-- NEW PROJECTS START WITH ALL OPTIONAL PROVIDERS DISABLED BY DEFAULT!
CREATE TABLE IF NOT EXISTS project_auth_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id VARCHAR(255) NOT NULL UNIQUE,
    email_password_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    email_link_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    anonymous_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    phone_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    google_oauth_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    github_oauth_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    apple_oauth_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    providers_config JSONB NOT NULL DEFAULT '{}'::jsonb,
    require_email_verification BOOLEAN NOT NULL DEFAULT FALSE,
    password_policy JSONB NOT NULL DEFAULT '{
        "minLength": 8,
        "requireUppercase": false,
        "requireLowercase": false,
        "requireNumbers": false,
        "requireSymbols": false,
        "maxAgeDays": 0
    }'::jsonb,
    account_linking_mode VARCHAR(50) NOT NULL DEFAULT 'link_same_email', -- 'link_same_email' | 'multiple_accounts'
    signup_quota_per_window INT NOT NULL DEFAULT 100, -- max signups per minute
    authorized_domains JSONB NOT NULL DEFAULT '["localhost", "127.0.0.1"]'::jsonb,
    session_policy JSONB NOT NULL DEFAULT '{
        "accessTokenTtlMinutes": 15,
        "refreshTokenTtlDays": 7,
        "singleSessionPerUser": false
    }'::jsonb,
    mfa_policy JSONB NOT NULL DEFAULT '{
        "enabled": false,
        "enforceForAdmins": false,
        "allowedFactors": ["totp"]
    }'::jsonb,
    activity_logging_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    blocking_functions JSONB NOT NULL DEFAULT '{
        "beforeCreate": null,
        "beforeSignIn": null
    }'::jsonb,
    email_templates JSONB NOT NULL DEFAULT '{
        "verify_email": {
            "senderName": "Syntrabase App",
            "fromEmail": "noreply@syntrabase.internal",
            "replyTo": "noreply@syntrabase.internal",
            "subject": "Verify your email for %APP_NAME%",
            "body": "Hello %DISPLAY_NAME%,\n\nFollow this link to verify your email address.\n\n%LINK%\n\nIf you did not ask to verify this address, you can ignore this email.\n\nThanks,\nYour %APP_NAME% team"
        },
        "password_reset": {
            "senderName": "Syntrabase App",
            "fromEmail": "noreply@syntrabase.internal",
            "replyTo": "noreply@syntrabase.internal",
            "subject": "Reset your password for %APP_NAME%",
            "body": "Hello %DISPLAY_NAME%,\n\nFollow this link to reset your password for your %APP_NAME% account.\n\n%LINK%\n\nIf you did not request a password reset, you can safely ignore this email.\n\nThanks,\nYour %APP_NAME% team"
        },
        "email_change": {
            "senderName": "Syntrabase App",
            "fromEmail": "noreply@syntrabase.internal",
            "replyTo": "noreply@syntrabase.internal",
            "subject": "Confirm email address change for %APP_NAME%",
            "body": "Hello %DISPLAY_NAME%,\n\nFollow this link to confirm your new email address.\n\n%LINK%\n\nThanks,\nYour %APP_NAME% team"
        },
        "mfa_enrollment": {
            "senderName": "Syntrabase Security",
            "fromEmail": "security@syntrabase.internal",
            "replyTo": "security@syntrabase.internal",
            "subject": "Two-factor authentication enabled for %APP_NAME%",
            "body": "Hello %DISPLAY_NAME%,\n\nTwo-factor authentication has been enrolled on your %APP_NAME% account.\n\nIf this was not you, please secure your account immediately.\n\nThanks,\nYour %APP_NAME% team"
        }
    }'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_auth_configs_project 
ON project_auth_configs (project_id);

-- 3. Multi-Factor Authentication (TOTP MFA) Enrollment Table
CREATE TABLE IF NOT EXISTS app_user_mfa (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    factor_type VARCHAR(20) NOT NULL DEFAULT 'totp',
    secret_encrypted JSONB NOT NULL, -- AES-256-GCM encrypted TOTP secret {"iv": "...", "authTag": "...", "ciphertext": "..."}
    backup_codes JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array of SHA-256 hashed one-time backup codes
    verified BOOLEAN NOT NULL DEFAULT FALSE,
    enrolled_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_used_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT uq_app_user_mfa_user_factor UNIQUE (user_id, factor_type)
);

CREATE INDEX IF NOT EXISTS idx_app_user_mfa_user 
ON app_user_mfa (user_id);

-- 4. User Identities Table (Multi-Provider Account Linking)
CREATE TABLE IF NOT EXISTS app_user_identities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    project_id VARCHAR(255) NOT NULL,
    provider_id VARCHAR(50) NOT NULL, -- 'password', 'anonymous', 'google', 'github', 'apple', 'phone'
    provider_uid VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    profile_data JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_sign_in_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_app_user_identity UNIQUE (project_id, provider_id, provider_uid)
);

CREATE INDEX IF NOT EXISTS idx_app_user_identities_lookup 
ON app_user_identities (project_id, provider_id, provider_uid);

CREATE INDEX IF NOT EXISTS idx_app_user_identities_user 
ON app_user_identities (user_id);

-- 5. User Activity & Security Audit Logs Table
CREATE TABLE IF NOT EXISTS auth_activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id VARCHAR(255) NOT NULL,
    environment_id VARCHAR(255) NOT NULL DEFAULT 'default',
    actor_id VARCHAR(255) NOT NULL,
    actor_email VARCHAR(255),
    event_type VARCHAR(100) NOT NULL,
    provider VARCHAR(50),
    ip_address VARCHAR(45),
    user_agent TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_activity_logs_project_created 
ON auth_activity_logs (project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_auth_activity_logs_actor 
ON auth_activity_logs (project_id, actor_id);

COMMIT;
