import { FirebaseApp } from './app.js';
import { AppUser, TotpEnrollmentResult, TotpVerifyResult, PasskeyRecord } from '@syntrabase/shared-types';

export const browserLocalPersistence = 'LOCAL';
export const browserSessionPersistence = 'SESSION';
export const indexedDBLocalPersistence = 'INDEXEDDB';
export const inMemoryPersistence = 'NONE';

export class Auth {
  public currentUser: AppUser | null = null;
  public accessToken: string | null = null;
  public refreshToken: string | null = null;
  public persistence: string = browserLocalPersistence;
  private listeners: Set<(user: AppUser | null) => void> = new Set();

  constructor(public readonly app: FirebaseApp) {
    this.loadPersistedSession();
  }

  private getStorageKey(): string {
    return `syntrabase_auth_${this.app.options.projectId}_${this.app.options.environmentId || 'default'}`;
  }

  public loadPersistedSession(): void {
    const globalObj = typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? (globalThis as any) : null;
    if (!globalObj) return;

    try {
      const key = this.getStorageKey();
      let rawData: string | null = null;

      if (this.persistence === browserLocalPersistence || this.persistence === indexedDBLocalPersistence) {
        rawData = globalObj.localStorage?.getItem(key) ?? null;
      }
      if (!rawData && (this.persistence === browserSessionPersistence || !this.persistence)) {
        rawData = globalObj.sessionStorage?.getItem(key) ?? null;
      }
      if (!rawData && globalObj.localStorage) {
        rawData = globalObj.localStorage.getItem(key) ?? null;
      }

      if (rawData) {
        const parsed = JSON.parse(rawData);
        if (parsed && parsed.user) {
          this.currentUser = parsed.user;
          this.accessToken = parsed.accessToken || null;
          this.refreshToken = parsed.refreshToken || null;

          if (this.currentUser && this.accessToken) {
            (this.currentUser as any).getIdToken = async (forceRefresh = false) => {
              return this.getIdToken(forceRefresh);
            };
          }
        }
      }
    } catch {
      // Storage access blocked or invalid JSON
    }
  }

  public savePersistedSession(): void {
    const globalObj = typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? (globalThis as any) : null;
    if (!globalObj) return;

    try {
      const key = this.getStorageKey();

      if (!this.currentUser) {
        globalObj.localStorage?.removeItem(key);
        globalObj.sessionStorage?.removeItem(key);
        return;
      }

      const payload = JSON.stringify({
        user: this.currentUser,
        accessToken: this.accessToken,
        refreshToken: this.refreshToken,
      });

      if (this.persistence === browserLocalPersistence || this.persistence === indexedDBLocalPersistence) {
        globalObj.localStorage?.setItem(key, payload);
        globalObj.sessionStorage?.removeItem(key);
      } else if (this.persistence === browserSessionPersistence) {
        globalObj.sessionStorage?.setItem(key, payload);
        globalObj.localStorage?.removeItem(key);
      } else {
        // inMemoryPersistence ('NONE')
        globalObj.localStorage?.removeItem(key);
        globalObj.sessionStorage?.removeItem(key);
      }
    } catch {
      // Storage quota exceeded or disabled
    }
  }

