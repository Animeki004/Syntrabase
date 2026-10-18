import { AdminApp, initializeAdminApp, getApp, getApps, AdminOptions } from './app.js';
import { getAdminFirestore, Timestamp, GeoPoint, Bytes, AdminFieldValue, FieldPath, Filter, AdminWriteBatch, AdminTransaction } from './firestore.js';
import { getAdminAuth } from './auth.js';
import { getAdminStorage } from './storage.js';

export * from './app.js';
export * from './firestore.js';
export * from './auth.js';
export * from './rules.js';
export * from './audit.js';
export * from './storage.js';

export const credential = {
  cert(serviceAccountOrPath: any): any {
    if (typeof serviceAccountOrPath === 'string') {
      try {
        const parsed = JSON.parse(serviceAccountOrPath);
        return credential.cert(parsed);
      } catch {
        try {
          const fs = typeof require !== 'undefined' ? require('fs') : null;
          if (fs && fs.existsSync(serviceAccountOrPath)) {
            const content = fs.readFileSync(serviceAccountOrPath, 'utf8');
            return credential.cert(JSON.parse(content));
          }
        } catch {}
      }
    }
    if (serviceAccountOrPath && typeof serviceAccountOrPath === 'object') {
      const projectId = serviceAccountOrPath.projectId || serviceAccountOrPath.project_id;
      const secretKey =
        serviceAccountOrPath.secretKey ||
        serviceAccountOrPath.secret_key ||
        serviceAccountOrPath.private_key;
      const apiUrl = serviceAccountOrPath.apiUrl || serviceAccountOrPath.api_url;
      return {
        projectId,
        secretKey,
        apiUrl,
        getOptions: () => ({ projectId, secretKey, apiUrl }),
      };
    }
    return serviceAccountOrPath;
  },
};

const firestoreFn = Object.assign(
  (app?: AdminApp) => getAdminFirestore(app),
  {
    Timestamp,
    GeoPoint,
    Bytes,
    FieldValue: AdminFieldValue,
    FieldPath,
    Filter,
    WriteBatch: AdminWriteBatch,
    Transaction: AdminTransaction,
    setLogFunction: (_fn: any) => {},
  }
);


const authFn = Object.assign(
  (app?: AdminApp) => getAdminAuth(app),
  {}
);

const storageFn = Object.assign(
  (app?: AdminApp) => getAdminStorage(app),
  {}
);

export const admin = {
  initializeApp(options?: AdminOptions | { credential?: any }): AdminApp {
    return initializeAdminApp(options as any);
  },
  credential,
  firestore: firestoreFn,
  auth: authFn,
  storage: storageFn,
  get apps(): AdminApp[] {
    return getApps();
  },
  app(name?: string): AdminApp {
    return getApp();
  },
};

export default admin;
