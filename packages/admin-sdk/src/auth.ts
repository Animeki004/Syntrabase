import { AdminApp } from './app.js';
import { AppUser, ProjectAuthConfig } from '@syntrabase/shared-types';

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

  public async verifyIdToken(token: string): Promise<{ uid: string; email?: string; [key: string]: unknown }> {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) throw new Error('Invalid JWT format');
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
      return payload;
    } catch (err: any) {
      throw new Error(`Invalid token: ${err.message}`);
    }
  }
}

export function getAdminAuth(app: AdminApp): AdminAuth {
  return new AdminAuth(app);
}