  public async getIdToken(forceRefresh = false): Promise<string> {
    if (!this.accessToken) {
      throw new Error('No user currently signed in');
    }

    let isExpired = false;
    try {
      const parts = this.accessToken.split('.');
      if (parts.length === 3) {
        const payloadStr = typeof Buffer !== 'undefined'
          ? Buffer.from(parts[1], 'base64').toString('utf8')
          : atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
        const payload = JSON.parse(payloadStr);
        if (payload.exp && Date.now() >= (payload.exp - 60) * 1000) {
          isExpired = true;
        }
      }
    } catch {
      // Ignore payload decode errors
    }

    if ((forceRefresh || isExpired) && this.refreshToken) {
      try {
        const res = await fetch(`${this.app.options.apiUrl}/api/v1/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: this.refreshToken }),
        });
        if (res.ok) {
          const data = (await res.json()) as { accessToken: string; refreshToken?: string; user?: AppUser };
          this.accessToken = data.accessToken;
          if (data.refreshToken) this.refreshToken = data.refreshToken;
          if (data.user) this.currentUser = data.user;
          this.savePersistedSession();
        }
      } catch {
        // Fallback to current access token
      }
    }

    return this.accessToken;
  }

  public setSession(user: AppUser | null, accessToken: string | null, refreshToken: string | null) {
    if (user && accessToken) {
      (user as any).getIdToken = async (forceRefresh = false) => {
        return this.getIdToken(forceRefresh);
      };
    }
    this.currentUser = user;
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;

    this.savePersistedSession();

    for (const listener of this.listeners) {
      listener(user);
    }
  }

  public addListener(callback: (user: AppUser | null) => void): () => void {
    this.listeners.add(callback);
    callback(this.currentUser);
    return () => {
      this.listeners.delete(callback);
    };
  }
}

const authInstances = new Map<FirebaseApp, Auth>();

export function getAuth(app: FirebaseApp): Auth {
  let auth = authInstances.get(app);
  if (!auth) {
    auth = new Auth(app);
    authInstances.set(app, auth);
  }
  return auth;
}

export async function createUserWithEmailAndPassword(
  auth: Auth,
  email: string,
  passwordPlain: string
): Promise<{ user: AppUser }> {
  const url = `${auth.app.options.apiUrl}/api/v1/projects/${auth.app.options.projectId}/auth/register`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': auth.app.options.apiKey,
      'x-environment-id': auth.app.options.environmentId || 'default',
    },
    body: JSON.stringify({ email, password: passwordPlain }),
  });

  if (!res.ok) {
    const errorData = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(errorData.error || `Auth error: ${res.statusText}`);
  }

  const data = (await res.json()) as { user: AppUser; accessToken?: string; refreshToken?: string };
  if (data.accessToken && data.refreshToken) {
    auth.setSession(data.user, data.accessToken, data.refreshToken);
  }
  return { user: data.user };
}

export async function signInWithEmailAndPassword(
  auth: Auth,
  email: string,
  passwordPlain: string
): Promise<{ user?: AppUser; mfaRequired?: boolean; mfaSession?: string; allowedFactors?: ('totp' | 'passkey')[] }> {
  const url = `${auth.app.options.apiUrl}/api/v1/projects/${auth.app.options.projectId}/auth/login`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': auth.app.options.apiKey,
      'x-environment-id': auth.app.options.environmentId || 'default',
    },
    body: JSON.stringify({ email, password: passwordPlain }),
  });

  if (!res.ok) {
    const errorData = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
    throw new Error(errorData.message || errorData.error || `Login error: ${res.statusText}`);
  }

  const data = (await res.json()) as {
    user?: AppUser;
    accessToken?: string;
    refreshToken?: string;
    mfaRequired?: boolean;
    mfaSession?: string;
    allowedFactors?: ('totp' | 'passkey')[];
  };

  if (data.mfaRequired) {
    return {
      mfaRequired: true,
      mfaSession: data.mfaSession,
      allowedFactors: data.allowedFactors,
    };
  }

  if (data.user && data.accessToken && data.refreshToken) {
    auth.setSession(data.user, data.accessToken, data.refreshToken);
    return { user: data.user };
  }

  return data;
}

export async function signOut(auth: Auth): Promise<void> {
  auth.setSession(null, null, null);
}

export async function setPersistence(auth: Auth, persistence: string): Promise<void> {
  auth.persistence = persistence;
  auth.savePersistedSession();
}

export async function signInWithCustomToken(auth: Auth, customToken: string): Promise<{ user: AppUser }> {
  const url = `${auth.app.options.apiUrl}/api/v1/projects/${auth.app.options.projectId}/auth/custom-token`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': auth.app.options.apiKey,
      'x-environment-id': auth.app.options.environmentId || 'default',
    },
    body: JSON.stringify({ token: customToken }),
  });

  if (!res.ok) {
    const errorData = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
    throw new Error(errorData.message || errorData.error || `Custom token sign-in error: ${res.statusText}`);
  }

  const data = (await res.json()) as { user: AppUser; accessToken: string; refreshToken: string };
  auth.setSession(data.user, data.accessToken, data.refreshToken);
  return { user: data.user };
}

export function onAuthStateChanged(
  auth: Auth,
  callback: (user: AppUser | null) => void
): () => void {
  return auth.addListener(callback);
}

/**
 * Signs in as a temporary anonymous guest user.
 */
export async function signInAnonymously(auth: Auth): Promise<{ user: AppUser }> {
  const url = `${auth.app.options.apiUrl}/api/v1/projects/${auth.app.options.projectId}/auth/anonymous`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': auth.app.options.apiKey,
      'x-environment-id': auth.app.options.environmentId || 'default',
    },
    body: JSON.stringify({}),
  });

  if (!res.ok) {
    const errorData = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(errorData.error || `Anonymous login error: ${res.statusText}`);
  }

  const data = (await res.json()) as { user: AppUser; accessToken: string; refreshToken: string };
  auth.setSession(data.user, data.accessToken, data.refreshToken);
  return { user: data.user };
}

/**
 * Links an anonymous user account with an email and password, converting it to permanent.
 */
export async function linkWithEmailAndPassword(
  auth: Auth,
  email: string,
  passwordPlain: string,
  displayName?: string
): Promise<{ user: AppUser }> {
  if (!auth.accessToken) {
    throw new Error('User must be signed in to link an account');
  }

  const url = `${auth.app.options.apiUrl}/api/v1/projects/${auth.app.options.projectId}/auth/link-account`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${auth.accessToken}`,
      'x-api-key': auth.app.options.apiKey,
      'x-environment-id': auth.app.options.environmentId || 'default',
    },
    body: JSON.stringify({ email, password: passwordPlain, displayName }),
  });

  if (!res.ok) {
    const errorData = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(errorData.error || `Link account error: ${res.statusText}`);
  }

  const data = (await res.json()) as { user: AppUser; accessToken: string; refreshToken: string };
  auth.setSession(data.user, data.accessToken, data.refreshToken);
  return { user: data.user };
}

/**
 * Sends or resends email verification to an app user.
 */
export async function sendEmailVerification(auth: Auth, user: AppUser): Promise<void> {
  const url = `${auth.app.options.apiUrl}/api/v1/projects/${auth.app.options.projectId}/auth/resend-verification`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': auth.app.options.apiKey,
      'x-environment-id': auth.app.options.environmentId || 'default',
    },
    body: JSON.stringify({ email: user.email }),
  });

  if (!res.ok) {
    const errorData = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(errorData.error || `Send verification error: ${res.statusText}`);
  }
}

