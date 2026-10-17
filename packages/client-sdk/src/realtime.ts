import {
  DocumentReference,
  CollectionReference,
  Query,
  getDoc,
  getDocs,
  QuerySnapshot,
  QueryDocumentSnapshot,
  DocumentSnapshotResult,
} from './firestore.js';
import { FirebaseApp } from './app.js';
import { getAuth } from './auth.js';
import { DocumentData } from '@syntrabase/shared-types';

export type SnapshotCallback = (snapshot: any) => void;
export type SnapshotErrorCallback = (error: Error) => void;

interface ActiveSubscription {
  id: string;
  isDoc: boolean;
  collectionPath: string;
  documentId?: string;
  environmentId: string;
  projectId: string;
  lastCheckpointId: string;
  onNext: SnapshotCallback;
  onError?: SnapshotErrorCallback;
  docsMap: Map<string, QueryDocumentSnapshot>;
  createQuerySnapshot: (changeItem?: {
    type: 'added' | 'modified' | 'removed';
    doc: any;
    wasExisting?: boolean;
  }) => QuerySnapshot;
}

class RealtimeConnectionPool {
  private static pools = new Map<FirebaseApp, RealtimeConnectionPool>();

  private ws: any = null;
  private isAuthenticated = false;
  private isConnecting = false;
  private subscriptions = new Map<string, ActiveSubscription>();
  private reconnectTimer: any = null;
  private reconnectDelay = 1000;

  constructor(private app: FirebaseApp) {}

  public static getInstance(app: FirebaseApp): RealtimeConnectionPool {
    let pool = this.pools.get(app);
    if (!pool) {
      pool = new RealtimeConnectionPool(app);
      this.pools.set(app, pool);
    }
    return pool;
  }

