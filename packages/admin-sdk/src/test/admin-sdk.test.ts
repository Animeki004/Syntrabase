import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeAdminApp, getAdminFirestore, getAdminAuth, getAdminRules } from '../index.js';

test('Admin SDK - Rejects invalid secret key format', () => {
  assert.throws(
    () => {
      initializeAdminApp({
        apiUrl: 'http://localhost:4000',
        secretKey: 'pk_live_unauthorized_key',
        projectId: 'test-project',
      });
    },
    /Must provide a privileged secret key starting with sk_live_/
  );
});

test('Admin SDK - Initializes with valid sk_live key', () => {
  const app = initializeAdminApp({
    apiUrl: 'http://localhost:4000',
    secretKey: 'sk_live_valid_test_secret_key_1234567890',
    projectId: 'test-project',
  });

  assert.ok(app);
  assert.equal(app.options.projectId, 'test-project');

  const db = getAdminFirestore(app);
  assert.ok(db);
  assert.equal(typeof db.getDoc, 'function');
  assert.equal(typeof db.setDoc, 'function');

  const auth = getAdminAuth(app);
  assert.ok(auth);
  assert.equal(typeof auth.getUser, 'function');
  assert.equal(typeof auth.createCustomToken, 'function');
  assert.equal(typeof auth.generateEmailVerificationLink, 'function');
  assert.equal(typeof auth.generatePasswordResetLink, 'function');
  assert.equal(typeof auth.generateSignInWithEmailLink, 'function');
  assert.equal(typeof auth.setUserActions, 'function');
  assert.equal(typeof auth.getUserActions, 'function');
  assert.equal(typeof auth.setMfaPolicy, 'function');
  assert.equal(typeof auth.getMfaPolicy, 'function');
  assert.equal(typeof auth.getUserMfa, 'function');
  assert.equal(typeof auth.unenrollUserMfa, 'function');
  assert.equal(typeof auth.listUserPasskeys, 'function');
  assert.equal(typeof auth.deleteUserPasskey, 'function');

  const rules = getAdminRules(app);
  assert.ok(rules);
  assert.equal(typeof rules.publishRules, 'function');

  assert.equal(typeof db.updateDoc, 'function');
});

test('Admin SDK - Storage module initializes properly', async () => {
  const { getAdminStorage } = await import('../index.js');
  const app = initializeAdminApp({
    apiUrl: 'http://localhost:4000',
    secretKey: 'sk_live_valid_test_secret_key_1234567890',
    projectId: 'test-project',
  });

  const storage = getAdminStorage(app);
  assert.ok(storage);
  assert.equal(typeof storage.getSignedDownloadUrl, 'function');
  assert.equal(typeof storage.listObjects, 'function');
  assert.equal(typeof storage.deleteObject, 'function');
});

test('Admin SDK - verifyIdToken validates claims, exp, and projectId boundary', async () => {
  const app = initializeAdminApp({
    apiUrl: 'http://localhost:4000',
    secretKey: 'sk_live_valid_test_secret_key_1234567890',
    projectId: 'test-project',
  });
  const auth = getAdminAuth(app);

  const makeJwt = (payloadObj: Record<string, unknown>) => {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify(payloadObj)).toString('base64url');
    const signature = 'test_signature';
    return `${header}.${payload}.${signature}`;
  };

  const now = Math.floor(Date.now() / 1000);

  // 1. Valid token
  const validToken = makeJwt({
    uid: 'user_123',
    email: 'user@example.com',
    projectId: 'test-project',
    exp: now + 3600,
  });
  const verified = await auth.verifyIdToken(validToken);
  assert.equal(verified.uid, 'user_123');
  assert.equal(verified.email, 'user@example.com');

  // 2. Expired token
  const expiredToken = makeJwt({
    uid: 'user_123',
    projectId: 'test-project',
    exp: now - 60,
  });
  await assert.rejects(
    async () => auth.verifyIdToken(expiredToken),
    /Firebase ID token has expired/
  );

  // 3. Project mismatch token
  const foreignToken = makeJwt({
    uid: 'user_123',
    projectId: 'other-project',
    exp: now + 3600,
  });
  await assert.rejects(
    async () => auth.verifyIdToken(foreignToken),
    /Token projectId mismatch/
  );

  // 4. Missing uid/sub
  const noUidToken = makeJwt({
    role: 'admin',
    projectId: 'test-project',
    exp: now + 3600,
  });
  await assert.rejects(
    async () => auth.verifyIdToken(noUidToken),
    /Token payload missing user identifier/
  );
});