/**
 * Applies an action code (e.g. email verification).
 */
export async function applyActionCode(auth: Auth, oobCode: string): Promise<void> {
  const url = `${auth.app.options.apiUrl}/api/v1/projects/${auth.app.options.projectId}/auth/verify-email`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': auth.app.options.apiKey,
      'x-environment-id': auth.app.options.environmentId || 'default',
    },
    body: JSON.stringify({ token: oobCode }),
  });

  if (!res.ok) {
    const errorData = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(errorData.error || `Apply action code error: ${res.statusText}`);
  }
}

/**
 * Sends a password reset email.
 */
export async function sendPasswordResetEmail(auth: Auth, email: string): Promise<void> {
  const url = `${auth.app.options.apiUrl}/api/v1/projects/${auth.app.options.projectId}/auth/forgot-password`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': auth.app.options.apiKey,
      'x-environment-id': auth.app.options.environmentId || 'default',
    },
    body: JSON.stringify({ email }),
  });

  if (!res.ok) {
    const errorData = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(errorData.error || `Password reset error: ${res.statusText}`);
  }
}

/**
 * Confirms password reset with an action code and new password.
 */
export async function confirmPasswordReset(auth: Auth, oobCode: string, newPasswordPlain: string): Promise<void> {
  const url = `${auth.app.options.apiUrl}/api/v1/projects/${auth.app.options.projectId}/auth/reset-password`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': auth.app.options.apiKey,
      'x-environment-id': auth.app.options.environmentId || 'default',
    },
    body: JSON.stringify({ token: oobCode, newPassword: newPasswordPlain }),
  });

  if (!res.ok) {
    const errorData = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(errorData.error || `Confirm password reset error: ${res.statusText}`);
  }
}