  private connect(): void {
    let WS =
      typeof globalThis !== 'undefined'
        ? (globalThis as any).WebSocket || (globalThis as any).window?.WebSocket
        : null;

    if (!WS) {
      try {
        const req = typeof require !== 'undefined' ? require : null;
        if (req) WS = req('ws');
      } catch {}
    }

    if (!WS) {
      console.warn('[Syntrabase SDK] WebSocket not supported in current environment; realtime stream disabled');
      return;
    }

    if (this.ws && (this.ws.readyState === 0 || this.ws.readyState === 1)) {
      return; // Already connecting or open
    }

    this.isConnecting = true;
    this.isAuthenticated = false;

    const wsUrl = this.app.options.apiUrl.replace(/^http/, 'ws') + '/ws/realtime';

    try {
      this.ws = new WS(wsUrl);

      this.ws.onopen = () => {
        this.isConnecting = false;
        this.reconnectDelay = 1000;

        // Authenticate socket with current auth token or API key
        const auth = getAuth(this.app);
        if (auth.accessToken) {
          this.ws.send(JSON.stringify({ type: 'auth', token: auth.accessToken }));
        } else if (this.app.options.apiKey) {
          this.ws.send(JSON.stringify({ type: 'auth', apiKey: this.app.options.apiKey }));
        }
      };

      this.ws.onmessage = (event: any) => {
        try {
          const msg = JSON.parse(event.data);

          if (msg.type === 'auth_success') {
            this.isAuthenticated = true;
            // Flush all active subscriptions immediately!
            for (const sub of this.subscriptions.values()) {
              this.sendListen(sub);
            }
            return;
          }

          if (msg.type === 'auth_error') {
            console.warn('[Syntrabase SDK] Realtime authentication error:', msg.message);
            return;
          }

          if (msg.type === 'error' && msg.subscriptionId) {
            const sub = this.subscriptions.get(msg.subscriptionId);
            if (sub && sub.onError) {
              sub.onError(new Error(msg.message || 'Permission denied by security rules'));
            }
            return;
          }

          if (msg.subscriptionId && msg.doc) {
            const sub = this.subscriptions.get(msg.subscriptionId);
            if (!sub) return;

            // Track continuous sequence cursor
            if (msg.sequenceId) {
              sub.lastCheckpointId = msg.sequenceId;
            }

            if (sub.isDoc) {
              sub.onNext({
                id: msg.doc.id,
                exists: () => msg.type !== 'removed',
                data: () => (msg.type === 'removed' ? undefined : msg.doc.data),
                version: msg.doc.version,
              });
            } else {
              // Collection snapshot update
              const wasExisting = sub.docsMap.has(msg.doc.id);
              if (msg.type === 'removed') {
                sub.docsMap.delete(msg.doc.id);
              } else {
                const docSnap: QueryDocumentSnapshot = {
                  id: msg.doc.id,
                  exists: () => true,
                  data: () => msg.doc.data,
                  version: msg.doc.version,
                };
                sub.docsMap.set(msg.doc.id, docSnap);
              }

              const changeType = msg.type === 'removed' ? 'removed' : wasExisting ? 'modified' : 'added';
              sub.onNext(
                sub.createQuerySnapshot({
                  type: changeType,
                  doc: {
                    id: msg.doc.id,
                    exists: () => msg.type !== 'removed',
                    data: () => (msg.type === 'removed' ? undefined : msg.doc.data),
                    version: msg.doc.version,
                  },
                  wasExisting,
                })
              );
            }
          }
        } catch {
          // Ignore malformed message frames
        }
      };

      this.ws.onerror = (err: any) => {
        // WebSocket error will trigger onclose which schedules reconnect
      };

      this.ws.onclose = () => {
        this.isAuthenticated = false;
        this.isConnecting = false;
        this.ws = null;

        // Automatically reconnect with exponential backoff if subscriptions remain active
        if (this.subscriptions.size > 0 && !this.reconnectTimer) {
          this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
          }, this.reconnectDelay);
          this.reconnectDelay = Math.min(10000, this.reconnectDelay * 2);
        }
      };
    } catch {
      this.isConnecting = false;
    }
  }

  private sendListen(sub: ActiveSubscription): void {
    if (this.ws && this.ws.readyState === 1 && this.isAuthenticated) {
      try {
        this.ws.send(
          JSON.stringify({
            type: 'listen',
            subscriptionId: sub.id,
            projectId: sub.projectId,
            environmentId: sub.environmentId,
            collectionPath: sub.collectionPath,
            documentId: sub.documentId,
            lastCheckpointId: sub.lastCheckpointId,
          })
        );
      } catch {
        // Socket write error
      }
    }
  }

  public subscribe(sub: ActiveSubscription): () => void {
    this.subscriptions.set(sub.id, sub);

    if (!this.ws || this.ws.readyState === 3) {
      this.connect();
    } else if (this.isAuthenticated) {
      this.sendListen(sub);
    }

    return () => {
      this.subscriptions.delete(sub.id);
      if (this.ws && this.ws.readyState === 1) {
        try {
          this.ws.send(JSON.stringify({ type: 'unlisten', subscriptionId: sub.id }));
        } catch {
          // ignore
        }
      }

      if (this.subscriptions.size === 0) {
        // Disconnect idle socket
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
        if (this.ws) {
          try {
            this.ws.close();
          } catch {}
          this.ws = null;
        }
      }
    };
  }
}

/**
 * Drop-in Firebase Firestore Realtime Listener `onSnapshot`.
 *
 * Supports DocumentReference, CollectionReference, and Query targets.
 * Emits full `DocumentSnapshot` or `QuerySnapshot` objects with native `.docs`,
 * `.forEach()`, `[Symbol.iterator]()`, and `.docChanges()` support.
 */