test('Admin SDK - Rejects initialization if window exists (Browser Guardrail)', () => {
  (globalThis as any).window = {};
  assert.throws(
    () => {
      initializeAdminApp({
        apiUrl: 'http://localhost:4000',
        secretKey: 'sk_live_valid_key',
        projectId: 'test-project',
      });
    },
    /SECURITY VIOLATION: @syntrabase\/admin-sdk is strictly forbidden in browser bundles/
  );
  delete (globalThis as any).window;
});

test('Admin SDK - Supports collection and document reference chaining for subcollections', () => {
  const app = initializeAdminApp({
    apiUrl: 'http://localhost:4000',
    secretKey: 'sk_live_valid_test_secret_key_1234567890',
    projectId: 'test-project',
  });
  const db = getAdminFirestore(app);

  // 1. Chaining through collections and documents
  const settingDocRef = db.collection('artifacts').doc('default-app-id').collection('admin').doc('settings');
  assert.equal(settingDocRef.path, 'artifacts/default-app-id/admin/settings');
  assert.equal(settingDocRef.id, 'settings');

  // 2. Direct doc reference
  const directDocRef = db.doc('artifacts/default-app-id/admin/settings');
  assert.equal(directDocRef.path, 'artifacts/default-app-id/admin/settings');
  assert.equal(directDocRef.id, 'settings');

  // 3. Subcollection reference
  const subcolRef = db.collection('artifacts/default-app-id/public/data/movies');
  assert.equal(subcolRef.path, 'artifacts/default-app-id/public/data/movies');
});

test('Admin SDK - Drop-in modular compatibility (initializeApp, getApp, getApps, getAuth, getFirestore)', async () => {
  const { initializeApp, getApp, getApps, getAuth, getFirestore, getStorage } = await import('../index.js');
  
  assert.equal(typeof initializeApp, 'function');
  assert.equal(typeof getApp, 'function');
  assert.equal(typeof getApps, 'function');
  assert.equal(typeof getAuth, 'function');
  assert.equal(typeof getFirestore, 'function');
  assert.equal(typeof getStorage, 'function');

  const app = initializeApp({
    apiUrl: 'http://localhost:4000',
    secretKey: 'sk_live_valid_test_secret_key_1234567890',
    projectId: 'test-project',
  });

  assert.equal(getApp(), app);
  const apps = getApps();
  assert.equal(apps.length, 1);
  assert.equal(apps[0], app);

  const auth = getAuth(app);
  assert.ok(auth);
  const db = getFirestore(app);
  assert.ok(db);
  const storage = getStorage(app);
  assert.ok(storage);
});

