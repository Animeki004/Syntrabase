import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import QRCode from 'qrcode';
import { query } from '../db/pool.js';
import { config } from '../config.js';
import { EmailService } from './email.service.js';
import { TotpEnrollmentResult, TotpVerifyResult, MfaChallengeSession } from '@syntrabase/shared-types';


// Isolated in-memory fallback store used ONLY for non-production unit test mocks (never in production)
const unitTestMockMfaStore = new Map<string, any>();
const unitTestMockChallengeStore = new Map<string, any>();

// RFC 4648 Base32 alphabet
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

function base32Decode(str: string): Buffer {
  const cleaned = str.toUpperCase().replace(/=+$/, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (let i = 0; i < cleaned.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(cleaned[i]);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

function computeTotpCode(secretBuffer: Buffer, counter: number): string {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigInt64BE(BigInt(counter), 0);

  const hmac = crypto.createHmac('sha1', secretBuffer);
  hmac.update(counterBuffer);
  const hash = hmac.digest();

  const offset = hash[hash.length - 1] & 0x0f;
  const binary =
    ((hash[offset] & 0x7f) << 24) |
    ((hash[offset + 1] & 0xff) << 16) |
    ((hash[offset + 2] & 0xff) << 8) |
    (hash[offset + 3] & 0xff);

  const otp = (binary % 1_000_000).toString().padStart(6, '0');
  return otp;
}

export class MfaService {
  // ---------------------------------------------------------------------------
  // SINGLE-USE BOUND MFA CHALLENGE SESSIONS
  // ---------------------------------------------------------------------------

  /**
   * Creates a short-lived (3-minute), single-use challenge token bound to the user and project.
   */
  public static async createChallengeSession(
    userId: string,
    userType: 'app_user' | 'developer',
    projectId: string,
    environmentId: string,
    allowedFactors: ('totp' | 'passkey')[]
  ): Promise<string> {
    const sessionNonce = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 3 * 60 * 1000); // 3 minutes

    try {
      await query(
        `INSERT INTO mfa_challenge_sessions 
         (session_nonce, user_id, user_type, project_id, environment_id, allowed_factors, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
        [sessionNonce, userId, userType, projectId, environmentId, JSON.stringify(allowedFactors), expiresAt.toISOString()]
      );
    } catch (err: any) {
      if (config.env === 'production') {
        throw new Error(`SECURITY_STORE_UNAVAILABLE: Failed to store MFA challenge session - ${err.message}`);
      }
      unitTestMockChallengeStore.set(sessionNonce, {
        user_id: userId,
        user_type: userType,
        project_id: projectId,
        environment_id: environmentId,
        allowed_factors: allowedFactors,
        consumed_at: null,
        expires_at: expiresAt.getTime(),
      });
    }

    const token = jwt.sign(
      {
        sub: userId,
        type: 'mfa_challenge',
        nonce: sessionNonce,
        userType,
        projectId,
        environmentId,
        allowedFactors,
      },
      config.jwt.secret,
      { expiresIn: '3m' }
    );

    return token;
  }

  /**
   * Atomically consumes a challenge session nonce.
   * Throws if expired, replayed, or invalid. (Zero replay tolerance).
   */
  public static async consumeChallengeSession(sessionNonce: string): Promise<{
    userId: string;
    userType: 'app_user' | 'developer';
    projectId: string;
    environmentId: string;
    allowedFactors: ('totp' | 'passkey')[];
  }> {
    let row: any = null;

    try {
      const res = await query<{
        user_id: string;
        user_type: 'app_user' | 'developer';
        project_id: string;
        environment_id: string;
        allowed_factors: any;
      }>(
        `UPDATE mfa_challenge_sessions
         SET consumed_at = NOW()
         WHERE session_nonce = $1 AND consumed_at IS NULL AND expires_at > NOW()
         RETURNING user_id, user_type, project_id, environment_id, allowed_factors`,
        [sessionNonce]
      );

      if (res.rows.length > 0) {
        row = res.rows[0];
      }
    } catch (err: any) {
      if (config.env === 'production') throw err;
    }

    if (!row && config.env !== 'production') {
      const mock = unitTestMockChallengeStore.get(sessionNonce);
      if (mock && !mock.consumed_at && mock.expires_at > Date.now()) {
        mock.consumed_at = Date.now();
        row = mock;
      }
    }

    if (!row) {
      throw new Error('MFA_SESSION_EXPIRED_OR_REPLAYED: Multi-factor challenge session is invalid or has already been used.');
    }

    return {
      userId: row.user_id,
      userType: row.user_type,
      projectId: row.project_id,
      environmentId: row.environment_id,
      allowedFactors: Array.isArray(row.allowed_factors) ? row.allowed_factors : ['totp'],
    };
  }

  // ---------------------------------------------------------------------------
  // APP USER TOTP METHODS
  // ---------------------------------------------------------------------------

  /**
   * Generates a new TOTP enrollment secret, QR code URI, and backup codes for a user.
   */
  public static async enrollTotp(
    userId: string,
    email: string,
    issuer = 'Syntrabase'
  ): Promise<TotpEnrollmentResult> {
    const secretBytes = crypto.randomBytes(20);
    const secretBase32 = base32Encode(secretBytes);

    // Generate 8 backup codes (8 alphanumeric characters each)
    const rawBackupCodes: string[] = [];
    const hashedBackupCodes: string[] = [];

    for (let i = 0; i < 8; i++) {
      const code = crypto.randomBytes(4).toString('hex').toUpperCase(); // 8 hex chars
      rawBackupCodes.push(code);
      hashedBackupCodes.push(crypto.createHash('sha256').update(code).digest('hex'));
    }

    // Encrypt the secret using AES-256-GCM
    const encryptedSecret = EmailService.encryptCredentials({ secret: secretBase32 });

    try {
      await query(
        `INSERT INTO app_user_mfa (user_id, factor_type, secret_encrypted, backup_codes, verified)
         VALUES ($1, 'totp', $2::jsonb, $3::jsonb, FALSE)
         ON CONFLICT (user_id, factor_type)
         DO UPDATE SET secret_encrypted = $2::jsonb, backup_codes = $3::jsonb, verified = FALSE, enrolled_at = NOW()`,
        [userId, JSON.stringify(encryptedSecret), JSON.stringify(hashedBackupCodes)]
      );
    } catch (err: any) {
      if (config.env === 'production') {
        throw new Error(`SECURITY_STORE_UNAVAILABLE: Failed to persist TOTP enrollment - ${err.message}`);
      }
      unitTestMockMfaStore.set(`app_user:${userId}:totp`, {
        id: `mock_factor_${Date.now()}`,
        secret_encrypted: encryptedSecret,
        backup_codes: hashedBackupCodes,
        verified: false,
      });
    }

    const encodedIssuer = encodeURIComponent(issuer);
    const encodedEmail = encodeURIComponent(email);
    const otpauthUrl = `otpauth://totp/${encodedIssuer}:${encodedEmail}?secret=${secretBase32}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=30`;

    const qrCodeUrl = await QRCode.toDataURL(otpauthUrl, {
      errorCorrectionLevel: 'M',
      width: 240,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
    });

    return {
      secret: secretBase32,
      otpauthUrl,
      qrCodeUrl,
      backupCodes: rawBackupCodes,
    };
  }

  /**
   * Verifies an initial TOTP code to confirm and activate MFA on the user account.
   */
  public static async verifyAndActivateTotp(userId: string, token: string): Promise<TotpVerifyResult> {
    let encryptedSecretData: any = null;
    let factorId = '';
    let backupCodes: string[] = [];

    try {
      const res = await query<any>(
        'SELECT id, secret_encrypted, backup_codes FROM app_user_mfa WHERE user_id = $1 AND factor_type = $2',
        [userId, 'totp']
      );
      if (res.rows.length > 0) {
        factorId = res.rows[0].id;
        encryptedSecretData = res.rows[0].secret_encrypted;
        backupCodes = res.rows[0].backup_codes || [];
      }
    } catch (err: any) {
      if (config.env === 'production') throw err;
    }

    if (!encryptedSecretData && config.env !== 'production') {
      const mock = unitTestMockMfaStore.get(`app_user:${userId}:totp`);
      if (mock) {
        factorId = mock.id;
        encryptedSecretData = mock.secret_encrypted;
        backupCodes = mock.backup_codes || [];
      }
    }

    if (!encryptedSecretData) {
      throw new Error('No pending TOTP enrollment found for user');
    }

    const decrypted = EmailService.decryptCredentials(encryptedSecretData);
    const secretBase32 = decrypted.secret;
    let isValid = this.verifyTotpCode(secretBase32, token.trim());

    if (!isValid && backupCodes.length > 0) {
      const hash = crypto.createHash('sha256').update(token.trim().toUpperCase()).digest('hex');
      const codeIndex = backupCodes.indexOf(hash);
      if (codeIndex !== -1) {
        isValid = true;
        backupCodes.splice(codeIndex, 1);
      }
    }

    if (!isValid) {
      throw new Error('Invalid verification code. Please check your authenticator app clock or enter a valid backup code.');
    }

    try {
      await query(
        'UPDATE app_user_mfa SET verified = TRUE, backup_codes = $1::jsonb, last_used_at = NOW() WHERE id = $2',
        [JSON.stringify(backupCodes), factorId]
      );
    } catch (err: any) {
      if (config.env === 'production') throw err;
    }

    if (config.env !== 'production') {
      const mock = unitTestMockMfaStore.get(`app_user:${userId}:totp`);
      if (mock) {
        mock.verified = true;
        mock.backup_codes = backupCodes;
      }
    }

    return { verified: true, factorId };
  }

  /**
   * Validates a TOTP challenge during sign-in using either a 6-digit TOTP code or an 8-char backup code.
   * Strictly returns false if factor is missing, unverified, or incorrect. (Fail Closed).
   */
  public static async validateTotpChallenge(userId: string, tokenOrBackupCode: string): Promise<boolean> {
    if (!tokenOrBackupCode || !userId) return false;

    try {
      let row: any = null;

      try {
        const res = await query<any>(
          'SELECT id, secret_encrypted, backup_codes, verified FROM app_user_mfa WHERE user_id = $1 AND factor_type = $2',
          [userId, 'totp']
        );
        if (res.rows.length > 0) {
          row = res.rows[0];
        }
      } catch (err) {
        if (config.env === 'production') return false;
      }

      if (!row && config.env !== 'production') {
        row = unitTestMockMfaStore.get(`app_user:${userId}:totp`);
      }

      if (!row || !row.verified) return false;

      // 1. Check if token is 6-digit TOTP
      if (/^[0-9]{6}$/.test(tokenOrBackupCode.trim())) {
        const decrypted = EmailService.decryptCredentials(row.secret_encrypted);
        const isValid = this.verifyTotpCode(decrypted.secret, tokenOrBackupCode.trim());
        if (isValid) {
          await query('UPDATE app_user_mfa SET last_used_at = NOW() WHERE id = $1', [row.id]).catch(() => {});
          return true;
        }
      }

      // 2. Check if token is one of the single-use backup recovery codes
      const hash = crypto.createHash('sha256').update(tokenOrBackupCode.trim().toUpperCase()).digest('hex');
      const backupCodes: string[] = row.backup_codes || [];
      const codeIndex = backupCodes.indexOf(hash);

      if (codeIndex !== -1) {
        backupCodes.splice(codeIndex, 1);
        try {
          await query(
            'UPDATE app_user_mfa SET backup_codes = $1::jsonb, last_used_at = NOW() WHERE id = $2',
            [JSON.stringify(backupCodes), row.id]
          );
        } catch (err) {
          if (config.env === 'production') throw err;
        }
        return true;
      }

      return false;
    } catch {
      return false; // Fail closed
    }
  }

  // ---------------------------------------------------------------------------
  // DEVELOPER CONSOLE TOTP METHODS
  // ---------------------------------------------------------------------------

  public static async enrollDeveloperTotp(
    developerId: string,
    email: string,
    issuer = 'Syntrabase Console'
  ): Promise<TotpEnrollmentResult> {
    const secretBytes = crypto.randomBytes(20);
    const secretBase32 = base32Encode(secretBytes);

    const rawBackupCodes: string[] = [];
    const hashedBackupCodes: string[] = [];

    for (let i = 0; i < 8; i++) {
      const code = crypto.randomBytes(4).toString('hex').toUpperCase();
      rawBackupCodes.push(code);
      hashedBackupCodes.push(crypto.createHash('sha256').update(code).digest('hex'));
    }

    const encryptedSecret = EmailService.encryptCredentials({ secret: secretBase32 });

    try {
      await query(
        `INSERT INTO developer_mfa (developer_id, factor_type, secret_encrypted, backup_codes, verified)
         VALUES ($1, 'totp', $2::jsonb, $3::jsonb, FALSE)
         ON CONFLICT (developer_id, factor_type)
         DO UPDATE SET secret_encrypted = $2::jsonb, backup_codes = $3::jsonb, verified = FALSE, enrolled_at = NOW()`,
        [developerId, JSON.stringify(encryptedSecret), JSON.stringify(hashedBackupCodes)]
      );
    } catch (err: any) {
      if (config.env === 'production') {
        throw new Error(`SECURITY_STORE_UNAVAILABLE: Failed to persist developer TOTP - ${err.message}`);
      }
      unitTestMockMfaStore.set(`developer:${developerId}:totp`, {
        id: `mock_dev_factor_${Date.now()}`,
        secret_encrypted: encryptedSecret,
        backup_codes: hashedBackupCodes,
        verified: false,
      });
    }

    const encodedIssuer = encodeURIComponent(issuer);
    const encodedEmail = encodeURIComponent(email);
    const otpauthUrl = `otpauth://totp/${encodedIssuer}:${encodedEmail}?secret=${secretBase32}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=30`;

    const qrCodeUrl = await QRCode.toDataURL(otpauthUrl, {
      errorCorrectionLevel: 'M',
      width: 240,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
    });

    return {
      secret: secretBase32,
      otpauthUrl,
      qrCodeUrl,
      backupCodes: rawBackupCodes,
    };
  }

  public static async verifyAndActivateDeveloperTotp(developerId: string, token: string): Promise<TotpVerifyResult> {
    let encryptedSecretData: any = null;
    let factorId = '';
    let backupCodes: string[] = [];

    try {
      const res = await query<any>(
        'SELECT id, secret_encrypted, backup_codes FROM developer_mfa WHERE developer_id = $1 AND factor_type = $2',
        [developerId, 'totp']
      );
      if (res.rows.length > 0) {
        factorId = res.rows[0].id;
        encryptedSecretData = res.rows[0].secret_encrypted;
        backupCodes = res.rows[0].backup_codes || [];
      }
    } catch (err: any) {
      if (config.env === 'production') throw err;
    }

    if (!encryptedSecretData && config.env !== 'production') {
      const mock = unitTestMockMfaStore.get(`developer:${developerId}:totp`);
      if (mock) {
        factorId = mock.id;
        encryptedSecretData = mock.secret_encrypted;
        backupCodes = mock.backup_codes || [];
      }
    }

    if (!encryptedSecretData) {
      throw new Error('No pending TOTP enrollment found for developer');
    }

    const decrypted = EmailService.decryptCredentials(encryptedSecretData);
    const secretBase32 = decrypted.secret;
    let isValid = this.verifyTotpCode(secretBase32, token.trim());

    if (!isValid && backupCodes.length > 0) {
      const hash = crypto.createHash('sha256').update(token.trim().toUpperCase()).digest('hex');
      const codeIndex = backupCodes.indexOf(hash);
      if (codeIndex !== -1) {
        isValid = true;
        backupCodes.splice(codeIndex, 1);
      }
    }

    if (!isValid) {
      throw new Error('Invalid verification code. Please check your authenticator app clock or enter a valid backup code.');
    }

    try {
      await query(
        'UPDATE developer_mfa SET verified = TRUE, backup_codes = $1::jsonb, last_used_at = NOW() WHERE id = $2',
        [JSON.stringify(backupCodes), factorId]
      );
    } catch (err: any) {
      if (config.env === 'production') throw err;
    }

    if (config.env !== 'production') {
      const mock = unitTestMockMfaStore.get(`developer:${developerId}:totp`);
      if (mock) {
        mock.verified = true;
        mock.backup_codes = backupCodes;
      }
    }

    return { verified: true, factorId };
  }

  public static async validateDeveloperTotpChallenge(developerId: string, tokenOrBackupCode: string): Promise<boolean> {
    if (!tokenOrBackupCode || !developerId) return false;

    try {
      let row: any = null;

      try {
        const res = await query<any>(
          'SELECT id, secret_encrypted, backup_codes, verified FROM developer_mfa WHERE developer_id = $1 AND factor_type = $2',
          [developerId, 'totp']
        );
        if (res.rows.length > 0) {
          row = res.rows[0];
        }
      } catch (err) {
        if (config.env === 'production') return false;
      }

      if (!row && config.env !== 'production') {
        row = unitTestMockMfaStore.get(`developer:${developerId}:totp`);
      }

      if (!row || !row.verified) return false;

      if (/^[0-9]{6}$/.test(tokenOrBackupCode.trim())) {
        const decrypted = EmailService.decryptCredentials(row.secret_encrypted);
        const isValid = this.verifyTotpCode(decrypted.secret, tokenOrBackupCode.trim());
        if (isValid) {
          await query('UPDATE developer_mfa SET last_used_at = NOW() WHERE id = $1', [row.id]).catch(() => {});
          return true;
        }
      }

      const hash = crypto.createHash('sha256').update(tokenOrBackupCode.trim().toUpperCase()).digest('hex');
      const backupCodes: string[] = row.backup_codes || [];
      const codeIndex = backupCodes.indexOf(hash);

      if (codeIndex !== -1) {
        backupCodes.splice(codeIndex, 1);
        try {
          await query(
            'UPDATE developer_mfa SET backup_codes = $1::jsonb, last_used_at = NOW() WHERE id = $2',
            [JSON.stringify(backupCodes), row.id]
          );
        } catch (err) {
          if (config.env === 'production') throw err;
        }
        return true;
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * Verifies TOTP code checking current window, t-1, and t+1 (90s window tolerance).
   */
  public static verifyTotpCode(secretBase32: string, token: string): boolean {
    const secretBuffer = base32Decode(secretBase32);
    const currentCounter = Math.floor(Date.now() / 1000 / 30);

    for (const offset of [0, -1, 1]) {
      const computed = computeTotpCode(secretBuffer, currentCounter + offset);
      if (computed === token) {
        return true;
      }
    }

    return false;
  }

  public static async isTotpEnrolled(userId: string): Promise<boolean> {
    try {
      const res = await query<{ verified: boolean }>(
        'SELECT verified FROM app_user_mfa WHERE user_id = $1 AND factor_type = $2 AND verified = TRUE',
        [userId, 'totp']
      );
      if (res.rows.length > 0) return true;
    } catch {
      if (config.env === 'production') return false;
    }
    if (config.env !== 'production') {
      const mock = unitTestMockMfaStore.get(`app_user:${userId}:totp`);
      if (mock?.verified) return true;
    }
    return false;
  }

  public static async isDeveloperTotpEnrolled(developerId: string): Promise<boolean> {
    try {
      const res = await query<{ verified: boolean }>(
        'SELECT verified FROM developer_mfa WHERE developer_id = $1 AND factor_type = $2 AND verified = TRUE',
        [developerId, 'totp']
      );
      if (res.rows.length > 0) return true;
    } catch {
      if (config.env === 'production') return false;
    }
    if (config.env !== 'production') {
      const mock = unitTestMockMfaStore.get(`developer:${developerId}:totp`);
      if (mock?.verified) return true;
    }
    return false;
  }

  public static async disableTotp(userId: string): Promise<void> {
    await query('DELETE FROM app_user_mfa WHERE user_id = $1 AND factor_type = $2', [userId, 'totp']);
    if (config.env !== 'production') {
      unitTestMockMfaStore.delete(`app_user:${userId}:totp`);
    }
  }

  public static async disableDeveloperTotp(developerId: string): Promise<void> {
    await query('DELETE FROM developer_mfa WHERE developer_id = $1 AND factor_type = $2', [developerId, 'totp']);
    if (config.env !== 'production') {
      unitTestMockMfaStore.delete(`developer:${developerId}:totp`);
    }
  }
}