export function onSnapshot(
  targetRef: DocumentReference | CollectionReference | Query,
  ...args: any[]
): () => void {
  let onNext: SnapshotCallback = () => {};
  let onError: SnapshotErrorCallback | undefined = undefined;

  if (typeof args[0] === 'function') {
    onNext = args[0];
    onError = typeof args[1] === 'function' ? args[1] : undefined;
  } else if (typeof args[0] === 'object' && args[0] !== null && typeof args[0].next === 'function') {
    onNext = args[0].next.bind(args[0]);
    onError = typeof args[0].error === 'function' ? args[0].error.bind(args[0]) : undefined;
  } else if (typeof args[0] === 'object' && args[0] !== null && typeof args[1] === 'function') {
    onNext = args[1];
    onError = typeof args[2] === 'function' ? args[2] : undefined;
  } else if (
    typeof args[0] === 'object' &&
    args[0] !== null &&
    typeof args[1] === 'object' &&
    args[1] !== null &&
    typeof args[1].next === 'function'
  ) {
    onNext = args[1].next.bind(args[1]);
    onError = typeof args[1].error === 'function' ? args[1].error.bind(args[1]) : undefined;
  }

  const isDoc = targetRef instanceof DocumentReference;
  const isQuery = targetRef instanceof Query;
  const collectionRef = isDoc ? undefined : isQuery ? targetRef.collectionRef : (targetRef as CollectionReference);
  const db = isDoc ? targetRef.firestore : collectionRef!.firestore;
  const auth = getAuth(db.app);

  let collectionPath: string;
  let documentId: string | undefined = undefined;

  if (isDoc) {
    const parts = targetRef.path.replace(/^\/+|\/+$/g, '').split('/');
    documentId = parts.pop()!;
    collectionPath = parts.join('/');
  } else {
    collectionPath = collectionRef!.path;
  }

  const localStore = typeof globalThis !== 'undefined' ? (globalThis as any).localStorage : null;
  const environmentId =
    db.app.options.environmentId ||
    auth.currentUser?.environmentId ||
    (localStore ? localStore.getItem(`syntrabase_env_${db.app.options.projectId}`) : null) ||
    'default';

  const docsMap = new Map<string, QueryDocumentSnapshot>();

  const createQuerySnapshot = (changeItem?: {
    type: 'added' | 'modified' | 'removed';
    doc: any;
    wasExisting?: boolean;
  }): QuerySnapshot => {
    const docs = Array.from(docsMap.values());
    return {
      docs,
      empty: docs.length === 0,
      size: docs.length,
      docChanges: () => {
        if (!changeItem) {
          return docs.map((d, i) => ({ type: 'added' as const, doc: d, oldIndex: -1, newIndex: i }));
        }
        return [
          {
            type: changeItem.type,
            doc: changeItem.doc,
            oldIndex: changeItem.wasExisting ? 0 : -1,
            newIndex: changeItem.type === 'removed' ? -1 : 0,
          },
        ];
      },
      forEach(callback: (result: QueryDocumentSnapshot) => void): void {
        docs.forEach(callback);
      },
      [Symbol.iterator](): Iterator<QueryDocumentSnapshot> {
        return docs[Symbol.iterator]();
      },
    };
  };

  // 1. Initial Data Fetch
  if (isDoc) {
    getDoc(targetRef as DocumentReference)
      .then((snap) => onNext(snap))
      .catch((err) => onError && onError(err));
  } else {
    getDocs(targetRef as CollectionReference | Query)
      .then((querySnap) => {
        for (const docSnap of querySnap.docs) {
          docsMap.set(docSnap.id, docSnap);
        }
        onNext(createQuerySnapshot());
      })
      .catch((err) => onError && onError(err));
  }

  // 2. Register with Multiplexed Realtime Pool
  const subscriptionId = `sub_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const pool = RealtimeConnectionPool.getInstance(db.app);

  const unsubscribe = pool.subscribe({
    id: subscriptionId,
    isDoc,
    collectionPath,
    documentId,
    environmentId,
    projectId: db.app.options.projectId,
    lastCheckpointId: '0',
    onNext,
    onError,
    docsMap,
    createQuerySnapshot,
  });

  return unsubscribe;
}
