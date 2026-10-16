export class Auth {
    app;
    currentUser = null;
    accessToken = null;
    refreshToken = null;
    listeners = new Set();
    constructor(app) {
        this.app = app;
    }
    setSession(user, accessToken, refreshToken) {
        this.currentUser = user;
        this.accessToken = accessToken;
        this.refreshToken = refreshToken;
        for (const listener of this.listeners) {
            listener(user);
        }
    }
    addListener(callback) {
        this.listeners.add(callback);
        callback(this.currentUser);
        return () => {
            this.listeners.delete(callback);
        };
    }
}
const authInstances = new Map();
export function getAuth(app) {
    let auth = authInstances.get(app);
    if (!auth) {
        auth = new Auth(app);
        authInstances.set(app, auth);
    }
    return auth;
}
export async function createUserWithEmailAndPassword(auth, email, passwordPlain) {
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
        const errorData = (await res.json().catch(() => ({})));
        throw new Error(errorData.error || `Auth error: ${res.statusText}`);
    }
    const data = (await res.json());
    if (data.accessToken && data.refreshToken) {
        auth.setSession(data.user, data.accessToken, data.refreshToken);
    }
    return { user: data.user };
}
export async function signInWithEmailAndPassword(auth, email, passwordPlain) {
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
        const errorData = (await res.json().catch(() => ({})));
        throw new Error(errorData.message || errorData.error || `Login error: ${res.statusText}`);
    }
    const data = (await res.json());
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
export async function signOut(auth) {
    auth.setSession(null, null, null);
}
export function onAuthStateChanged(auth, callback) {
    return auth.addListener(callback);
}
/**
 * Signs in as a temporary anonymous guest user.
 */
export async function signInAnonymously(auth) {
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
        const errorData = (await res.json().catch(() => ({})));
        throw new Error(errorData.error || `Anonymous login error: ${res.statusText}`);
    }
    const data = (await res.json());
    auth.setSession(data.user, data.accessToken, data.refreshToken);
    return { user: data.user };
}
/**
 * Links an anonymous user account with an email and password, converting it to permanent.
 */
export async function linkWithEmailAndPassword(auth, email, passwordPlain, displayName) {
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
        const errorData = (await res.json().catch(() => ({})));
        throw new Error(errorData.error || `Link account error: ${res.statusText}`);
    }
    const data = (await res.json());
    auth.setSession(data.user, data.accessToken, data.refreshToken);
    return { user: data.user };
}
/**
 * Sends or resends email verification to an app user.
 */
export async function sendEmailVerification(auth, user) {
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
        const errorData = (await res.json().catch(() => ({})));
        throw new Error(errorData.error || `Send verification error: ${res.statusText}`);
    }
}
/**
 * Applies an action code (e.g. email verification).
 */
export async function applyActionCode(auth, oobCode) {
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
        const errorData = (await res.json().catch(() => ({})));
        throw new Error(errorData.error || `Apply action code error: ${res.statusText}`);
    }
}
/**
 * Sends a password reset email.
 */
export async function sendPasswordResetEmail(auth, email) {
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
        const errorData = (await res.json().catch(() => ({})));
        throw new Error(errorData.error || `Password reset error: ${res.statusText}`);
    }
}
/**
 * Confirms password reset with an action code and new password.
 */
export async function confirmPasswordReset(auth, oobCode, newPasswordPlain) {
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
        const errorData = (await res.json().catch(() => ({})));
        throw new Error(errorData.error || `Confirm password reset error: ${res.statusText}`);
    }
}
/**
 * Initiates TOTP Multi-Factor Authentication enrollment for the signed-in user.
 */
export async function enrollTotpMfa(auth) {
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
        const errorData = (await res.json().catch(() => ({})));
        throw new Error(errorData.error || `MFA enrollment error: ${res.statusText}`);
    }
    return (await res.json());
}
/**
 * Confirms and activates TOTP MFA for the signed-in user with a 6-digit code.
 */
export async function verifyTotpMfa(auth, token) {
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
        const errorData = (await res.json().catch(() => ({})));
        throw new Error(errorData.error || `MFA verification error: ${res.statusText}`);
    }
    return (await res.json());
}
/**
 * Completes a two-stage Multi-Factor Authentication challenge with a TOTP code or passkey assertion.
 */
