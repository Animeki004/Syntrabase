export interface AdminOptions {
  apiUrl?: string;
  secretKey?: string; // sk_live_...
  projectId?: string;
  credential?: any;
}

export class AdminApp {
  private static instance: AdminApp | null = null;
  public readonly options: { apiUrl: string; secretKey: string; projectId: string };

  constructor(options: AdminOptions = {}) {
    // Compile-time / runtime defense: Fail immediately if imported into a browser environment
    if (typeof (globalThis as any).window !== 'undefined') {
      throw new Error(
        'SECURITY VIOLATION: @syntrabase/admin-sdk is strictly forbidden in browser bundles. ' +
        'It requires server-only privileged secret keys.'
      );
    }

    let credOptions: Partial<AdminOptions> = {};
    if (options && options.credential) {
      if (typeof options.credential.getOptions === 'function') {
        credOptions = options.credential.getOptions();
      } else if (typeof options.credential === 'object') {
        credOptions = options.credential;
      }
    }

    const apiUrl = (
      options.apiUrl ||
      credOptions.apiUrl ||
      (typeof process !== 'undefined' ? (process.env.SYNTRABASE_API_URL || process.env.API_URL) : undefined) ||
      'https://api.originhub.me'
    ).replace(/\/+$/, '');

    const projectId =
      options.projectId ||
      credOptions.projectId ||
      (credOptions as any)?.project_id ||
      (typeof process !== 'undefined' ? (process.env.SYNTRABASE_PROJECT_ID || process.env.PROJECT_ID) : undefined) ||
      '';

    const secretKey =
      options.secretKey ||
      credOptions.secretKey ||
      (credOptions as any)?.secret_key ||
      (credOptions as any)?.private_key ||
      (typeof process !== 'undefined' ? (process.env.SYNTRABASE_SECRET_KEY || process.env.SECRET_KEY) : undefined) ||
      '';

    if (!projectId) {
      throw new Error('Invalid Admin SDK credential: Must provide a projectId');
    }

    if (!secretKey || !secretKey.startsWith('sk_live_')) {
      throw new Error('Invalid Admin SDK credential: Must provide a privileged secret key starting with sk_live_');
    }

    this.options = { apiUrl, secretKey, projectId };
  }

  public static initialize(options: AdminOptions = {}): AdminApp {
    this.instance = new AdminApp(options);
    return this.instance;
  }

  public static getInstance(): AdminApp {
    if (!this.instance) {
      throw new Error('AdminApp has not been initialized. Call initializeAdminApp() first.');
    }
    return this.instance;
  }
}

export function initializeAdminApp(options: AdminOptions = {}): AdminApp {
  return AdminApp.initialize(options);
}

export const initializeApp = initializeAdminApp;
export const getApp = () => AdminApp.getInstance();
export const getApps = (): AdminApp[] => {
  try {
    return [AdminApp.getInstance()];
  } catch {
    return [];
  }
};
export type App = AdminApp;
