import { AdminApp } from './app.js';
import type { AdminStorageObject } from '@syntrabase/shared-types';

export type { AdminStorageObject };

export class AdminStorage {
  constructor(public readonly app: AdminApp) {}

  private getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'x-api-key': this.app.options.secretKey,
    };
  }

  public async getSignedDownloadUrl(
    bucketName: string,
    objectPath: string,
    expiresInSeconds = 3600
  ): Promise<string> {
    const url = `${this.app.options.apiUrl}/api/v1/storage/${this.app.options.projectId}/signed-url`;
    const res = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ bucketName, objectPath, expiresInSeconds }),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error || `Admin getSignedDownloadUrl failed: ${res.statusText}`);
    }
    const data = (await res.json()) as { signedUrl: string };
    return `${this.app.options.apiUrl}${data.signedUrl}`;
  }

  public async listObjects(): Promise<AdminStorageObject[]> {
    const url = `${this.app.options.apiUrl}/api/v1/storage/${this.app.options.projectId}/objects`;
    const res = await fetch(url, { method: 'GET', headers: this.getHeaders() });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error || `Admin listObjects failed: ${res.statusText}`);
    }
    const data = (await res.json()) as { objects?: any[] };
    return data.objects || [];
  }

  public async deleteObject(objectIdOrPath: string): Promise<void> {
    const url = `${this.app.options.apiUrl}/api/v1/storage/${this.app.options.projectId}/objects/${encodeURIComponent(objectIdOrPath)}`;
    const res = await fetch(url, { method: 'DELETE', headers: this.getHeaders() });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error || `Admin deleteObject failed: ${res.statusText}`);
    }
  }
}

export function getAdminStorage(app: AdminApp): AdminStorage {
  return new AdminStorage(app);
}

export const getStorage = getAdminStorage;
export type Storage = AdminStorage;

