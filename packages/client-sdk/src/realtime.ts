import { DocumentReference, CollectionReference, Query, getDoc, getDocs } from './firestore.js';
import { getAuth } from './auth.js';
import { DocumentData } from '@syntrabase/shared-types';

export type SnapshotCallback = (snapshot: any) => void;
export type SnapshotErrorCallback = (error: Error) => void;

export function onSnapshot(
  targetRef: DocumentReference | CollectionReference | Query,
  onNext: SnapshotCallback,
  onError?: SnapshotErrorCallback
): () => void {
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

  // 1. Initial fetch
  if (isDoc) {
    getDoc(targetRef as DocumentReference)
      .then((snap) => onNext(snap))
      .catch((err) => onError && onError(err));
  } else {
    getDocs(targetRef as CollectionReference | Query)
      .then((snap) => onNext(snap))
      .catch((err) => onError && onError(err));
  }

  // 2. Establish WebSocket realtime subscription
  const wsUrl = db.app.options.apiUrl.replace(/^http/, 'ws') + '/ws/realtime';
  let ws: any;
  const subscriptionId = `sub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  try {
    // Support browser native WebSocket or Node ws
    const WS = typeof globalThis !== 'undefined' ? (globalThis as any).WebSocket : null;
    if (!WS) {
      console.warn('[SDK] WebSocket not supported in current environment; realtime listener skipped');
      return () => {};
    }

    ws = new WS(wsUrl);

    ws.onopen = () => {
      // Authenticate socket with access token or publishable API key
      if (auth.accessToken) {
        ws.send(JSON.stringify({ type: 'auth', token: auth.accessToken }));
      } else if (db.app.options.apiKey) {
        ws.send(JSON.stringify({ type: 'auth', apiKey: db.app.options.apiKey }));
      }

      // Register listener
      ws.send(
        JSON.stringify({
          type: 'listen',
          subscriptionId,
          projectId: db.app.options.projectId,
          environmentId: db.app.options.environmentId || 'default',
          collectionPath,
          documentId,
          lastCheckpointId: '0',
        })
      );
    };

    ws.onmessage = (event: any) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'error' && msg.subscriptionId === subscriptionId) {
          if (onError) onError(new Error(msg.message || 'Permission denied by security rules'));
          return;
        }

        if (msg.subscriptionId === subscriptionId && msg.doc) {
          onNext({
            exists: () => msg.type !== 'removed',
            data: () => (msg.type === 'removed' ? undefined : msg.doc.data),
            id: msg.doc.id,
          });
        }
      } catch {
        // ignore malformed ws messages
      }
    };

    ws.onerror = (err: any) => {
      if (onError) onError(new Error(err.message || 'WebSocket connection error'));
    };
  } catch (err: unknown) {
    if (onError) onError(err as Error);
  }

  // Return unsubscribe cleanup function
  return () => {
    if (ws && ws.readyState === 1) {
      try {
        ws.send(JSON.stringify({ type: 'unlisten', subscriptionId }));
        ws.close();
      } catch {
        // ignore
      }
    }
  };
}
