import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import * as ClientSDK from '../index.js';

test('Security Gate - Client SDK must not export privileged admin functions', () => {
  const exports = Object.keys(ClientSDK);

  const forbiddenAdminSymbols = [
    'initializeAdminApp',
    'getAdminFirestore',
    'getAdminAuth',
    'getAdminRules',
    'exportCollection',
    'revokeProject',
    'platform_admins',
  ];

  for (const sym of forbiddenAdminSymbols) {
    assert.equal(
      exports.includes(sym),
      false,
      `Security violation: Client SDK exports forbidden admin symbol '${sym}'`
    );
  }
});

test('Security Gate - Client SDK bundle must not contain server secrets or environment variables', () => {
  const distDir = path.resolve(process.cwd(), 'packages/client-sdk/dist');
  if (!fs.existsSync(distDir)) {
    return; // Will be validated post-build
  }

  const files = fs.readdirSync(distDir);
  const forbiddenPatterns = [
    /sk_live_/,
    /DATABASE_PASSWORD/,
    /JWT_SECRET/,
    /AUDIT_HMAC_SECRET/,
    /password_pepper/i,
  ];

  for (const file of files) {
    if (file.endsWith('.js')) {
      const content = fs.readFileSync(path.join(distDir, file), 'utf8');
      for (const pattern of forbiddenPatterns) {
        assert.equal(
          pattern.test(content),
          false,
          `Security violation: File ${file} matches forbidden secret pattern ${pattern}`
        );
      }
    }
  }
});

test('Client SDK API Surface - Exposes standard Firebase v9/v10 functions', () => {
  assert.equal(typeof ClientSDK.initializeApp, 'function');
  assert.equal(typeof ClientSDK.getFirestore, 'function');
  assert.equal(typeof ClientSDK.doc, 'function');
  assert.equal(typeof ClientSDK.collection, 'function');
  assert.equal(typeof ClientSDK.getDoc, 'function');
  assert.equal(typeof ClientSDK.setDoc, 'function');
  assert.equal(typeof ClientSDK.updateDoc, 'function');
  assert.equal(typeof ClientSDK.deleteDoc, 'function');
  assert.equal(typeof ClientSDK.query, 'function');
  assert.equal(typeof ClientSDK.where, 'function');
  assert.equal(typeof ClientSDK.onSnapshot, 'function');
  assert.equal(typeof ClientSDK.getAuth, 'function');
  assert.equal(typeof ClientSDK.getStorage, 'function');
  // Syntrabase Core Additions
  assert.equal(typeof ClientSDK.signInAnonymously, 'function');
  assert.equal(typeof ClientSDK.linkWithEmailAndPassword, 'function');
  assert.equal(typeof ClientSDK.sendEmailVerification, 'function');
  assert.equal(typeof ClientSDK.applyActionCode, 'function');
  assert.equal(typeof ClientSDK.sendPasswordResetEmail, 'function');
  assert.equal(typeof ClientSDK.confirmPasswordReset, 'function');
  assert.equal(typeof ClientSDK.serverTimestamp, 'function');
  assert.equal(typeof ClientSDK.increment, 'function');
  assert.equal(typeof ClientSDK.arrayUnion, 'function');
  assert.equal(typeof ClientSDK.arrayRemove, 'function');
  assert.equal(typeof ClientSDK.deleteField, 'function');
  assert.equal(typeof ClientSDK.runTransaction, 'function');
  assert.equal(typeof ClientSDK.collectionGroup, 'function');
  assert.equal(typeof ClientSDK.enableIndexedDbPersistence, 'function');
  assert.equal(typeof ClientSDK.addDoc, 'function');
  assert.equal(typeof ClientSDK.deleteObject, 'function');
  assert.equal(typeof ClientSDK.listAll, 'function');
  // Two-Factor Authentication & WebAuthn Passkeys
  assert.equal(typeof ClientSDK.enrollTotp, 'function');
  assert.equal(typeof ClientSDK.verifyAndActivateTotp, 'function');
  assert.equal(typeof ClientSDK.unenrollTotp, 'function');
  assert.equal(typeof ClientSDK.completeMfaSignIn, 'function');
  assert.equal(typeof ClientSDK.deleteUser, 'function');
  assert.equal(typeof ClientSDK.registerPasskey, 'function');
  assert.equal(typeof ClientSDK.signInWithPasskey, 'function');
  assert.equal(typeof ClientSDK.listPasskeys, 'function');
  assert.equal(typeof ClientSDK.deletePasskey, 'function');
  // Full Modular Firebase v9/v10 Equivalence Additions
  assert.equal(typeof ClientSDK.Timestamp, 'function');
  assert.equal(typeof ClientSDK.GeoPoint, 'function');
  assert.equal(typeof ClientSDK.Bytes, 'function');
  assert.equal(typeof ClientSDK.FieldValue, 'function');
  assert.equal(typeof ClientSDK.limitToLast, 'function');
  assert.equal(typeof ClientSDK.startAt, 'function');
  assert.equal(typeof ClientSDK.startAfter, 'function');
  assert.equal(typeof ClientSDK.endAt, 'function');
  assert.equal(typeof ClientSDK.endBefore, 'function');
  assert.equal(typeof ClientSDK.uploadString, 'function');
  assert.equal(typeof ClientSDK.list, 'function');
  assert.equal(typeof ClientSDK.updateProfile, 'function');
  assert.equal(typeof ClientSDK.updatePassword, 'function');
  assert.equal(typeof ClientSDK.updateEmail, 'function');
  assert.equal(typeof ClientSDK.getIdToken, 'function');
  assert.equal(typeof ClientSDK.browserLocalPersistence, 'string');
  assert.equal(typeof ClientSDK.browserSessionPersistence, 'string');
  assert.equal(typeof ClientSDK.inMemoryPersistence, 'string');
  assert.equal(typeof ClientSDK.setPersistence, 'function');
  assert.equal(typeof ClientSDK.signInWithCustomToken, 'function');
});

