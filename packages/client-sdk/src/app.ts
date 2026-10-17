export interface FirebaseOptions {
  apiKey: string; // Publishable key (pk_live_...)
  projectId: string;
  apiUrl?: string;
  apiEndpoint?: string;
  environmentId?: string;
  realtimeEndpoint?: string;
}

export class FirebaseApp {
  private static instances = new Map<string, FirebaseApp>();
  public readonly options: FirebaseOptions & { apiUrl: string };

  constructor(
    public readonly name: string,
    rawOptions: FirebaseOptions
  ) {
    if (rawOptions.apiKey?.startsWith('sk_live_')) {
      throw new Error(
        'SECURITY VIOLATION: A server-only privileged secret key (sk_live_...) was passed to the client SDK. ' +
        'Client applications must strictly use publishable keys (pk_live_...).'
      );
    }
    const cleanApiUrl = (rawOptions.apiUrl || rawOptions.apiEndpoint || 'http://localhost:4000').replace(/\/+$/, '');
    this.options = {
      ...rawOptions,
      apiUrl: cleanApiUrl,
    };
  }

  public static initialize(options: FirebaseOptions, name = '[DEFAULT]'): FirebaseApp {
    const app = new FirebaseApp(name, options);
    this.instances.set(name, app);
    return app;
  }

  public static getInstance(name = '[DEFAULT]'): FirebaseApp {
    const app = this.instances.get(name);
    if (!app) {
      throw new Error(`FirebaseApp '${name}' has not been initialized. Call initializeApp() first.`);
    }
    return app;
  }
}

export function initializeApp(options: FirebaseOptions, name?: string): FirebaseApp {
  return FirebaseApp.initialize(options, name);
}

export function getApp(name?: string): FirebaseApp {
  return FirebaseApp.getInstance(name);
}
