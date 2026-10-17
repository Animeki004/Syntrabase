export interface AdminOptions {
  apiUrl: string;
  secretKey: string; // sk_live_...
  projectId: string;
}

export class AdminApp {
  private static instance: AdminApp | null = null;

  constructor(public readonly options: AdminOptions) {
    // Compile-time / runtime defense: Fail immediately if imported into a browser environment
    if (typeof (globalThis as any).window !== 'undefined') {
      throw new Error(
        'SECURITY VIOLATION: @syntrabase/admin-sdk is strictly forbidden in browser bundles. ' +
        'It requires server-only privileged secret keys.'
      );
    }

    if (!options.secretKey.startsWith('sk_live_')) {
      throw new Error('Invalid Admin SDK credential: Must provide a privileged secret key starting with sk_live_');
    }
  }

  public static initialize(options: AdminOptions): AdminApp {
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

export function initializeAdminApp(options: AdminOptions): AdminApp {
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
