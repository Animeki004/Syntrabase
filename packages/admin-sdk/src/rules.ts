import { AdminApp } from './app.js';

export class AdminRules {
  constructor(public readonly app: AdminApp) {}

  public async publishRules(sourceCode: string): Promise<{ versionNumber: number; publishedAt: string }> {
    const url = `${this.app.options.apiUrl}/api/v1/projects/${this.app.options.projectId}/rules/publish`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.app.options.secretKey,
      },
      body: JSON.stringify({ sourceCode }),
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error || `Publish rules failed: ${res.statusText}`);
    }

    return (await res.json()) as { versionNumber: number; publishedAt: string };
  }
}

export function getAdminRules(app: AdminApp): AdminRules {
  return new AdminRules(app);
}
