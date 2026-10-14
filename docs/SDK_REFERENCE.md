# Syntrabase — SDK Developer Reference

Syntrabase provides two official TypeScript/JavaScript SDKs:
1. **`@syntrabase/client-sdk`**: Modular, Firebase v9/v10 compatible SDK for web, mobile, and client-side applications. Evaluates declarative security rules, supports offline persistence, and enforces zero-secret-leakage.
2. **`@syntrabase/admin-sdk`**: Privileged Node.js SDK for secure backend services, microservices, and serverless functions. Authenticates via high-privilege Secret Keys (`sk_live_...`), bypasses client security rules with automatic cryptographic audit ledger logging.

---

## Part 1: Client SDK (`@syntrabase/client-sdk`)

### Installation & Quick Start

```bash
npm install @syntrabase/client-sdk
```

```typescript
import { initializeApp } from '@syntrabase/client-sdk';
import { getAuth, signInWithEmailAndPassword } from '@syntrabase/client-sdk';
import { getFirestore, doc, setDoc, getDoc, collection, query, where, getDocs } from '@syntrabase/client-sdk';

// Initialize Syntrabase App
const app = initializeApp({
  apiUrl: 'https://api.yourdomain.com',
  apiKey: 'pk_live_your_publishable_api_key',
  projectId: 'proj_ecommerce_prod',
  environmentId: 'production'
});

const auth = getAuth(app);
const db = getFirestore(app);
```

---

### Authentication Module

#### `createUserWithEmailAndPassword(auth, email, password)`
Creates a new user account with email and password credentials.
```typescript
const { user } = await createUserWithEmailAndPassword(auth, 'alice@example.com', 'SuperSecretPass123!');
console.log('User created:', user.uid);
```

#### `signInWithEmailAndPassword(auth, email, password)`
Authenticates an existing user and stores tokens in memory.
```typescript
const { user } = await signInWithEmailAndPassword(auth, 'alice@example.com', 'SuperSecretPass123!');
```

#### `signInAnonymously(auth)`
Provisions an ephemeral guest session for frictionless onboarding.
```typescript
const { user } = await signInAnonymously(auth);
console.log('Anonymous session active:', user.isAnonymous); // true
```

#### `linkWithEmailAndPassword(auth, email, password, displayName?)`
Converts an existing anonymous session to a permanent account without losing user ID, documents, or cart state.
```typescript
const { user } = await linkWithEmailAndPassword(auth, 'alice@example.com', 'SuperSecretPass123!', 'Alice Cooper');
console.log('Account linked successfully:', user.email);
```

#### `enrollTotpMfa(auth)`
Enrolls an RFC 6238 Time-based One-Time Password (TOTP) factor for the currently authenticated user. Returns the Base32 secret, OTPAuth URL for QR code scanners, and 8 hashed backup recovery codes.
```typescript
import { enrollTotpMfa } from '@syntrabase/client-sdk';

const { secret, otpauthUrl, backupCodes } = await enrollTotpMfa(auth);
console.log('TOTP Secret:', secret);
console.log('Backup recovery codes:', backupCodes);
```

#### `verifyTotpMfa(auth, code)`
Verifies a 6-digit TOTP code and activates two-factor authentication on the account.
```typescript
import { verifyTotpMfa } from '@syntrabase/client-sdk';

await verifyTotpMfa(auth, '123456');
console.log('Two-factor authentication successfully enabled!');
```

#### `sendEmailVerification(auth, user)`
Dispatches a branded email verification link using configured SMTP or Resend credentials.
```typescript
await sendEmailVerification(auth, auth.currentUser!);
```

#### `sendPasswordResetEmail(auth, email)`
Triggers a password recovery email containing an atomic single-use action token.
```typescript
await sendPasswordResetEmail(auth, 'alice@example.com');
```

#### `confirmPasswordReset(auth, oobCode, newPassword)`
Redeems the password reset action code and sets a new password.
```typescript
await confirmPasswordReset(auth, actionCodeFromUrl, 'BrandNewPassword123!');
```

#### `signOut(auth)`
Clears active tokens and notifies all registered auth state listeners.
```typescript
await signOut(auth);
```