/**
 * Initiates TOTP Multi-Factor Authentication enrollment for the signed-in user.
 */
export async function enrollTotpMfa(auth: Auth): Promise<TotpEnrollmentResult> {
  if (!auth.accessToken) {
    throw new Error('User must be signed in to enroll MFA');
  }

  const url = `${auth.app.options.apiUrl}/api/v1/projects/${auth.app.options.projectId}/auth/mfa/totp/enroll`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${auth.accessToken}`,
      'x-api-key': auth.app.options.apiKey,
      'x-environment-id': auth.app.options.environmentId || 'default',
    },
  });

  if (!res.ok) {
    const errorData = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(errorData.error || `MFA enrollment error: ${res.statusText}`);
  }

  return (await res.json()) as TotpEnrollmentResult;
}

/**
 * Confirms and activates TOTP MFA for the signed-in user with a 6-digit code.
 */
export async function verifyTotpMfa(auth: Auth, token: string): Promise<TotpVerifyResult> {
  if (!auth.accessToken) {
    throw new Error('User must be signed in to verify MFA');
  }

  const url = `${auth.app.options.apiUrl}/api/v1/projects/${auth.app.options.projectId}/auth/mfa/totp/verify`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${auth.accessToken}`,
      'x-api-key': auth.app.options.apiKey,
      'x-environment-id': auth.app.options.environmentId || 'default',
    },
    body: JSON.stringify({ token }),
  });

  if (!res.ok) {
    const errorData = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(errorData.error || `MFA verification error: ${res.statusText}`);
  }

  return (await res.json()) as TotpVerifyResult;
}

/**
 * Completes a two-stage Multi-Factor Authentication challenge with a TOTP code or passkey assertion.
 */
export async function completeMfaChallenge(
  auth: Auth,
  mfaSession: string,
  factor: 'totp' | 'passkey',
  code?: string
): Promise<{ user: AppUser }> {
  let passkeyResponse = undefined;
  if (factor === 'passkey') {
    const { startAuthentication } = await import('@simplewebauthn/browser');
    const optUrl = `${auth.app.options.apiUrl}/api/v1/projects/${auth.app.options.projectId}/auth/passkeys/authenticate/options`;
    const optRes = await fetch(optUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': auth.app.options.apiKey,
      },
      body: JSON.stringify({}),
    });
    const options = await optRes.json();
    passkeyResponse = await startAuthentication({ optionsJSON: options as any });
  }

  const url = `${auth.app.options.apiUrl}/api/v1/projects/${auth.app.options.projectId}/auth/mfa/challenge/verify`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': auth.app.options.apiKey,
      'x-environment-id': auth.app.options.environmentId || 'default',
    },
    body: JSON.stringify({
      mfaSession,
      factor,
      code,
      passkeyResponse,
    }),
  });

  if (!res.ok) {
    const errorData = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
    throw new Error(errorData.message || errorData.error || `MFA challenge error: ${res.statusText}`);
  }

  const data = (await res.json()) as { user: AppUser; accessToken: string; refreshToken: string };
  auth.setSession(data.user, data.accessToken, data.refreshToken);
  return { user: data.user };
}

/**
 * Registers a new WebAuthn Passkey for the signed-in user.
 */
