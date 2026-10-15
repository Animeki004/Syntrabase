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
