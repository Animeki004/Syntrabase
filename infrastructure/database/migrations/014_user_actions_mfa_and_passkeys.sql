-- Syntrabase: 014_user_actions_mfa_and_passkeys.sql
-- Add User Actions configuration to project_auth_configs.
-- Create WebAuthn Passkeys tables for tenant app users and platform developers.
-- Create developer MFA table and single-use bound challenge sessions table.
-- Idempotent, Additive, and Transactional.

BEGIN;

-- 1. Ensure project_auth_configs has user_actions column
ALTER TABLE project_auth_configs 
ADD COLUMN IF NOT EXISTS user_actions JSONB NOT NULL DEFAULT '{
    "enableCreate": true,
    "enableDelete": true,
    "emailEnumerationProtection": true
}'::jsonb;

-- 2. Create app_user_passkeys table for end-user WebAuthn biometrics & security keys
CREATE TABLE IF NOT EXISTS app_user_passkeys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    project_id VARCHAR(255) NOT NULL,
    credential_id TEXT NOT NULL UNIQUE,
    public_key_spki TEXT NOT NULL,
    counter BIGINT NOT NULL DEFAULT 0,
    device_name VARCHAR(255) DEFAULT 'Security Key',
    transports JSONB DEFAULT '["internal", "hybrid"]'::jsonb,
    aaguid VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_used_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_app_user_passkeys_user 
ON app_user_passkeys (user_id);

CREATE INDEX IF NOT EXISTS idx_app_user_passkeys_cred 
ON app_user_passkeys (credential_id);

-- 3. Create developer_passkeys table for Developer Console passwordless accounts
CREATE TABLE IF NOT EXISTS developer_passkeys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    developer_id UUID NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
    credential_id TEXT NOT NULL UNIQUE,
    public_key_spki TEXT NOT NULL,
    counter BIGINT NOT NULL DEFAULT 0,
    device_name VARCHAR(255) DEFAULT 'Developer Passkey',
    transports JSONB DEFAULT '["internal", "hybrid"]'::jsonb,
    aaguid VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_used_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_developer_passkeys_dev 
ON developer_passkeys (developer_id);

CREATE INDEX IF NOT EXISTS idx_developer_passkeys_cred 
ON developer_passkeys (credential_id);

-- 4. Create developer_mfa table for Developer Console TOTP authenticator
CREATE TABLE IF NOT EXISTS developer_mfa (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    developer_id UUID NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
    factor_type VARCHAR(20) NOT NULL DEFAULT 'totp',
    secret_encrypted JSONB NOT NULL,
    backup_codes JSONB NOT NULL DEFAULT '[]'::jsonb,
    verified BOOLEAN NOT NULL DEFAULT FALSE,
    enrolled_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_used_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT uq_developer_mfa_dev_factor UNIQUE (developer_id, factor_type)
);

CREATE INDEX IF NOT EXISTS idx_developer_mfa_dev 
ON developer_mfa (developer_id);

-- 5. Create mfa_challenge_sessions table for short-lived, single-use, server-verifiable MFA challenge tokens
CREATE TABLE IF NOT EXISTS mfa_challenge_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_nonce VARCHAR(64) NOT NULL UNIQUE,
    user_id VARCHAR(255) NOT NULL,
    user_type VARCHAR(20) NOT NULL DEFAULT 'app_user', -- 'app_user' | 'developer'
    project_id VARCHAR(255) NOT NULL DEFAULT 'platform',
    environment_id VARCHAR(100) NOT NULL DEFAULT 'default',
    allowed_factors JSONB NOT NULL DEFAULT '["totp"]'::jsonb,
    consumed_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mfa_challenge_sessions_nonce 
ON mfa_challenge_sessions (session_nonce);

COMMIT;
