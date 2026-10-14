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

  const rules = getAdminRules(app);
  assert.ok(rules);
  assert.equal(typeof rules.publishRules, 'function');
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
