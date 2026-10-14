import crypto from 'crypto';
import { config } from '../config.js';

export class CryptoUtil {
  /**
   * Hashes a password using scrypt with salt and pepper.
   */
  public static async hashPassword(password: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const salt = crypto.randomBytes(16).toString('hex');
      const peppered = password + config.security.passwordPepper;
      crypto.scrypt(peppered, salt, 64, { N: 16384, r: 8, p: 1 }, (err, derivedKey) => {
        if (err) return reject(err);
        resolve(`${salt}:${derivedKey.toString('hex')}`);
      });
    });
  }

  /**
   * Verifies a password against a stored salt:hash string using constant-time comparison.
   */
  public static async verifyPassword(password: string, storedHash: string): Promise<boolean> {
    return new Promise((resolve) => {
      const [salt, key] = storedHash.split(':');
      if (!salt || !key) return resolve(false);

      const peppered = password + config.security.passwordPepper;
      crypto.scrypt(peppered, salt, 64, { N: 16384, r: 8, p: 1 }, (err, derivedKey) => {
        if (err) return resolve(false);
        const keyBuffer = Buffer.from(key, 'hex');
        if (keyBuffer.length !== derivedKey.length) return resolve(false);
        resolve(crypto.timingSafeEqual(keyBuffer, derivedKey));
      });
    });
  }

  /**
   * Generates a cryptographically secure random token.
   */
  public static generateSecureToken(byteLength = 32): string {
    return crypto.randomBytes(byteLength).toString('hex');
  }

  /**
   * Computes SHA-256 hash.
   */
  public static sha256(data: string | Buffer): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Computes HMAC-SHA256.
   */
  public static hmacSha256(data: string, secret = config.security.auditHmacSecret): string {
    return crypto.createHmac('sha256', secret).update(data).digest('hex');
  }

  /**
   * Encrypts plaintext using AES-256-GCM.
   */
  public static encryptAesGcm(plaintext: string, keyHex: string): { iv: string; ciphertext: string; tag: string } {
    const key = Buffer.from(keyHex, 'hex');
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
    ciphertext += cipher.final('hex');
    const tag = cipher.getAuthTag().toString('hex');

    return {
      iv: iv.toString('hex'),
      ciphertext,
      tag,
    };
  }

  /**
   * Decrypts ciphertext using AES-256-GCM.
   */
  public static decryptAesGcm(ciphertextHex: string, keyHex: string, ivHex: string, tagHex: string): string {
    const key = Buffer.from(keyHex, 'hex');
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    let plaintext = decipher.update(ciphertextHex, 'hex', 'utf8');
    plaintext += decipher.final('utf8');
    return plaintext;
  }
}