test('Client SDK Storage - toBase64 handles Uint8Array and Buffer correctly', async () => {
  const sampleString = 'Hello Syntrabase Storage!';
  const expectedBase64 = Buffer.from(sampleString, 'utf8').toString('base64');

  // Test Buffer
  const buf = Buffer.from(sampleString, 'utf8');
  const b64FromBuf = await ClientSDK.toBase64(buf);
  assert.equal(b64FromBuf, expectedBase64);

  // Test Uint8Array
  const uint8 = new Uint8Array(Buffer.from(sampleString, 'utf8'));
  const b64FromUint8 = await ClientSDK.toBase64(uint8);
  assert.equal(b64FromUint8, expectedBase64);

  // Test Blob (simulated browser or node Blob)
  if (typeof Blob !== 'undefined') {
    const blob = new Blob([sampleString], { type: 'text/plain' });
    const b64FromBlob = await ClientSDK.toBase64(blob);
    assert.equal(b64FromBlob, expectedBase64);
  }
});

test('Client SDK Firestore - Supports hierarchical subcollections and multi-segment paths', () => {
  const app = ClientSDK.initializeApp({
    apiKey: 'syn_test_key',
    projectId: 'test-project',
    apiUrl: 'http://localhost:3000',
  });
  const db = ClientSDK.getFirestore(app);

  // 1. Direct multi-segment string path
  const docRef1 = ClientSDK.doc(db, 'artifacts/default-app-id/admin/settings');
  assert.equal(docRef1.path, 'artifacts/default-app-id/admin/settings');
  assert.equal(docRef1.id, 'settings');

  // 2. Variadic segments
  const docRef2 = ClientSDK.doc(db, 'artifacts', 'default-app-id', 'admin', 'settings');
  assert.equal(docRef2.path, 'artifacts/default-app-id/admin/settings');
  assert.equal(docRef2.id, 'settings');

  // 3. Subcollection from DocumentReference
  const parentDocRef = ClientSDK.doc(db, 'artifacts', 'default-app-id');
  const subColRef = ClientSDK.collection(parentDocRef, 'admin');
  assert.equal(subColRef.path, 'artifacts/default-app-id/admin');

  // 4. Document from SubcollectionReference
  const subDocRef = ClientSDK.doc(subColRef, 'settings');
  assert.equal(subDocRef.path, 'artifacts/default-app-id/admin/settings');
  assert.equal(subDocRef.id, 'settings');
});

