import { AdminApp } from './app.js';
import { AppUser, ProjectAuthConfig, UserActionsConfig, MfaPolicy, PasskeyRecord } from '@syntrabase/shared-types';

export class AdminAuth {
  constructor(public readonly app: AdminApp) {}

  private getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'x-api-key': this.app.options.secretKey,
    };
  }

  public async getUser(uid: string): Promise<AppUser | null> {
    const list = await this.listUsers({ search: uid, limit: 1 });
    return list.users.find((u) => u.id === uid) || null;
  }

  public async getUserByEmail(email: string): Promise<AppUser | null> {
    const list = await this.listUsers({ search: email.trim().toLowerCase(), limit: 5 });
    return list.users.find((u) => u.email?.toLowerCase() === email.trim().toLowerCase()) || null;
  }

  public async listUsers(options: { page?: number; limit?: number; search?: string } = {}): Promise<{
    users: AppUser[];
    total: number;
    page: number;
    limit: number;
  }> {
    const params = new URLSearchParams();
    if (options.page) params.set('page', options.page.toString());
    if (options.limit) params.set('limit', options.limit.toString());
    if (options.search) params.set('search', options.search);

    const url = `${this.app.options.apiUrl}/api/v1/projects/${this.app.options.projectId}/auth/users?${params.toString()}`;
    const res = await fetch(url, { method: 'GET', headers: this.getHeaders() });
    if (!res.ok) throw new Error(`Admin listUsers failed: ${res.statusText}`);
    return (await res.json()) as { users: AppUser[]; total: number; page: number; limit: number };
  }

  public async createUser(data: {
    email: string;
    password: string;
    displayName?: string;
    phoneNumber?: string;
    emailVerified?: boolean;
    disabled?: boolean;
  }): Promise<AppUser> {
    const url = `${this.app.options.apiUrl}/api/v1/projects/${this.app.options.projectId}/auth/users`;
    const res = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error || `Admin createUser failed: ${res.statusText}`);
    }
    const result = (await res.json()) as { user: AppUser };
    return result.user;
  }

  public async updateUser(
    uid: string,
    data: {
      email?: string;
      displayName?: string;
      phoneNumber?: string;
      emailVerified?: boolean;
      disabled?: boolean;
      password?: string;
      customClaims?: Record<string, unknown>;
    }
  ): Promise<AppUser> {
    const url = `${this.app.options.apiUrl}/api/v1/projects/${this.app.options.projectId}/auth/users/${uid}`;
    const res = await fetch(url, {
      method: 'PATCH',
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error || `Admin updateUser failed: ${res.statusText}`);
    }
    const result = (await res.json()) as { user: AppUser };
    return result.user;
  }

  public async deleteUser(uid: string): Promise<void> {
    const url = `${this.app.options.apiUrl}/api/v1/projects/${this.app.options.projectId}/auth/users/${uid}`;
    const res = await fetch(url, { method: 'DELETE', headers: this.getHeaders() });
    if (!res.ok) throw new Error(`Admin deleteUser failed: ${res.statusText}`);
  }

  public async deleteUsers(uids: string[]): Promise<{ successCount: number; failureCount: number; errors?: any[] }> {
    let successCount = 0;
    let failureCount = 0;
    const errors: any[] = [];
    for (const uid of uids) {
      try {
        await this.deleteUser(uid);
        successCount++;
      } catch (err: any) {
        failureCount++;
        errors.push({ uid, error: err.message });
      }
    }
    return { successCount, failureCount, errors: errors.length > 0 ? errors : undefined };
  }

  public async setCustomUserClaims(uid: string, customClaims: Record<string, unknown> | null): Promise<void> {
    await this.updateUser(uid, { customClaims: customClaims || {} });
  }

  public async revokeRefreshTokens(uid: string): Promise<void> {
    const url = `${this.app.options.apiUrl}/api/v1/projects/${this.app.options.projectId}/auth/users/${uid}/revoke-sessions`;
    const res = await fetch(url, { method: 'POST', headers: this.getHeaders() });
    if (!res.ok) throw new Error(`Admin revokeRefreshTokens failed: ${res.statusText}`);
  }

  public async getProjectAuthConfig(): Promise<ProjectAuthConfig> {
    const url = `${this.app.options.apiUrl}/api/v1/projects/${this.app.options.projectId}/auth/config`;
    const res = await fetch(url, { method: 'GET', headers: this.getHeaders() });
    if (!res.ok) throw new Error(`Admin getProjectAuthConfig failed: ${res.statusText}`);
    const data = (await res.json()) as { config: ProjectAuthConfig };
    return data.config;
  }

  public async updateProjectAuthConfig(updates: Partial<ProjectAuthConfig>): Promise<ProjectAuthConfig> {
    const url = `${this.app.options.apiUrl}/api/v1/projects/${this.app.options.projectId}/auth/config`;
    const res = await fetch(url, {
      method: 'PATCH',
      headers: this.getHeaders(),
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error(`Admin updateProjectAuthConfig failed: ${res.statusText}`);
    const data = (await res.json()) as { config: ProjectAuthConfig };
    return data.config;
  }

  /**
   * Configures backend-enforced User Actions (public sign-up, self-deletion, email enumeration protection).
   */
  public async setUserActions(config: Partial<UserActionsConfig>): Promise<ProjectAuthConfig> {
    return this.updateProjectAuthConfig({ userActions: config as UserActionsConfig });
  }

  /**
   * Retrieves the current User Actions security configuration for the project.
   */
  public async getUserActions(): Promise<UserActionsConfig> {
    const config = await this.getProjectAuthConfig();
    return config.userActions;
  }

  /**
   * Configures Multi-Factor Authentication project enforcement policy and allowed factors.
   */
  public async setMfaPolicy(policy: Partial<MfaPolicy>): Promise<ProjectAuthConfig> {
    return this.updateProjectAuthConfig({ mfaPolicy: policy as MfaPolicy });
  }

  /**
   * Retrieves the current Multi-Factor Authentication policy for the project.
   */
  public async getMfaPolicy(): Promise<MfaPolicy> {
    const config = await this.getProjectAuthConfig();
    return config.mfaPolicy;
  }

  /**
   * Retrieves enrolled MFA factors (TOTP) and registered passkeys for a specific user.
   */
  public async getUserMfa(uid: string): Promise<{
    factors: Array<{
      id: string;
      factorType: string;
      verified: boolean;
      enrolledAt: string;
      lastUsedAt: string | null;
    }>;
    passkeys: PasskeyRecord[];
  }> {
    const url = `${this.app.options.apiUrl}/api/v1/projects/${this.app.options.projectId}/auth/users/${uid}/mfa`;
    const res = await fetch(url, { method: 'GET', headers: this.getHeaders() });
    if (!res.ok) throw new Error(`Admin getUserMfa failed: ${res.statusText}`);
    return (await res.json()) as any;
  }

  /**
   * Unenrolls / revokes an MFA factor for a specific user (e.g. lost phone recovery).
   */
  public async unenrollUserMfa(uid: string, factorId = 'totp'): Promise<void> {
    const url = `${this.app.options.apiUrl}/api/v1/projects/${this.app.options.projectId}/auth/users/${uid}/mfa/${factorId}`;
    const res = await fetch(url, { method: 'DELETE', headers: this.getHeaders() });
    if (!res.ok) throw new Error(`Admin unenrollUserMfa failed: ${res.statusText}`);
  }

  /**
   * Lists all registered FIDO2 WebAuthn Passkeys for a specific user.
   */
  public async listUserPasskeys(uid: string): Promise<PasskeyRecord[]> {
    const url = `${this.app.options.apiUrl}/api/v1/projects/${this.app.options.projectId}/auth/users/${uid}/passkeys`;
    const res = await fetch(url, { method: 'GET', headers: this.getHeaders() });
    if (!res.ok) throw new Error(`Admin listUserPasskeys failed: ${res.statusText}`);
    const data = (await res.json()) as { passkeys: PasskeyRecord[] };
    return data.passkeys;
  }

  /**
   * Revokes / deletes a specific FIDO2 WebAuthn Passkey for a user.
   */
  public async deleteUserPasskey(uid: string, passkeyId: string): Promise<void> {
    const url = `${this.app.options.apiUrl}/api/v1/projects/${this.app.options.projectId}/auth/users/${uid}/passkeys/${passkeyId}`;
    const res = await fetch(url, { method: 'DELETE', headers: this.getHeaders() });
    if (!res.ok) throw new Error(`Admin deleteUserPasskey failed: ${res.statusText}`);
  }

  public async verifyIdToken(
    token: string
  ): Promise<{ uid: string; email?: string; projectId?: string; environmentId?: string; [key: string]: unknown }> {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        throw new Error('Invalid JWT format');
      }

      // Safe base64url decoding
      const rawPayload = Buffer.from(parts[1], 'base64url').toString('utf8');
      const payload = JSON.parse(rawPayload);

      if (!payload || typeof payload !== 'object') {
        throw new Error('Malformed token payload');
      }

      if (!payload.uid && !payload.sub) {
        throw new Error('Token payload missing user identifier (uid or sub)');
      }

      // Enforce token expiration
      if (payload.exp && typeof payload.exp === 'number') {
        const nowInSeconds = Math.floor(Date.now() / 1000);
        if (nowInSeconds >= payload.exp) {
          throw new Error('Firebase ID token has expired');
        }
      }

      // Tenant isolation: if payload specifies a projectId, ensure it matches the Admin SDK's project
      if (payload.projectId && payload.projectId !== this.app.options.projectId) {
        throw new Error(
          `Token projectId mismatch: token issued for '${payload.projectId}' but Admin SDK configured for '${this.app.options.projectId}'`
        );
      }

      return payload;
    } catch (err: any) {
      throw new Error(`Invalid token: ${err.message}`);
    }
  }
}

export function getAdminAuth(app: AdminApp): AdminAuth {
  return new AdminAuth(app);
}

export const getAuth = getAdminAuth;
export type Auth = AdminAuth;

