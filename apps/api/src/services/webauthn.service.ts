import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
} from '@simplewebauthn/server';
import crypto from 'crypto';
import { query } from '../db/pool.js';
import { PasskeyRecord } from '@syntrabase/shared-types';

const RP_NAME = process.env.WEBAUTHN_RP_NAME || 'Syntrabase Cloud';
const RP_ID = process.env.WEBAUTHN_RP_ID || 'localhost';
const EXPECTED_ORIGINS = (process.env.WEBAUTHN_ORIGINS || 'http://localhost:3000,http://localhost:3001,http://localhost:5000')
  .split(',')
  .map((s) => s.trim());

// In-flight challenges store (challenge string -> { userId, projectScope, expiresAt })
const challengeStore = new Map<string, { userId: string; userType: 'app_user' | 'developer'; expiresAt: number }>();

function cleanExpiredChallenges() {
  const now = Date.now();
  for (const [key, val] of challengeStore.entries()) {
    if (val.expiresAt < now) {
      challengeStore.delete(key);
    }
  }
}

function extractChallengeFromClientData(clientDataJSONBase64Url?: string): string | null {
  if (!clientDataJSONBase64Url) return null;
  try {
    const raw = Buffer.from(clientDataJSONBase64Url, 'base64url').toString('utf-8');
    const parsed = JSON.parse(raw);
    return typeof parsed.challenge === 'string' ? parsed.challenge : null;
  } catch {
    return null;
  }
}

export class WebAuthnService {
  public static getRpId(): string {
    return RP_ID;
  }

  public static getExpectedOrigins(): string[] {
    return EXPECTED_ORIGINS;
  }

  // ---------------------------------------------------------------------------
  // APP USER PASSKEYS (TENANT-SCOPED)
  // ---------------------------------------------------------------------------

  /**
   * Generates WebAuthn registration options for an application user.
   */
  public static async getAppUserRegistrationOptions(
    userId: string,
    email: string,
    projectId: string
  ) {
    cleanExpiredChallenges();

    // Query existing passkeys to exclude already registered credentials
    const existingRes = await query<{ credential_id: string }>(
      'SELECT credential_id FROM app_user_passkeys WHERE user_id = $1 AND project_id = $2',
      [userId, projectId]
    ).catch(() => ({ rows: [] }));

    const excludeCredentials = existingRes.rows.map((row) => ({
      id: row.credential_id,
      transports: ['internal', 'hybrid'] as any,
    }));

    const options = await generateRegistrationOptions({
      rpName: `${RP_NAME} (${projectId})`,
      rpID: RP_ID,
      userID: Buffer.from(userId, 'utf-8'),
      userName: email,
      userDisplayName: email.split('@')[0],
      attestationType: 'none',
      excludeCredentials,
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
    });

    challengeStore.set(options.challenge, {
      userId,
      userType: 'app_user',
      expiresAt: Date.now() + 5 * 60 * 1000,
    });

    return options;
  }

