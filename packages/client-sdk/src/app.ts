export interface FirebaseOptions {
  apiKey: string; // Publishable key (pk_live_...)
  projectId: string;
  apiUrl: string;
  environmentId?: string;
}

export class FirebaseApp {
  private static instances = new Map<string, FirebaseApp>();

  constructor(
    public readonly name: string,
    public readonly options: FirebaseOptions
  ) {}

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
