import { AdminApp } from './app.js';

export class AdminAudit {
  constructor(public readonly app: AdminApp) {}

  public async verifyLedger(): Promise<{ valid: boolean; totalChecked: number }> {
    const url = `${this.app.options.apiUrl}/api/v1/admin/audit/verify`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'x-api-key': this.app.options.secretKey,
      },
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error || `Audit verification failed: ${res.statusText}`);
    }

    return (await res.json()) as { valid: boolean; totalChecked: number };
  }
}

export function getAdminAudit(app: AdminApp): AdminAudit {
  return new AdminAudit(app);
}
