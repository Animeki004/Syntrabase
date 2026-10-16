import { DocumentReference, getDoc } from './firestore.js';
import { getAuth } from './auth.js';
export function onSnapshot(targetRef, onNext, onError) {
    const db = targetRef.firestore;
    const auth = getAuth(db.app);
    const isDoc = targetRef instanceof DocumentReference;
    let collectionPath;
    let documentId = undefined;
    if (isDoc) {
        const parts = targetRef.path.replace(/^\/+|\/+$/g, '').split('/');
        documentId = parts.pop();
        collectionPath = parts.join('/');
    }
    else {
        collectionPath = targetRef.path;
    }
    // 1. Initial fetch
    if (isDoc) {
        getDoc(targetRef)
            .then((snap) => onNext(snap))
            .catch((err) => onError && onError(err));
    }
    // 2. Establish WebSocket realtime subscription
    const wsUrl = db.app.options.apiUrl.replace(/^http/, 'ws') + '/ws/realtime';
    let ws;
    const subscriptionId = `sub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    try {
        // Support browser native WebSocket or Node ws
        const WS = typeof globalThis !== 'undefined' ? globalThis.WebSocket : null;
        if (!WS) {
            console.warn('[SDK] WebSocket not supported in current environment; realtime listener skipped');
            return () => { };
        }
        ws = new WS(wsUrl);
        ws.onopen = () => {
            // Authenticate socket if token available
            if (auth.accessToken) {
                ws.send(JSON.stringify({ type: 'auth', token: auth.accessToken }));
            }
            // Register listener
            ws.send(JSON.stringify({
                type: 'listen',
                subscriptionId,
                projectId: db.app.options.projectId,
                environmentId: db.app.options.environmentId || 'default',
                collectionPath,
                documentId,
                lastCheckpointId: '0',
            }));
        };
        ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                if (msg.subscriptionId === subscriptionId && msg.doc) {
                    onNext({
                        exists: () => msg.type !== 'removed',
                        data: () => (msg.type === 'removed' ? undefined : msg.doc.data),
                        id: msg.doc.id,
                    });
                }
            }
            catch {
                // ignore malformed ws messages
            }
        };
        ws.onerror = (err) => {
            if (onError)
                onError(new Error(err.message || 'WebSocket connection error'));
        };
    }
    catch (err) {
        if (onError)
            onError(err);
    }
    // Return unsubscribe cleanup function
    return () => {
        if (ws && ws.readyState === 1) {
            try {
                ws.send(JSON.stringify({ type: 'unlisten', subscriptionId }));
                ws.close();
            }
            catch {
                // ignore
            }
        }
    };
}
//# sourceMappingURL=realtime.js.map