test('Client SDK Firestore - Timestamp, GeoPoint, and Bytes data structures', () => {
  // Timestamp
  const now = ClientSDK.Timestamp.now();
  assert.equal(typeof now.seconds, 'number');
  assert.equal(typeof now.nanoseconds, 'number');
  assert.ok(now.toDate() instanceof Date);
  assert.equal(typeof now.toMillis(), 'number');

  const fromDate = ClientSDK.Timestamp.fromDate(new Date(1700000000000));
  assert.equal(fromDate.toMillis(), 1700000000000);
  assert.ok(fromDate.isEqual(ClientSDK.Timestamp.fromMillis(1700000000000)));

  // GeoPoint
  const geo = new ClientSDK.GeoPoint(37.7749, -122.4194);
  assert.equal(geo.latitude, 37.7749);
  assert.equal(geo.longitude, -122.4194);
  assert.ok(geo.isEqual(new ClientSDK.GeoPoint(37.7749, -122.4194)));
  assert.throws(() => new ClientSDK.GeoPoint(100, 0));

  // Bytes
  const rawBytes = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
  const bytes = ClientSDK.Bytes.fromUint8Array(rawBytes);
  assert.equal(bytes.toBase64(), 'SGVsbG8=');
  assert.deepEqual(Array.from(bytes.toUint8Array()), [72, 101, 108, 108, 111]);
});

test('Client SDK - User exact import signature validation', () => {
  const {
    initializeApp,
    getAuth,
    signInAnonymously,
    signInWithCustomToken,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    signOut,
    setPersistence,
    browserLocalPersistence,
    getFirestore,
    doc,
    deleteDoc,
    onSnapshot,
    collection,
    addDoc,
    updateDoc,
    getDoc,
    setDoc,
  } = ClientSDK;

  assert.equal(typeof initializeApp, 'function');
  assert.equal(typeof getAuth, 'function');
  assert.equal(typeof signInAnonymously, 'function');
  assert.equal(typeof signInWithCustomToken, 'function');
  assert.equal(typeof onAuthStateChanged, 'function');
  assert.equal(typeof signInWithEmailAndPassword, 'function');
  assert.equal(typeof signOut, 'function');
  assert.equal(typeof setPersistence, 'function');
  assert.equal(typeof browserLocalPersistence, 'string');
  assert.equal(typeof getFirestore, 'function');
  assert.equal(typeof doc, 'function');
  assert.equal(typeof deleteDoc, 'function');
  assert.equal(typeof onSnapshot, 'function');
  assert.equal(typeof collection, 'function');
  assert.equal(typeof addDoc, 'function');
  assert.equal(typeof updateDoc, 'function');
  assert.equal(typeof getDoc, 'function');
  assert.equal(typeof setDoc, 'function');

  // Verify instantiation with user configuration structure
  const testConfig = {
    projectId: '08121278-7bd1-4a7d-8081-f7e2f6c3e2d7',
    apiKey: 'pk_live_88ca9ce5146182936c23d8a77618a6fe',
    apiUrl: 'https://api.originhub.me',
  };

  const app = initializeApp(testConfig);
  assert.equal(app.options.projectId, testConfig.projectId);
  assert.equal(app.options.apiUrl, 'https://api.originhub.me');

  const auth = getAuth(app);
  assert.ok(auth);

  const db = getFirestore(app);
  assert.ok(db);

  const testDoc = doc(db, 'artifacts', 'default-app-id');
  assert.equal(testDoc.path, 'artifacts/default-app-id');
});

