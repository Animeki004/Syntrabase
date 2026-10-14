import dotenv from 'dotenv';
import path from 'path';

// Load .env from workspace root if present
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '4000', 10),
  host: process.env.HOST || '0.0.0.0',
  platformDomain: process.env.PLATFORM_DOMAIN || 'localhost',

  db: {
    host: process.env.DATABASE_HOST === 'postgres' ? 'syntrabase-db' : (process.env.DATABASE_HOST || (process.env.NODE_ENV === 'production' ? 'syntrabase-db' : '127.0.0.1')),
    port: parseInt(process.env.DATABASE_PORT || '5432', 10),
    name: process.env.DATABASE_NAME || 'syntrabase',
    user: process.env.DATABASE_USER || 'postgres',
    password: process.env.DATABASE_PASSWORD || 'postgres',
    ssl: process.env.DATABASE_SSL === 'true',
    poolMin: parseInt(process.env.DATABASE_POOL_MIN || '2', 10),
    poolMax: parseInt(process.env.DATABASE_POOL_MAX || '20', 10),
  },

  jwt: {
    activeKid: process.env.JWT_ACTIVE_KID || 'key_dev_v1',
    secret: process.env.JWT_SECRET || 'dev_secret_must_be_changed_in_prod_1234567890123456',
    previousSecrets: (process.env.JWT_PREVIOUS_SECRETS || '').split(',').filter(Boolean),
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },

  security: {
    passwordPepper: process.env.PASSWORD_PEPPER || 'dev_pepper_default_secret_32bytes!',
    auditHmacSecret: process.env.AUDIT_HMAC_SECRET || 'dev_audit_secret_64bytes_hex_key_for_hmac!',
    auditLogFilePath: process.env.AUDIT_LOG_FILE_PATH || './storage_data/audit.log',
  },

  storage: {
    driver: process.env.STORAGE_DRIVER || 'local',
    localRoot: process.env.STORAGE_LOCAL_ROOT || './storage_data',
    maxFileSizeBytes: parseInt(process.env.STORAGE_MAX_FILE_SIZE_BYTES || '10485760', 10),
  },

  rateLimit: {
    globalMax: parseInt(process.env.RATE_LIMIT_GLOBAL_MAX || '100', 10),
    globalWindowMs: parseInt(process.env.RATE_LIMIT_GLOBAL_WINDOW_MS || '60000', 10),
    authMax: parseInt(process.env.RATE_LIMIT_AUTH_MAX || '5', 10),
    authWindowMs: parseInt(process.env.RATE_LIMIT_AUTH_WINDOW_MS || '60000', 10),
  },
};

/**
 * Validates environment variables and cryptographic secrets.
 * Rejects default credentials, missing production secrets, and weak keys.
 */
export function validateConfig(targetEnv = config.env): void {
  const isProductionOrStaging = targetEnv === 'production' || targetEnv === 'staging';

  const placeholderPrefixes = ['replace_with_', 'dev_secret', 'dev_pepper', 'dev_audit'];
  const commonWeakPasswords = ['postgres', 'password', '123456', 'admin', 'root'];

  if (isProductionOrStaging) {
    // 1. Production Database Secrets
    if (!process.env.DATABASE_PASSWORD || commonWeakPasswords.includes(process.env.DATABASE_PASSWORD.toLowerCase())) {
      throw new Error('[SECURITY VIOLATION] DATABASE_PASSWORD is missing or set to an insecure default credential');
    }
    if (placeholderPrefixes.some((p) => (process.env.DATABASE_PASSWORD || '').startsWith(p))) {
      throw new Error('[SECURITY VIOLATION] DATABASE_PASSWORD contains an unreplaced placeholder value');
    }

    // 2. Production JWT Secret
    if (!process.env.JWT_SECRET || placeholderPrefixes.some((p) => (process.env.JWT_SECRET || '').startsWith(p))) {
      throw new Error('[SECURITY VIOLATION] JWT_SECRET must be provided with a strong cryptographic random key');
    }

    // 3. Production Password Pepper & Audit Secret
    if (!process.env.PASSWORD_PEPPER || placeholderPrefixes.some((p) => (process.env.PASSWORD_PEPPER || '').startsWith(p))) {
      throw new Error('[SECURITY VIOLATION] PASSWORD_PEPPER must be provided with a strong random secret');
    }
    if (!process.env.AUDIT_HMAC_SECRET || placeholderPrefixes.some((p) => (process.env.AUDIT_HMAC_SECRET || '').startsWith(p))) {
      throw new Error('[SECURITY VIOLATION] AUDIT_HMAC_SECRET must be provided with a strong random secret');
    }
  }

  // 4. Reject Weak Signing Keys (Entropy / Key Length Checks)
  if (config.jwt.secret.length < 32) {
    throw new Error('[SECURITY VIOLATION] Weak signing key: JWT_SECRET must be at least 32 characters (256-bit entropy)');
  }

  if (config.security.passwordPepper.length < 16) {
    throw new Error('[SECURITY VIOLATION] Weak password pepper: PASSWORD_PEPPER must be at least 16 characters');
  }

  if (config.security.auditHmacSecret.length < 32) {
    throw new Error('[SECURITY VIOLATION] Weak audit signing key: AUDIT_HMAC_SECRET must be at least 32 characters');
  }
}
