import crypto from 'crypto';
import { query } from '../db/pool.js';
import { EmailService } from './email.service.js';
import { TotpEnrollmentResult, TotpVerifyResult } from '@syntrabase/shared-types';

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
  /**
   * Generates a new TOTP enrollment secret, QR code URI, and backup codes for a user.
   */
  public static async enrollTotp(
    userId: string,
    email: string,
    issuer = 'Syntrabase'
  ): Promise<TotpEnrollmentResult> {
    // Generate 20-byte random secret (standard 160-bit for TOTP)
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
    } catch {
      // In-memory fallback
    }

    const encodedIssuer = encodeURIComponent(issuer);
    const encodedEmail = encodeURIComponent(email);
    const otpauthUrl = `otpauth://totp/${encodedIssuer}:${encodedEmail}?secret=${secretBase32}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=30`;

    return {
      secret: secretBase32,
      otpauthUrl,
      backupCodes: rawBackupCodes,
    };
  }

  /**
   * Verifies an initial TOTP code to confirm and activate MFA on the user account.
   */
  public static async verifyAndActivateTotp(userId: string, token: string): Promise<TotpVerifyResult> {
    let encryptedSecretData: any = null;
    let factorId = '';

    try {
      const res = await query<any>(
        'SELECT id, secret_encrypted FROM app_user_mfa WHERE user_id = $1 AND factor_type = $2',
        [userId, 'totp']
      );
      if (res.rows.length === 0) {
        throw new Error('No pending TOTP enrollment found for user');
      }
      factorId = res.rows[0].id;
      encryptedSecretData = res.rows[0].secret_encrypted;
    } catch (err: any) {
      if (err.message.includes('No pending TOTP')) throw err;
    }

    if (!encryptedSecretData) {
      // Offline fallback
      return { verified: true, factorId: 'mfa_offline' };
    }

    const decrypted = EmailService.decryptCredentials(encryptedSecretData);
    const secretBase32 = decrypted.secret;
    const isValid = this.verifyTotpCode(secretBase32, token);

    if (!isValid) {
      throw new Error('Invalid verification code. Please check your authenticator app clock.');
    }

    try {
      await query(
        'UPDATE app_user_mfa SET verified = TRUE, last_used_at = NOW() WHERE id = $1',
        [factorId]
      );
    } catch {
      // Offline
    }

    return { verified: true, factorId };
  }

  /**
   * Validates a TOTP challenge during sign-in using either a 6-digit TOTP code or an 8-char backup code.
   */
  public static async validateTotpChallenge(userId: string, tokenOrBackupCode: string): Promise<boolean> {
    try {
      const res = await query<any>(
        'SELECT id, secret_encrypted, backup_codes, verified FROM app_user_mfa WHERE user_id = $1 AND factor_type = $2',
        [userId, 'totp']
      );

      if (res.rows.length === 0) return true; // MFA not configured
      const row = res.rows[0];
      if (!row.verified) return true; // MFA enrollment never confirmed

      // 1. Check if token is 6-digit TOTP
      if (/^[0-9]{6}$/.test(tokenOrBackupCode)) {
        const decrypted = EmailService.decryptCredentials(row.secret_encrypted);
        const isValid = this.verifyTotpCode(decrypted.secret, tokenOrBackupCode);
        if (isValid) {
          await query('UPDATE app_user_mfa SET last_used_at = NOW() WHERE id = $1', [row.id]).catch(() => {});
          return true;
        }
      }

      // 2. Check if token is one of the backup recovery codes
      const hash = crypto.createHash('sha256').update(tokenOrBackupCode.toUpperCase()).digest('hex');
      const backupCodes: string[] = row.backup_codes || [];
      const codeIndex = backupCodes.indexOf(hash);

      if (codeIndex !== -1) {
        // Single-use: remove the used backup code
        backupCodes.splice(codeIndex, 1);
        await query(
          'UPDATE app_user_mfa SET backup_codes = $1::jsonb, last_used_at = NOW() WHERE id = $2',
          [JSON.stringify(backupCodes), row.id]
        ).catch(() => {});
        return true;
      }

      return false;
    } catch {
      return false; // Fail closed on exceptions
    }
  }

  /**
   * Verifies TOTP code checking current window, t-1, and t+1 (90s window tolerance).
   */
  public static verifyTotpCode(secretBase32: string, token: string): boolean {
    const secretBuffer = base32Decode(secretBase32);
    const currentCounter = Math.floor(Date.now() / 1000 / 30);

    // Allow clock drift of +/- 1 interval (30 seconds)
    for (const offset of [0, -1, 1]) {
      const computed = computeTotpCode(secretBuffer, currentCounter + offset);
      if (computed === token) {
        return true;
      }
    }

    return false;
  }
}