#### `onAuthStateChanged(auth, callback)`
Subscribes to session lifecycle changes. Returns an unsubscribe function.
```typescript
const unsubscribe = onAuthStateChanged(auth, (user) => {
  if (user) {
    console.log('Logged in as:', user.email || 'Anonymous Guest');
  } else {
    console.log('Logged out');
  }
});
```

---

### Firestore Document Module

#### `doc(db, path, id?)` & `collection(db, path)`
Construct references to collections and documents.
```typescript
const userRef = doc(db, 'users', 'user_123');
const messagesCol = collection(db, 'messages');
```

#### `getDoc(docRef)`
Fetches a single document snapshot.
```typescript
const snapshot = await getDoc(userRef);
if (snapshot.exists()) {
  console.log('Document data:', snapshot.data());
} else {
  console.log('Document not found');
}
```

#### `setDoc(docRef, data, options?)`
Creates or overwrites a document. Pass `{ merge: true }` to update fields without replacing the entire document.
```typescript
await setDoc(userRef, {
  name: 'Alice',
  role: 'member',
  preferences: { darkMode: true }
}, { merge: true });
```

#### `updateDoc(docRef, data)`
Updates specific fields in an existing document. Fails if the document does not exist.
```typescript
await updateDoc(userRef, {
  'preferences.darkMode': false
});
```

#### `deleteDoc(docRef)`
Deletes a document by reference.
```typescript
await deleteDoc(userRef);
```

#### Field Value Transforms
Perform atomic server-side mutations before security rule evaluations:
- `serverTimestamp()`: Writes current UTC timestamp.
- `increment(delta)`: Atomically increments/decrements a numeric field.
- `arrayUnion(...elements)`: Appends elements to an array if not already present.
- `arrayRemove(...elements)`: Removes all occurrences of elements from an array.
- `deleteField()`: Deletes a specific key from a document.

```typescript
import { serverTimestamp, increment, arrayUnion, deleteField } from '@syntrabase/client-sdk';

await updateDoc(userRef, {
  visitCount: increment(1),
  tags: arrayUnion('active_customer'),
  lastActive: serverTimestamp(),
  temporaryPromo: deleteField()
});
```

#### Queries & Filtering
```typescript
import { query, where, orderBy, limit, getDocs } from '@syntrabase/client-sdk';

const q = query(
  collection(db, 'orders'),
  where('status', '==', 'shipped'),
  where('total', '>=', 50),
  orderBy('total', 'desc'),
  limit(20)
);

const querySnapshot = await getDocs(q);
querySnapshot.docs.forEach((doc) => {
  console.log(doc.id, doc.data());
});
```

#### Collection Group Queries
Query across all subcollections with the same name across all documents.
```typescript
import { collectionGroup } from '@syntrabase/client-sdk';

const commentsQuery = collectionGroup(db, 'comments');
const snapshots = await getDocs(commentsQuery);
```

#### Interactive Transactions (`runTransaction`)
Executes an atomic read-modify-write operation with optimistic concurrency control and automatic backoff retry on conflict.
```typescript
import { runTransaction } from '@syntrabase/client-sdk';

await runTransaction(db, async (transaction) => {
  const fromRef = doc(db, 'accounts', 'acc_1');
  const toRef = doc(db, 'accounts', 'acc_2');

  const fromSnap = await transaction.get(fromRef);
  const toSnap = await transaction.get(toRef);

  const fromBalance = fromSnap.data()?.balance || 0;
  if (fromBalance < 100) throw new Error('Insufficient funds');

  transaction.update(fromRef, { balance: fromBalance - 100 });
  transaction.update(toRef, { balance: (toSnap.data()?.balance || 0) + 100 });
});
```

#### Atomic Batch Writes (`writeBatch`)
Commit up to 500 operations in a single atomic network roundtrip.
```typescript
import { writeBatch } from '@syntrabase/client-sdk';

const batch = writeBatch(db);
batch.set(doc(db, 'logs', 'log_1'), { event: 'start' });
batch.update(doc(db, 'counters', 'global'), { count: increment(1) });
batch.delete(doc(db, 'staging', 'temp_old'));
await batch.commit();
```