test('Admin SDK - Drop-in default export `admin` with namespaced APIs', async () => {
  const admin = (await import('../index.js')).default;
  assert.ok(admin);
  assert.equal(typeof admin.initializeApp, 'function');
  assert.equal(typeof admin.firestore, 'function');
  assert.equal(typeof admin.auth, 'function');
  assert.equal(typeof admin.storage, 'function');
  assert.equal(typeof admin.credential.cert, 'function');

  // Test credential.cert with JSON object
  const cred = admin.credential.cert({
    projectId: 'test-project-cert',
    secretKey: 'sk_live_cert_secret_key_1234567890',
    apiUrl: 'http://localhost:4000',
  });
  assert.ok(cred);
  assert.equal(cred.projectId, 'test-project-cert');

  // Test admin.initializeApp({ credential })
  const app = admin.initializeApp({ credential: cred });
  assert.ok(app);
  assert.equal(app.options.projectId, 'test-project-cert');

  // Test zero-arg admin.firestore() and admin.auth()
  const db = admin.firestore();
  assert.ok(db);
  assert.equal(typeof db.collection, 'function');
  assert.equal(typeof db.doc, 'function');

  const auth = admin.auth();
  assert.ok(auth);
  assert.equal(typeof auth.verifyIdToken, 'function');

  // Test static firestore namespaces
  assert.ok(admin.firestore.Timestamp);
  assert.ok(admin.firestore.FieldValue);
  assert.ok(admin.firestore.GeoPoint);
});

test('Admin SDK - DocumentSnapshot and QuerySnapshot contract compatibility', async () => {
  const { DocumentSnapshot, QueryDocumentSnapshot, QuerySnapshot } = await import('../index.js');

  const mockRef: any = { id: 'user_doc_1', path: 'users/user_doc_1' };

  // 1. Existing DocumentSnapshot
  const existingDoc = new DocumentSnapshot(mockRef, {
    id: 'user_doc_1',
    data: { name: 'Alice', maxDevices: 3, profile: { role: 'admin' } },
  });
  assert.equal(existingDoc.exists, true);
  assert.equal(existingDoc.id, 'user_doc_1');
  assert.deepEqual(existingDoc.data(), { name: 'Alice', maxDevices: 3, profile: { role: 'admin' } });
  assert.equal(existingDoc.get('profile.role'), 'admin');

  // 2. Non-existent DocumentSnapshot (404)
  const missingDoc = new DocumentSnapshot(mockRef, null);
  assert.equal(missingDoc.exists, false);
  assert.equal(missingDoc.id, 'user_doc_1');
  assert.equal(missingDoc.data(), undefined);

  // 3. QuerySnapshot
  const qdoc1 = new QueryDocumentSnapshot(mockRef, { id: 'doc1', data: { title: 'Movie 1' } });
  const qdoc2 = new QueryDocumentSnapshot(mockRef, { id: 'doc2', data: { title: 'Movie 2' } });
  const qsnap = new QuerySnapshot([qdoc1, qdoc2]);

  assert.equal(qsnap.empty, false);
  assert.equal(qsnap.size, 2);
  assert.equal(qsnap.docs.length, 2);

  // Array accessors
  assert.deepEqual(qsnap.docs.map(d => d.id), ['doc1', 'doc2']);
  assert.deepEqual(qsnap.map(d => d.data().title), ['Movie 1', 'Movie 2']);

  let count = 0;
  qsnap.forEach((doc) => {
    assert.ok(doc.id);
    assert.ok(doc.data().title);
    count++;
  });
  assert.equal(count, 2);
});

test('Admin SDK - Standard Firebase 20-character alphanumeric autoId generation', async () => {
  const { autoId, default: admin } = await import('../index.js');
  assert.equal(typeof autoId, 'function');

  const idPattern = /^[A-Za-z0-9]{20}$/;
  const generatedIds = new Set<string>();

  for (let i = 0; i < 50; i++) {
    const id = autoId();
    assert.equal(id.length, 20);
    assert.ok(idPattern.test(id), `Admin auto ID '${id}' must be alphanumeric`);
    generatedIds.add(id);
  }
  assert.equal(generatedIds.size, 50);

  const db = admin.firestore();
  const autoDocRef = db.collection('movies').doc();
  assert.equal(autoDocRef.id.length, 20);
  assert.ok(idPattern.test(autoDocRef.id), `Admin doc auto ID '${autoDocRef.id}' must be 20-char alphanumeric`);
  assert.equal(autoDocRef.path, `movies/${autoDocRef.id}`);
});
