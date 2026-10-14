import { FirebaseApp } from './app.js';
import { AppUser, TotpEnrollmentResult, TotpVerifyResult } from '@syntrabase/shared-types';

export class Auth {
  public currentUser: AppUser | null = null;
  public accessToken: string | null = null;
  public refreshToken: string | null = null;
  private listeners: Set<(user: AppUser | null) => void> = new Set();

  constructor(public readonly app: FirebaseApp) {}

  public setSession(user: AppUser | null, accessToken: string | null, refreshToken: string | null) {
    this.currentUser = user;
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
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

  const data = (await res.json()) as { user: AppUser };
  return { user: data.user };
}

export async function signInWithEmailAndPassword(
  auth: Auth,
  email: string,
  passwordPlain: string
): Promise<{ user: AppUser }> {
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
    const errorData = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(errorData.error || `Login error: ${res.statusText}`);
  }

  const data = (await res.json()) as { user: AppUser; accessToken: string; refreshToken: string };
  auth.setSession(data.user, data.accessToken, data.refreshToken);
  return { user: data.user };
}

export async function signOut(auth: Auth): Promise<void> {
  auth.setSession(null, null, null);
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

