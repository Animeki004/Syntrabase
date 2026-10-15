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

test('Rules Engine - Handles escaped quotes in string literals', () => {
  const rules = `
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /quotes/{quoteId} {
      allow read: if resource.data.quote == "He said \\"Hello\\"";
    }
  }
}
`;
  const ast = compileRules(rules);
  const result = evaluateRules(ast, '/databases/(default)/documents/quotes/q1', {
    request: {
      auth: null,
      time: new Date().toISOString(),
      method: 'get',
    },
    resource: {
      data: { quote: 'He said "Hello"' },
    },
    params: {},
  });

  assert.equal(result.allowed, true);
});

test('Rules Engine - Supports recursive wildcard match {document=**}', () => {
  const rules = `
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /public/{document=**} {
      allow read: if true;
    }
  }
}
`;
  const ast = compileRules(rules);
  const result = evaluateRules(ast, '/databases/(default)/documents/public/categories/tech/articles/123', {
    request: {
      auth: null,
      time: new Date().toISOString(),
      method: 'get',
    },
    params: {},
  });

  assert.equal(result.allowed, true);
});

test('Rules Engine - Resolves custom claims via request.auth.token', () => {
  const rules = `
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /internal/{docId} {
      allow read, write: if request.auth != null && request.auth.token.role == 'superadmin';
    }
  }
}
`;
  const ast = compileRules(rules);

  // Admin user allowed
  const adminRes = evaluateRules(ast, '/databases/(default)/documents/internal/config', {
    request: {
      auth: { uid: 'u1', token: { role: 'superadmin' } },
      time: new Date().toISOString(),
      method: 'get',
    },
    params: {},
  });
  assert.equal(adminRes.allowed, true);

  // Non-admin user denied
  const userRes = evaluateRules(ast, '/databases/(default)/documents/internal/config', {
    request: {
      auth: { uid: 'u2', token: { role: 'standard' } },
      time: new Date().toISOString(),
      method: 'get',
    },
    params: {},
  });
  assert.equal(userRes.allowed, false);
});