  /**
   * Verifies WebAuthn registration response and securely registers the passkey in PostgreSQL.
   * Fail-Closed: throws if authoritative storage is unavailable.
   */
  public static async verifyAppUserRegistration(
    userId: string,
    projectId: string,
    response: RegistrationResponseJSON,
    deviceName = 'Security Key'
  ): Promise<PasskeyRecord> {
    cleanExpiredChallenges();

    // Find in-flight challenge matching clientDataJSON
    const clientChallenge = extractChallengeFromClientData(response.response?.clientDataJSON);
    let challengeMatch: string | null = null;

    if (clientChallenge && challengeStore.has(clientChallenge)) {
      const data = challengeStore.get(clientChallenge)!;
      if (data.userId === userId && data.userType === 'app_user') {
        challengeMatch = clientChallenge;
        challengeStore.delete(clientChallenge);
      }
    }

    if (!challengeMatch) {
      for (const [storedChallenge, data] of challengeStore.entries()) {
        if (data.userId === userId && data.userType === 'app_user') {
          challengeMatch = storedChallenge;
          challengeStore.delete(storedChallenge);
          break;
        }
      }
    }

    if (!challengeMatch) {
      throw new Error('Registration challenge not found or expired. Please retry passkey enrollment.');
    }

    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: challengeMatch,
      expectedOrigin: EXPECTED_ORIGINS,
      expectedRPID: RP_ID,
      requireUserVerification: false,
    });

    if (!verification.verified || !verification.registrationInfo) {
      throw new Error('WebAuthn attestation verification failed');
    }

    const { credential } = verification.registrationInfo;
    const credentialId = credential.id;
    const publicKeyBase64 = Buffer.from(credential.publicKey).toString('base64');
    const counter = credential.counter;
    const aaguid = verification.registrationInfo.aaguid || null;

    try {
      const insertRes = await query<{
        id: string;
        credential_id: string;
        device_name: string;
        created_at: string;
        aaguid: string;
      }>(
        `INSERT INTO app_user_passkeys 
         (user_id, project_id, credential_id, public_key_spki, counter, device_name, aaguid, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
         RETURNING id, credential_id, device_name, created_at, aaguid`,
        [userId, projectId, credentialId, publicKeyBase64, counter, deviceName, aaguid]
      );

      const row = insertRes.rows[0];
      return {
        id: row.id,
        credentialId: row.credential_id,
        deviceName: row.device_name,
        createdAt: row.created_at,
        aaguid: row.aaguid,
      };
    } catch (err: any) {
      if (err.code === '23505') {
        throw new Error('This passkey is already registered to an account.');
      }
      throw new Error(`SECURITY_STORE_UNAVAILABLE: Failed to persist passkey credential - ${err.message}`);
    }
  }

  /**
   * Generates authentication options for passwordless passkey sign-in.
   */
  public static async getAppUserAuthenticationOptions(projectId: string, email?: string) {
    cleanExpiredChallenges();

    let allowCredentials: { id: string }[] | undefined = undefined;

    if (email) {
      const userRes = await query<{ id: string }>(
        'SELECT id FROM app_users WHERE project_id = $1 AND email = $2',
        [projectId, email]
      );
      if (userRes.rows.length > 0) {
        const passkeysRes = await query<{ credential_id: string }>(
          'SELECT credential_id FROM app_user_passkeys WHERE user_id = $1 AND project_id = $2',
          [userRes.rows[0].id, projectId]
        );
        allowCredentials = passkeysRes.rows.map((r) => ({ id: r.credential_id }));
      }
    }

    const options = await generateAuthenticationOptions({
      rpID: RP_ID,
      allowCredentials,
      userVerification: 'preferred',
    });

    challengeStore.set(options.challenge, {
      userId: email || 'anonymous_passkey_probe',
      userType: 'app_user',
      expiresAt: Date.now() + 5 * 60 * 1000,
    });

    return options;
  }

  /**
   * Verifies an authentication response (assertion) for passwordless passkey sign-in.
   */
  public static async verifyAppUserAuthentication(
    projectId: string,
    response: AuthenticationResponseJSON
  ): Promise<{ userId: string; email: string }> {
    cleanExpiredChallenges();

    // 1. Locate registered credential
    const credRes = await query<{
      id: string;
      user_id: string;
      public_key_spki: string;
      counter: string;
      email: string;
    }>(
      `SELECT p.id, p.user_id, p.public_key_spki, p.counter, u.email
       FROM app_user_passkeys p
       JOIN app_users u ON u.id = p.user_id
       WHERE p.credential_id = $1 AND p.project_id = $2`,
      [response.id, projectId]
    );

    if (credRes.rows.length === 0) {
      throw new Error('Passkey credential unrecognized or revoked');
    }

    const passkey = credRes.rows[0];

    // 2. Locate in-flight challenge matching clientDataJSON
    const clientChallenge = extractChallengeFromClientData(response.response?.clientDataJSON);
    let challengeMatch: string | null = null;

    if (clientChallenge && challengeStore.has(clientChallenge)) {
      const data = challengeStore.get(clientChallenge)!;
      if (data.userType === 'app_user') {
        challengeMatch = clientChallenge;
        challengeStore.delete(clientChallenge);
      }
    }

    if (!challengeMatch) {
      for (const [storedChallenge, data] of challengeStore.entries()) {
        if (data.userType === 'app_user') {
          challengeMatch = storedChallenge;
          challengeStore.delete(storedChallenge);
          break;
        }
      }
    }

    if (!challengeMatch) {
      throw new Error('Authentication challenge expired or invalid');
    }

    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challengeMatch,
      expectedOrigin: EXPECTED_ORIGINS,
      expectedRPID: RP_ID,
      credential: {
        id: response.id,
        publicKey: Buffer.from(passkey.public_key_spki, 'base64'),
        counter: parseInt(passkey.counter, 10) || 0,
      },
      requireUserVerification: false,
    });

    if (!verification.verified || !verification.authenticationInfo) {
      throw new Error('WebAuthn assertion verification failed');
    }

    // 3. Anti-cloning check passed: update counter and last_used_at in PostgreSQL
    await query(
      'UPDATE app_user_passkeys SET counter = $1, last_used_at = NOW() WHERE id = $2',
      [verification.authenticationInfo.newCounter, passkey.id]
    ).catch(() => {});

    return {
      userId: passkey.user_id,
      email: passkey.email,
    };
  }

  /**
   * Lists registered passkeys for an application user.
   */
  public static async listAppUserPasskeys(userId: string, projectId: string): Promise<PasskeyRecord[]> {
    try {
      const res = await query<{
        id: string;
        credential_id: string;
        device_name: string;
        created_at: string;
        last_used_at?: string;
        aaguid?: string;
      }>(
        `SELECT id, credential_id, device_name, created_at, last_used_at, aaguid
         FROM app_user_passkeys
         WHERE user_id = $1 AND project_id = $2
         ORDER BY created_at DESC`,
        [userId, projectId]
      );

      return res.rows.map((r) => ({
        id: r.id,
        credentialId: r.credential_id,
        deviceName: r.device_name,
        createdAt: r.created_at,
        lastUsedAt: r.last_used_at,
        aaguid: r.aaguid,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Deletes a registered passkey.
   */
  public static async deleteAppUserPasskey(userId: string, projectId: string, passkeyId: string): Promise<void> {
    const res = await query(
      'DELETE FROM app_user_passkeys WHERE id = $1 AND user_id = $2 AND project_id = $3',
      [passkeyId, userId, projectId]
    );
    if ((res as any).rowCount === 0) {
      throw new Error('Passkey not found or already deleted');
    }
  }

  // ---------------------------------------------------------------------------
  // DEVELOPER CONSOLE PASSKEYS (PLATFORM-SCOPED)
  // ---------------------------------------------------------------------------

  public static async getDeveloperRegistrationOptions(developerId: string, email: string) {
    cleanExpiredChallenges();

    const existingRes = await query<{ credential_id: string }>(
      'SELECT credential_id FROM developer_passkeys WHERE developer_id = $1',
      [developerId]
    ).catch(() => ({ rows: [] }));

    const excludeCredentials = existingRes.rows.map((row) => ({
      id: row.credential_id,
      transports: ['internal', 'hybrid'] as any,
    }));

    const options = await generateRegistrationOptions({
      rpName: 'Syntrabase Developer Console',
      rpID: RP_ID,
      userID: Buffer.from(developerId, 'utf-8'),
      userName: email,
      userDisplayName: email.split('@')[0],
      attestationType: 'none',
      excludeCredentials,
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
    });

    challengeStore.set(options.challenge, {
      userId: developerId,
      userType: 'developer',
      expiresAt: Date.now() + 5 * 60 * 1000,
    });

    return options;
  }

  public static async verifyDeveloperRegistration(
    developerId: string,
    response: RegistrationResponseJSON,
    deviceName = 'Developer Passkey'
  ): Promise<PasskeyRecord> {
    cleanExpiredChallenges();

    const clientChallenge = extractChallengeFromClientData(response.response?.clientDataJSON);
    let challengeMatch: string | null = null;

    if (clientChallenge && challengeStore.has(clientChallenge)) {
      const data = challengeStore.get(clientChallenge)!;
      if (data.userId === developerId && data.userType === 'developer') {
        challengeMatch = clientChallenge;
        challengeStore.delete(clientChallenge);
      }
    }

    if (!challengeMatch) {
      for (const [storedChallenge, data] of challengeStore.entries()) {
        if (data.userId === developerId && data.userType === 'developer') {
          challengeMatch = storedChallenge;
          challengeStore.delete(storedChallenge);
          break;
        }
      }
    }

    if (!challengeMatch) {
      throw new Error('Registration challenge not found or expired. Please retry passkey enrollment.');
    }

    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: challengeMatch,
      expectedOrigin: EXPECTED_ORIGINS,
      expectedRPID: RP_ID,
      requireUserVerification: false,
    });

    if (!verification.verified || !verification.registrationInfo) {
      throw new Error('WebAuthn attestation verification failed');
    }

    const { credential } = verification.registrationInfo;
    const credentialId = credential.id;
    const publicKeyBase64 = Buffer.from(credential.publicKey).toString('base64');
    const counter = credential.counter;
    const aaguid = verification.registrationInfo.aaguid || null;

    try {
      const insertRes = await query<{
        id: string;
        credential_id: string;
        device_name: string;
        created_at: string;
        aaguid: string;
      }>(
        `INSERT INTO developer_passkeys 
         (developer_id, credential_id, public_key_spki, counter, device_name, aaguid, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         RETURNING id, credential_id, device_name, created_at, aaguid`,
        [developerId, credentialId, publicKeyBase64, counter, deviceName, aaguid]
      );

      const row = insertRes.rows[0];
      return {
        id: row.id,
        credentialId: row.credential_id,
        deviceName: row.device_name,
        createdAt: row.created_at,
        aaguid: row.aaguid,
      };
    } catch (err: any) {
      if (err.code === '23505') {
        throw new Error('This passkey is already registered.');
      }
      throw new Error(`SECURITY_STORE_UNAVAILABLE: Failed to persist developer passkey - ${err.message}`);
    }
  }

  public static async getDeveloperAuthenticationOptions(email?: string) {
    cleanExpiredChallenges();

    let allowCredentials: { id: string }[] | undefined = undefined;

    if (email) {
      const devRes = await query<{ id: string }>('SELECT id FROM developers WHERE email = $1', [email]);
      if (devRes.rows.length > 0) {
        const passkeysRes = await query<{ credential_id: string }>(
          'SELECT credential_id FROM developer_passkeys WHERE developer_id = $1',
          [devRes.rows[0].id]
        );
        allowCredentials = passkeysRes.rows.map((r) => ({ id: r.credential_id }));
      }
    }

    const options = await generateAuthenticationOptions({
      rpID: RP_ID,
      allowCredentials,
      userVerification: 'preferred',
    });

    challengeStore.set(options.challenge, {
      userId: email || 'anonymous_dev_probe',
      userType: 'developer',
      expiresAt: Date.now() + 5 * 60 * 1000,
    });

    return options;
  }

  public static async verifyDeveloperAuthentication(
    response: AuthenticationResponseJSON
  ): Promise<{ developerId: string; email: string }> {
    cleanExpiredChallenges();

    const credRes = await query<{
      id: string;
      developer_id: string;
      public_key_spki: string;
      counter: string;
      email: string;
    }>(
      `SELECT p.id, p.developer_id, p.public_key_spki, p.counter, d.email
       FROM developer_passkeys p
       JOIN developers d ON d.id = p.developer_id
       WHERE p.credential_id = $1`,
      [response.id]
    );

    if (credRes.rows.length === 0) {
      throw new Error('Developer passkey unrecognized or revoked');
    }

    const passkey = credRes.rows[0];

    const clientChallenge = extractChallengeFromClientData(response.response?.clientDataJSON);
    let challengeMatch: string | null = null;

    if (clientChallenge && challengeStore.has(clientChallenge)) {
      const data = challengeStore.get(clientChallenge)!;
      if (data.userType === 'developer') {
        challengeMatch = clientChallenge;
        challengeStore.delete(clientChallenge);
      }
    }

    if (!challengeMatch) {
      for (const [storedChallenge, data] of challengeStore.entries()) {
        if (data.userType === 'developer') {
          challengeMatch = storedChallenge;
          challengeStore.delete(storedChallenge);
          break;
        }
      }
    }

    if (!challengeMatch) {
      throw new Error('Authentication challenge expired or invalid');
    }

    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challengeMatch,
      expectedOrigin: EXPECTED_ORIGINS,
      expectedRPID: RP_ID,
      credential: {
        id: response.id,
        publicKey: Buffer.from(passkey.public_key_spki, 'base64'),
        counter: parseInt(passkey.counter, 10) || 0,
      },
      requireUserVerification: false,
    });

    if (!verification.verified || !verification.authenticationInfo) {
      throw new Error('Developer WebAuthn assertion verification failed');
    }

    await query('UPDATE developer_passkeys SET counter = $1, last_used_at = NOW() WHERE id = $2', [
      verification.authenticationInfo.newCounter,
      passkey.id,
    ]).catch(() => {});

    return {
      developerId: passkey.developer_id,
      email: passkey.email,
    };
  }

  public static async listDeveloperPasskeys(developerId: string): Promise<PasskeyRecord[]> {
    try {
      const res = await query<{
        id: string;
        credential_id: string;
        device_name: string;
        created_at: string;
        last_used_at?: string;
        aaguid?: string;
      }>(
        `SELECT id, credential_id, device_name, created_at, last_used_at, aaguid
         FROM developer_passkeys
         WHERE developer_id = $1
         ORDER BY created_at DESC`,
        [developerId]
      );

      return res.rows.map((r) => ({
        id: r.id,
        credentialId: r.credential_id,
        deviceName: r.device_name,
        createdAt: r.created_at,
        lastUsedAt: r.last_used_at,
        aaguid: r.aaguid,
      }));
    } catch {
      return [];
    }
  }

  public static async deleteDeveloperPasskey(developerId: string, passkeyId: string): Promise<void> {
    const res = await query(
      'DELETE FROM developer_passkeys WHERE id = $1 AND developer_id = $2',
      [passkeyId, developerId]
    );
    if ((res as any).rowCount === 0) {
      throw new Error('Developer passkey not found or already deleted');
    }
  }
}