export async function completeMfaChallenge(auth, mfaSession, factor, code) {
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
        passkeyResponse = await startAuthentication({ optionsJSON: options });
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
        const errorData = (await res.json().catch(() => ({})));
        throw new Error(errorData.message || errorData.error || `MFA challenge error: ${res.statusText}`);
    }
    const data = (await res.json());
    auth.setSession(data.user, data.accessToken, data.refreshToken);
    return { user: data.user };
}
/**
 * Registers a new WebAuthn Passkey for the signed-in user.
 */
export async function createPasskey(auth, deviceName = 'Passkey Device') {
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
        const errorData = (await optRes.json().catch(() => ({})));
        throw new Error(errorData.error || `Passkey registration options error: ${optRes.statusText}`);
    }
    const options = await optRes.json();
    const regResponse = await startRegistration({ optionsJSON: options });
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
        const errorData = (await verifyRes.json().catch(() => ({})));
        throw new Error(errorData.error || `Passkey verification error: ${verifyRes.statusText}`);
    }
    const data = (await verifyRes.json());
    return data.passkey;
}
export const registerPasskey = createPasskey;
/**
 * Signs in passwordless using a registered WebAuthn passkey.
 */
export async function signInWithPasskey(auth, email) {
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
        const errorData = (await optRes.json().catch(() => ({})));
        throw new Error(errorData.error || `Passkey auth options error: ${optRes.statusText}`);
    }
    const options = await optRes.json();
    const authResponse = await startAuthentication({ optionsJSON: options });
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
        const errorData = (await verifyRes.json().catch(() => ({})));
        throw new Error(errorData.error || `Passkey verification failed: ${verifyRes.statusText}`);
    }
    const data = (await verifyRes.json());
    auth.setSession(data.user, data.accessToken, data.refreshToken);
    return { user: data.user };
}
/**
 * Lists all registered passkeys for the signed-in user.
 */
export async function listPasskeys(auth) {
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
        const errorData = (await res.json().catch(() => ({})));
        throw new Error(errorData.error || `Failed to list passkeys: ${res.statusText}`);
    }
    const data = (await res.json());
    return data.passkeys;
}
/**
 * Deletes a registered passkey.
 */
export async function deletePasskey(auth, passkeyId) {
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
        const errorData = (await res.json().catch(() => ({})));
        throw new Error(errorData.error || `Failed to delete passkey: ${res.statusText}`);
    }
}
/**
 * Self-service account deletion for the signed-in user.
 * Enforces project-level user action permission (enableDelete).
 */
export async function deleteUser(auth) {
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
        const errorData = (await res.json().catch(() => ({})));
        throw new Error(errorData.message || errorData.error || `Failed to delete account: ${res.statusText}`);
    }
    auth.setSession(null, null, null);
}
/**
 * Initiates TOTP Multi-Factor Authentication enrollment for the signed-in user.
 * Generates an enrollment secret, scannable QR code data URL, and 8 emergency recovery backup codes.
 */
export async function enrollTotp(auth) {
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
        const errorData = (await res.json().catch(() => ({})));
        throw new Error(errorData.message || errorData.error || `Failed to initiate TOTP enrollment: ${res.statusText}`);
    }
    return (await res.json());
}
/**
 * Confirms and activates TOTP Multi-Factor Authentication for the signed-in user.
 */
export async function verifyAndActivateTotp(auth, token) {
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
        const errorData = (await res.json().catch(() => ({})));
        throw new Error(errorData.message || errorData.error || `Failed to verify TOTP code: ${res.statusText}`);
    }
    return (await res.json());
}
/**
 * Unenrolls / disables TOTP Multi-Factor Authentication for the signed-in user.
 */
export async function unenrollTotp(auth) {
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
        const errorData = (await res.json().catch(() => ({})));
        throw new Error(errorData.message || errorData.error || `Failed to unenroll TOTP: ${res.statusText}`);
    }
}
/**
 * Completes two-stage Multi-Factor Authentication challenge during sign-in.
 */
export async function completeMfaSignIn(auth, mfaSession, factor, codeOrPasskeyResponse) {
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
        const errorData = (await res.json().catch(() => ({})));
        throw new Error(errorData.message || errorData.error || `MFA challenge verification failed: ${res.statusText}`);
    }
    const data = (await res.json());
    auth.setSession(data.user, data.accessToken, data.refreshToken);
    return { user: data.user };
}
//# sourceMappingURL=auth.js.map