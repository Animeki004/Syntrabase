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