#### Offline Persistence
Cache documents in memory or local storage with automatic offline fallback when connectivity drops.
```typescript
import { enableIndexedDbPersistence } from '@syntrabase/client-sdk';

enableIndexedDbPersistence(db);
```

---

### Realtime Listener Module

#### `onSnapshot(docOrQueryRef, callback)`
Listen to real-time changes over WebSocket.
```typescript
import { onSnapshot } from '@syntrabase/client-sdk';

const unsub = onSnapshot(doc(db, 'chats', 'general'), (snapshot) => {
  console.log('Current chat data:', snapshot.data());
});

// To stop listening:
unsub();
```

---

## Part 2: Admin SDK (`@syntrabase/admin-sdk`)

### Installation & Initialization

> [!WARNING]
> Never bundle `@syntrabase/admin-sdk` or your `sk_live_...` secret keys into client-side web or mobile code! Client bundle scanners will reject packages containing admin secret keys.

```bash
npm install @syntrabase/admin-sdk
```

```typescript
import { initializeAdminApp } from '@syntrabase/admin-sdk';
import { getAdminFirestore } from '@syntrabase/admin-sdk';
import { getAdminAuth } from '@syntrabase/admin-sdk';
import { getAdminAudit } from '@syntrabase/admin-sdk';

const adminApp = initializeAdminApp({
  apiUrl: process.env.SYNTRABASE_API_URL!,
  secretKey: process.env.SYNTRABASE_SECRET_KEY!, // sk_live_...
  projectId: process.env.SYNTRABASE_PROJECT_ID!,
});

const adminDb = getAdminFirestore(adminApp);
const adminAuth = getAdminAuth(adminApp);
```

---

### Admin Firestore

Bypasses client-side security rules for internal backend automation, seeding, and migration scripts.

```typescript
// Fetch document bypassing rules
const docSnap = await adminDb.getDoc('users', 'user_123');

// Write document with Server Timestamp transform
import { AdminFieldValue } from '@syntrabase/admin-sdk';

await adminDb.setDoc('users', 'user_123', {
  status: 'verified',
  verifiedAt: AdminFieldValue.serverTimestamp(),
  tier: 'enterprise'
}, true);

// Execute admin collection group query across entire tenant
const allOrders = await adminDb.queryCollectionGroup('orders', { limit: 100 });
```

---

### Admin Auth & Token Verification

Verify incoming JWT tokens from API clients in your Express, Fastify, or Next.js API routes.

```typescript
// Verify client ID Token
const decodedToken = await adminAuth.verifyIdToken(bearerToken);
console.log('Verified user UID:', decodedToken.uid);

// Fetch user profile
const userRecord = await adminAuth.getUser(decodedToken.uid);

// List users with pagination and search
const { users, total } = await adminAuth.listUsers(1, 25, 'alice@example.com');

// Administratively create user
const newUser = await adminAuth.createUser({
  email: 'bob@example.com',
  password: 'SecureBobPass123!',
  displayName: 'Bob Jones',
  emailVerified: true
});

// Update user attributes
await adminAuth.updateUser(newUser.uid, {
  displayName: 'Robert Jones',
  disabled: false
});

// Revoke all refresh tokens and sessions for a user
await adminAuth.revokeRefreshTokens(newUser.uid);

// Delete user account
await adminAuth.deleteUser(newUser.uid);

// Manage Project Authentication Configuration
const config = await adminAuth.getProjectAuthConfig();
console.log('Email auth enabled:', config.emailPasswordEnabled);

// Enable or adjust policies programmatically
await adminAuth.updateProjectAuthConfig({
  emailPasswordEnabled: true,
  passwordPolicy: {
    minLength: 12,
    requireUppercase: true,
    requireNumbers: true,
    requireSymbols: true,
    requireLowercase: true,
    maxAgeDays: 90
  }
});
```

---

### Audit Ledger & SOC Operations

Verify that the platform's cryptographic HMAC-SHA256 audit ledger has not been tampered with.

```typescript
const audit = getAdminAudit(adminApp);
const verification = await audit.verifyLedger();

if (verification.valid) {
  console.log(`Audit ledger verified intact across ${verification.totalChecked} records.`);
} else {
  console.error('Tampering detected in platform audit chain!');
}
```