test('Client SDK - Browser Local and Session Persistence Lifecycle', async () => {
  // Setup mock localStorage and sessionStorage on globalThis
  const mockLocalStorage = new Map<string, string>();
  const mockSessionStorage = new Map<string, string>();

  (globalThis as any).window = {
    localStorage: {
      getItem: (k: string) => mockLocalStorage.get(k) ?? null,
      setItem: (k: string, v: string) => mockLocalStorage.set(k, v),
      removeItem: (k: string) => mockLocalStorage.delete(k),
    },
    sessionStorage: {
      getItem: (k: string) => mockSessionStorage.get(k) ?? null,
      setItem: (k: string, v: string) => mockSessionStorage.set(k, v),
      removeItem: (k: string) => mockSessionStorage.delete(k),
    },
  };

  const app = ClientSDK.initializeApp({
    apiKey: 'pk_test',
    projectId: 'persist-test',
    apiUrl: 'https://api.originhub.me',
  });

  const auth = new ClientSDK.Auth(app);
  const sampleUser = { id: 'user_123', email: 'test@example.com' } as any;

  // 1. Default LOCAL persistence
  assert.equal(auth.persistence, ClientSDK.browserLocalPersistence);
  auth.setSession(sampleUser, 'sample_access_token', 'sample_refresh_token');

  const storageKey = 'syntrabase_auth_persist-test_default';
  assert.ok(mockLocalStorage.has(storageKey));
  assert.equal(mockSessionStorage.has(storageKey), false);

  const savedData = JSON.parse(mockLocalStorage.get(storageKey)!);
  assert.equal(savedData.user.id, 'user_123');
  assert.equal(savedData.accessToken, 'sample_access_token');

  // 2. Fresh Auth instance automatically restores from localStorage (page reload simulation)
  const reloadedAuth = new ClientSDK.Auth(app);
  assert.ok(reloadedAuth.currentUser);
  assert.equal(reloadedAuth.currentUser?.id, 'user_123');
  assert.equal(reloadedAuth.accessToken, 'sample_access_token');
  assert.equal(typeof (reloadedAuth.currentUser as any).getIdToken, 'function');

  // 3. Switch to SESSION persistence
  await ClientSDK.setPersistence(reloadedAuth, ClientSDK.browserSessionPersistence);
  assert.equal(mockLocalStorage.has(storageKey), false);
  assert.ok(mockSessionStorage.has(storageKey));

  // 4. Switch to in-memory persistence (NONE)
  await ClientSDK.setPersistence(reloadedAuth, ClientSDK.inMemoryPersistence);
  assert.equal(mockLocalStorage.has(storageKey), false);
  assert.equal(mockSessionStorage.has(storageKey), false);

  // 5. Sign out clears everything
  await ClientSDK.signOut(reloadedAuth);
  assert.equal(reloadedAuth.currentUser, null);
  assert.equal(reloadedAuth.accessToken, null);

  // 6. Firestore cache & multi-tab persistence helpers
  assert.equal(ClientSDK.CACHE_SIZE_UNLIMITED, -1);
  assert.equal(typeof ClientSDK.enableMultiTabIndexedDbPersistence, 'function');
  assert.equal(typeof ClientSDK.initializeFirestore, 'function');
  assert.equal(typeof ClientSDK.persistentLocalCache, 'function');
  assert.equal(typeof ClientSDK.memoryLocalCache, 'function');

  const cache = ClientSDK.persistentLocalCache({ cacheSizeBytes: 10485760 });
  assert.equal(cache.kind, 'persistent');
  assert.equal(cache.cacheSizeBytes, 10485760);

  delete (globalThis as any).window;
});