export async function createPasskey(auth: Auth, deviceName = 'Passkey Device'): Promise<PasskeyRecord> {
  if (!auth.accessToken) {
    throw new Error('User must be signed in to register a passkey');
  }
  const { startRegistration } = await import('@simplewebauthn/browser');

  const optUrl = `${auth.app.options.apiUrl}/api/v1/projects/${auth.app.options.projectId}/auth/passkeys/register/options`;
  const optRes = await fetch(optUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${auth.accessToken}`,
      'x-api-key': auth.app.options.apiKey,
    },
  });
  if (!optRes.ok) {
    const errorData = (await optRes.json().catch(() => ({}))) as { error?: string };
    throw new Error(errorData.error || `Passkey registration options error: ${optRes.statusText}`);
  }
  const options = await optRes.json();

  const regResponse = await startRegistration({ optionsJSON: options as any });

  const verifyUrl = `${auth.app.options.apiUrl}/api/v1/projects/${auth.app.options.projectId}/auth/passkeys/register/verify`;
  const verifyRes = await fetch(verifyUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${auth.accessToken}`,
      'x-api-key': auth.app.options.apiKey,
    },
    body: JSON.stringify({ response: regResponse, deviceName }),
  });
  if (!verifyRes.ok) {
    const errorData = (await verifyRes.json().catch(() => ({}))) as { error?: string };
    throw new Error(errorData.error || `Passkey verification error: ${verifyRes.statusText}`);
  }

  const data = (await verifyRes.json()) as { passkey: PasskeyRecord };
  return data.passkey;
}

export const registerPasskey = createPasskey;

/**
 * Signs in passwordless using a registered WebAuthn passkey.
 */
export async function signInWithPasskey(auth: Auth, email?: string): Promise<{ user: AppUser }> {
  const { startAuthentication } = await import('@simplewebauthn/browser');

  const optUrl = `${auth.app.options.apiUrl}/api/v1/projects/${auth.app.options.projectId}/auth/passkeys/authenticate/options`;
  const optRes = await fetch(optUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': auth.app.options.apiKey,
    },
    body: JSON.stringify({ email }),
  });
  if (!optRes.ok) {
    const errorData = (await optRes.json().catch(() => ({}))) as { error?: string };
    throw new Error(errorData.error || `Passkey auth options error: ${optRes.statusText}`);
  }
  const options = await optRes.json();

  const authResponse = await startAuthentication({ optionsJSON: options as any });

  const verifyUrl = `${auth.app.options.apiUrl}/api/v1/projects/${auth.app.options.projectId}/auth/passkeys/authenticate/verify`;
  const verifyRes = await fetch(verifyUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': auth.app.options.apiKey,
      'x-environment-id': auth.app.options.environmentId || 'default',
    },
    body: JSON.stringify({ response: authResponse }),
  });
  if (!verifyRes.ok) {
    const errorData = (await verifyRes.json().catch(() => ({}))) as { error?: string };
    throw new Error(errorData.error || `Passkey verification failed: ${verifyRes.statusText}`);
  }

  const data = (await verifyRes.json()) as { user: AppUser; accessToken: string; refreshToken: string };
  auth.setSession(data.user, data.accessToken, data.refreshToken);
  return { user: data.user };
}

/**
 * Lists all registered passkeys for the signed-in user.
 */
