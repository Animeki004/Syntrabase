import test from 'node:test';
import assert from 'node:assert/strict';
import { compileRules, evaluateRules } from '../index.js';

const SAMPLE_RULES = `
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    match /public_posts/{postId} {
      allow read: if true;
      allow create: if request.auth != null;
      allow update, delete: if request.auth != null && resource.data.authorId == request.auth.uid;
    }
  }
}
`;

test('Rules Engine - Authenticated user can read own document', () => {
  const ast = compileRules(SAMPLE_RULES);
  const result = evaluateRules(ast, '/databases/(default)/documents/users/user_123', {
    request: {
      auth: { uid: 'user_123', email: 'user@example.com' },
      time: new Date().toISOString(),
      method: 'get',
    },
    params: {},
  });

  assert.equal(result.allowed, true);
  assert.ok(result.matchedRule?.includes('users/{userId}'));
});

test('Rules Engine - Deny unauthenticated access to private document', () => {
  const ast = compileRules(SAMPLE_RULES);
  const result = evaluateRules(ast, '/databases/(default)/documents/users/user_123', {
    request: {
      auth: null,
      time: new Date().toISOString(),
      method: 'get',
    },
    params: {},
  });

  assert.equal(result.allowed, false);
});

test('Rules Engine - Deny user reading another user document', () => {
  const ast = compileRules(SAMPLE_RULES);
  const result = evaluateRules(ast, '/databases/(default)/documents/users/user_999', {
    request: {
      auth: { uid: 'user_123', email: 'user@example.com' },
      time: new Date().toISOString(),
      method: 'get',
    },
    params: {},
  });

  assert.equal(result.allowed, false);
});

test('Rules Engine - Allow public reads on public posts', () => {
  const ast = compileRules(SAMPLE_RULES);
  const result = evaluateRules(ast, '/databases/(default)/documents/public_posts/post_abc', {
    request: {
      auth: null,
      time: new Date().toISOString(),
      method: 'get',
    },
    params: {},
  });

  assert.equal(result.allowed, true);
});

test('Rules Engine - Post author can update post', () => {
  const ast = compileRules(SAMPLE_RULES);
  const result = evaluateRules(ast, '/databases/(default)/documents/public_posts/post_abc', {
    request: {
      auth: { uid: 'author_42' },
      time: new Date().toISOString(),
      method: 'update',
    },
    resource: {
      data: { authorId: 'author_42', title: 'Existing Title' },
    },
    params: {},
  });

  assert.equal(result.allowed, true);
});

test('Rules Engine - Non-author cannot update post', () => {
  const ast = compileRules(SAMPLE_RULES);
  const result = evaluateRules(ast, '/databases/(default)/documents/public_posts/post_abc', {
    request: {
      auth: { uid: 'attacker_666' },
      time: new Date().toISOString(),
      method: 'update',
    },
    resource: {
      data: { authorId: 'author_42', title: 'Existing Title' },
    },
    params: {},
  });

  assert.equal(result.allowed, false);
});

test('Rules Engine - Unmatched collection fails closed by default', () => {
  const ast = compileRules(SAMPLE_RULES);
  const result = evaluateRules(ast, '/databases/(default)/documents/secret_keys/key_1', {
    request: {
      auth: { uid: 'user_123' },
      time: new Date().toISOString(),
      method: 'get',
    },
    params: {},
  });

  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'No rule permitted this operation');
});
