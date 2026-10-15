import crypto from 'crypto';
import { query } from '../db/pool.js';
import { CryptoUtil } from '../utils/crypto.js';
import { AuditService } from './audit.service.js';
import { ApiCredential, CredentialType } from '@syntrabase/shared-types';

export class CredentialService {
  /**
   * Generates a new API credential.
   * If secret, the raw secret is returned ONCE and never stored in plaintext.
   */
  public static async createCredential(params: {
    projectId: string;
    environmentId: string;
    name: string;
    type: CredentialType;
    allowedOrigins?: string[];
    scopes?: string[];
    actorId: string;
  }): Promise<{ credential: ApiCredential; secretKeyPlain?: string }> {
    const rawRandom = CryptoUtil.generateSecureToken(24);
    const prefix = params.type === 'publishable' ? 'pk_live_' : 'sk_live_';
    const keyIdentifier = `${prefix}${rawRandom}`;

    let hashedSecret: string | null = null;
    let secretKeyPlain: string | undefined = undefined;

    if (params.type === 'secret') {
      const rawSecretPart = CryptoUtil.generateSecureToken(32);
      secretKeyPlain = `${keyIdentifier}_${rawSecretPart}`;
      hashedSecret = CryptoUtil.sha256(secretKeyPlain);
    }

    const res = await query<ApiCredential>(
      `INSERT INTO api_credentials (
        project_id, environment_id, name, type, key_prefix, key_identifier,
        hashed_secret, allowed_origins, scopes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id, project_id as "projectId", environment_id as "environmentId",
                name, type, key_prefix as "keyPrefix", key_identifier as "keyIdentifier",
                allowed_origins as "allowedOrigins", scopes, revoked, created_at as "createdAt"`,
      [
        params.projectId,
        params.environmentId,
        params.name,
        params.type,
        prefix,
        keyIdentifier,
        hashedSecret,
        params.allowedOrigins || [],
        params.scopes || ['read', 'write'],
      ]
    );

    const credential = res.rows[0];

    await AuditService.log({
      actorId: params.actorId,
      actorType: 'developer',
      action: 'credential.created',
      targetResource: `credential:${credential.id}`,
      projectId: params.projectId,
      payload: { name: params.name, type: params.type, keyIdentifier },
    });

    return { credential, secretKeyPlain };
  }

  /**
   * Validates an API credential from an incoming request header.
   */
  public static async validateCredential(
    rawKey: string,
    requestOrigin?: string
  ): Promise<{ valid: boolean; credential?: ApiCredential; error?: string }> {
    if (!rawKey) return { valid: false, error: 'Missing API key' };

    const isSecret = rawKey.startsWith('sk_live_');
    const isPublishable = rawKey.startsWith('pk_live_');

    if (!isSecret && !isPublishable) {
      return { valid: false, error: 'Malformed API key format' };
    }

    // Extract identifier: for secret keys, identifier is before the underscore separator
    const keyIdentifier = isSecret ? rawKey.slice(0, rawKey.lastIndexOf('_')) : rawKey;

    const res = await query<{
      id: string;
      project_id: string;
      environment_id: string;
      name: string;
      type: CredentialType;
      key_prefix: string;
      key_identifier: string;
      hashed_secret: string | null;
      allowed_origins: string[];
      scopes: string[];
      revoked: boolean;
      expires_at: string | null;
      last_used_at: string | null;
      created_at: string;
    }>('SELECT * FROM api_credentials WHERE key_identifier = $1', [keyIdentifier]);

    const cred = res.rows[0];
    if (!cred || cred.revoked) {
      return { valid: false, error: 'Invalid or revoked API key' };
    }

    if (cred.expires_at && new Date(cred.expires_at) < new Date()) {
      return { valid: false, error: 'API key has expired' };
    }

    // For secret keys, verify hash with timingSafeEqual
    if (isSecret) {
      const computedHash = CryptoUtil.sha256(rawKey);
      if (
        !cred.hashed_secret ||
        computedHash.length !== cred.hashed_secret.length ||
        !crypto.timingSafeEqual(Buffer.from(computedHash, 'utf8'), Buffer.from(cred.hashed_secret, 'utf8'))
      ) {
        return { valid: false, error: 'Invalid secret key' };
      }
    }

    // For publishable keys, verify origin if restricted
    if (isPublishable && cred.allowed_origins.length > 0) {
      if (!requestOrigin) {
        return { valid: false, error: 'Origin header required for restricted publishable key' };
      }
      let reqOriginParsed: string;
      try {
        reqOriginParsed = new URL(requestOrigin).origin.toLowerCase();
      } catch {
        return { valid: false, error: 'Invalid origin header' };
      }

      const originAllowed = cred.allowed_origins.some((allowed) => {
        try {
          const allowedParsed = new URL(allowed).origin.toLowerCase();
          return reqOriginParsed === allowedParsed;
        } catch {
          return reqOriginParsed === allowed.toLowerCase();
        }
      });
      if (!originAllowed) {
        return { valid: false, error: 'Origin not allowed by key policy' };
      }
    }

    // Update last_used_at asynchronously
    query('UPDATE api_credentials SET last_used_at = NOW() WHERE id = $1', [cred.id]).catch(() => {});

    return {
      valid: true,
      credential: {
        id: cred.id,
        projectId: cred.project_id,
        environmentId: cred.environment_id,
        name: cred.name,
        type: cred.type,
        keyPrefix: cred.key_prefix,
        keyIdentifier: cred.key_identifier,
        allowedOrigins: cred.allowed_origins,
        scopes: cred.scopes,
        revoked: cred.revoked,
        expiresAt: cred.expires_at || undefined,
        lastUsedAt: cred.last_used_at || undefined,
        createdAt: cred.created_at,
      },
    };
  }

  /**
   * Revokes an API credential immediately.
   */
  public static async revokeCredential(id: string, actorId: string): Promise<void> {
    await query('UPDATE api_credentials SET revoked = TRUE WHERE id = $1', [id]);
    await AuditService.log({
      actorId,
      actorType: 'developer',
      action: 'credential.revoked',
      targetResource: `credential:${id}`,
    });
  }
}