export async function listPasskeys(auth: Auth): Promise<PasskeyRecord[]> {
  if (!auth.accessToken) {
    throw new Error('User must be signed in to list passkeys');
  }

  const url = `${auth.app.options.apiUrl}/api/v1/projects/${auth.app.options.projectId}/auth/passkeys`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${auth.accessToken}`,
      'x-api-key': auth.app.options.apiKey,
    },
  });

  if (!res.ok) {
    const errorData = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(errorData.error || `Failed to list passkeys: ${res.statusText}`);
  }

  const data = (await res.json()) as { passkeys: PasskeyRecord[] };
  return data.passkeys;
}

/**
 * Deletes a registered passkey.
 */
export async function deletePasskey(auth: Auth, passkeyId: string): Promise<void> {
  if (!auth.accessToken) {
    throw new Error('User must be signed in to delete a passkey');
  }

  const url = `${auth.app.options.apiUrl}/api/v1/projects/${auth.app.options.projectId}/auth/passkeys/${passkeyId}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${auth.accessToken}`,
      'x-api-key': auth.app.options.apiKey,
    },
  });

  if (!res.ok) {
    const errorData = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(errorData.error || `Failed to delete passkey: ${res.statusText}`);
  }
}

function resolveAuth(authOrUser?: Auth | AppUser): Auth {
  if (authOrUser && 'app' in authOrUser && (authOrUser as Auth).app) {
    return authOrUser as Auth;
  }
  const instances = Array.from(authInstances.values());
  if (authOrUser && 'id' in authOrUser) {
    const matched = instances.find((i) => i.currentUser?.id === (authOrUser as AppUser).id);
    if (matched) return matched;
  }
  if (instances.length > 0) return instances[0];
  throw new Error('No active Auth instance found');
}

/**
 * Updates a user's basic profile information (displayName, photoURL).
 */
export async function updateProfile(
  authOrUser: Auth | AppUser,
  profile: { displayName?: string | null; photoURL?: string | null }
): Promise<void> {
  const auth = resolveAuth(authOrUser);
  if (!auth.accessToken) {
    throw new Error('User must be signed in to update profile');
  }

  const url = `${auth.app.options.apiUrl}/api/v1/projects/${auth.app.options.projectId}/auth/users/me`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${auth.accessToken}`,
      'x-api-key': auth.app.options.apiKey,
    },
    body: JSON.stringify({
      displayName: profile.displayName ?? undefined,
      photoURL: profile.photoURL ?? undefined,
    }),
  });

  if (!res.ok) {
    const errorData = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
    throw new Error(errorData.message || errorData.error || `Failed to update profile: ${res.statusText}`);
  }

  if (auth.currentUser) {
    if (profile.displayName !== undefined) auth.currentUser.displayName = profile.displayName || undefined;
    if (profile.photoURL !== undefined) auth.currentUser.photoURL = profile.photoURL || undefined;
  }
}

/**
 * Updates a user's password.
 */
export async function updatePassword(authOrUser: Auth | AppUser, newPassword: string): Promise<void> {
  const auth = resolveAuth(authOrUser);
  if (!auth.accessToken) {
    throw new Error('User must be signed in to update password');
  }

  const url = `${auth.app.options.apiUrl}/api/v1/projects/${auth.app.options.projectId}/auth/users/me`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${auth.accessToken}`,
      'x-api-key': auth.app.options.apiKey,
    },
    body: JSON.stringify({ newPassword }),
  });

  if (!res.ok) {
    const errorData = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
    throw new Error(errorData.message || errorData.error || `Failed to update password: ${res.statusText}`);
  }
}

/**
 * Updates a user's email address.
 */
export async function updateEmail(authOrUser: Auth | AppUser, newEmail: string): Promise<void> {
  const auth = resolveAuth(authOrUser);
  if (!auth.accessToken) {
    throw new Error('User must be signed in to update email');
  }

  const url = `${auth.app.options.apiUrl}/api/v1/projects/${auth.app.options.projectId}/auth/users/me`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${auth.accessToken}`,
      'x-api-key': auth.app.options.apiKey,
    },
    body: JSON.stringify({ email: newEmail }),
  });

  if (!res.ok) {
    const errorData = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
    throw new Error(errorData.message || errorData.error || `Failed to update email: ${res.statusText}`);
  }

  if (auth.currentUser) {
    auth.currentUser.email = newEmail;
  }
}

/**
 * Returns a JSON Web Token (JWT) used to identify the user to Syntrabase services.
 */
export async function getIdToken(authOrUser?: Auth | AppUser, _forceRefresh = false): Promise<string> {
  const auth = resolveAuth(authOrUser);
  if (!auth.accessToken) {
    throw new Error('No user currently signed in to get ID token');
  }
  return auth.accessToken;
}

/**
 * Self-service account deletion for the signed-in user.
 * Enforces project-level user action permission (enableDelete).
 */
export async function deleteUser(authOrUser: Auth | AppUser): Promise<void> {
  const auth = resolveAuth(authOrUser);
  if (!auth.accessToken) {
    throw new Error('User must be signed in to delete account');
  }

  const url = `${auth.app.options.apiUrl}/api/v1/projects/${auth.app.options.projectId}/auth/users/me`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${auth.accessToken}`,
      'x-api-key': auth.app.options.apiKey,
    },
  });

  if (!res.ok) {
    const errorData = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
    throw new Error(errorData.message || errorData.error || `Failed to delete account: ${res.statusText}`);
  }

  auth.setSession(null, null, null);
}

/**
 * Initiates TOTP Multi-Factor Authentication enrollment for the signed-in user.
 * Generates an enrollment secret, scannable QR code data URL, and 8 emergency recovery backup codes.
 */
export async function enrollTotp(auth: Auth): Promise<TotpEnrollmentResult> {
  if (!auth.accessToken) {
    throw new Error('User must be signed in to enroll TOTP Multi-Factor Authentication');
  }

  const url = `${auth.app.options.apiUrl}/api/v1/projects/${auth.app.options.projectId}/auth/mfa/totp/enroll`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${auth.accessToken}`,
      'x-api-key': auth.app.options.apiKey,
    },
  });

  if (!res.ok) {
    const errorData = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
    throw new Error(errorData.message || errorData.error || `Failed to initiate TOTP enrollment: ${res.statusText}`);
  }

  return (await res.json()) as TotpEnrollmentResult;
}

/**
 * Confirms and activates TOTP Multi-Factor Authentication for the signed-in user.
 */
export async function verifyAndActivateTotp(auth: Auth, token: string): Promise<TotpVerifyResult> {
  if (!auth.accessToken) {
    throw new Error('User must be signed in to verify TOTP Multi-Factor Authentication');
  }

  const url = `${auth.app.options.apiUrl}/api/v1/projects/${auth.app.options.projectId}/auth/mfa/totp/verify`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${auth.accessToken}`,
      'x-api-key': auth.app.options.apiKey,
    },
    body: JSON.stringify({ token }),
  });

  if (!res.ok) {
    const errorData = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
    throw new Error(errorData.message || errorData.error || `Failed to verify TOTP code: ${res.statusText}`);
  }

  return (await res.json()) as TotpVerifyResult;
}

/**
 * Unenrolls / disables TOTP Multi-Factor Authentication for the signed-in user.
 */
export async function unenrollTotp(auth: Auth): Promise<void> {
  if (!auth.accessToken) {
    throw new Error('User must be signed in to unenroll TOTP Multi-Factor Authentication');
  }

  const url = `${auth.app.options.apiUrl}/api/v1/projects/${auth.app.options.projectId}/auth/mfa/totp`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${auth.accessToken}`,
      'x-api-key': auth.app.options.apiKey,
    },
  });

  if (!res.ok) {
    const errorData = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
    throw new Error(errorData.message || errorData.error || `Failed to unenroll TOTP: ${res.statusText}`);
  }
}

/**
 * Completes two-stage Multi-Factor Authentication challenge during sign-in.
 */
export async function completeMfaSignIn(
  auth: Auth,
  mfaSession: string,
  factor: 'totp' | 'passkey',
  codeOrPasskeyResponse: string | any
): Promise<{ user: AppUser }> {
  const url = `${auth.app.options.apiUrl}/api/v1/projects/${auth.app.options.projectId}/auth/mfa/challenge/verify`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': auth.app.options.apiKey,
      'x-environment-id': auth.app.options.environmentId || 'default',
    },
    body: JSON.stringify({
      mfaSession,
      factor,
      code: factor === 'totp' ? codeOrPasskeyResponse : undefined,
      passkeyResponse: factor === 'passkey' ? codeOrPasskeyResponse : undefined,
    }),
  });

  if (!res.ok) {
    const errorData = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
    throw new Error(errorData.message || errorData.error || `MFA challenge verification failed: ${res.statusText}`);
  }

  const data = (await res.json()) as { user: AppUser; accessToken: string; refreshToken: string };
  auth.setSession(data.user, data.accessToken, data.refreshToken);
  return { user: data.user };
}



