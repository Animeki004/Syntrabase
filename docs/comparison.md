# Syntrabase vs. Firebase: Comprehensive Capability & SDK Parity Reference

This document provides a complete technical comparison between the **Syntrabase SDK ecosystem** and the **Firebase SDK ecosystem** (Firebase Web SDK v9/v10 and Firebase Admin Node.js SDK).

Syntrabase SDKs are engineered as **1:1 modular drop-in replacements** for Firebase. Developers migrating from Firebase can swap imports from `firebase/*` to `@syntrabase/client-sdk` and from `firebase-admin/*` to `@syntrabase/admin-sdk` with zero architectural rework.

---

## 1. Client SDK Comparison: `@syntrabase/client-sdk` vs. Firebase Web SDK (v9/v10)

| Capability / Feature | Firebase Client SDK (`firebase/*`) | Syntrabase Client SDK (`@syntrabase/client-sdk`) | Compatibility Status | Syntrabase Implementation / Advantage |
|---|---|---|:---:|---|
| **SDK Architecture** | Tree-shakeable modular functions | Tree-shakeable modular functions | **100% Match** | Zero-dependency browser bundle |
| **App Initialization** | `initializeApp(config)` | `initializeApp({ apiKey, projectId, apiUrl, environmentId })` | **100% Match** | Adds native multi-environment routing (`prod`, `staging`, `dev`) |
| **Email/Password Sign-Up** | `createUserWithEmailAndPassword(auth, email, pass)` | `createUserWithEmailAndPassword(auth, email, pass)` | **100% Match** | Argon2id cryptographic password hashing on backend |
| **Email/Password Sign-In** | `signInWithEmailAndPassword(auth, email, pass)` | `signInWithEmailAndPassword(auth, email, pass)` | **100% Match** | Emits standard JWT + Refresh token pair |
| **Anonymous Authentication** | `signInAnonymously(auth)` | `signInAnonymously(auth)` | **100% Match** | Instant guest accounts with full DB read/write session |
| **Account Linking** | `linkWithCredential(...)` | `linkWithEmailAndPassword(auth, email, pass, name)` | **100% Match** | Upgrades anonymous guest to permanent email account |
| **Email Verification** | `sendEmailVerification(user)` | `sendEmailVerification(auth, user)` | **100% Match** | Cryptographic one-time verification tokens |
| **Apply Action Code** | `applyActionCode(auth, oobCode)` | `applyActionCode(auth, oobCode)` | **100% Match** | Validates email confirmation codes |
| **Password Reset (Send)** | `sendPasswordResetEmail(auth, email)` | `sendPasswordResetEmail(auth, email)` | **100% Match** | Rate-limited password reset dispatch |
| **Password Reset (Confirm)** | `confirmPasswordReset(auth, code, newPass)` | `confirmPasswordReset(auth, code, newPass)` | **100% Match** | Secure reset token consumption |
| **TOTP MFA Enrollment** | Requires GCP Identity Platform addon | `enrollTotpMfa(auth)` & `verifyTotpMfa(auth, token)` | **Enhanced** | Built-in standard RFC-6238 TOTP with QR codes out of the box |
| **Auth State Listener** | `onAuthStateChanged(auth, callback)` | `onAuthStateChanged(auth, callback)` | **100% Match** | Reactive session listener |
| **Sign Out** | `signOut(auth)` | `signOut(auth)` | **100% Match** | Session teardown and listener notifications |
| **Document CRUD** | `getDoc()`, `setDoc()`, `updateDoc()`, `deleteDoc()`, `addDoc()` | `getDoc()`, `setDoc()`, `updateDoc()`, `deleteDoc()`, `addDoc()` | **100% Match** | Backed by PostgreSQL JSONB with AST Security Rules evaluation |
| **Field Transforms** | `serverTimestamp()`, `increment()`, `arrayUnion()`, `arrayRemove()`, `deleteField()` | `serverTimestamp()`, `increment()`, `arrayUnion()`, `arrayRemove()`, `deleteField()` | **100% Match** | Server-executed atomic field operations |
| **Complex Queries** | `query()`, `where()`, `orderBy()`, `limit()`, `startAfter()` | `query()`, `where()`, `orderBy()`, `limit()`, `startAfter()` | **100% Match** | Rich query execution with cursor pagination |
| **Collection Groups** | `collectionGroup(db, 'id')` | `collectionGroup(db, 'id')` | **100% Match** | Cross-subcollection queries across the document tree |
| **Atomic Write Batches** | `writeBatch(db)` (`set`, `update`, `delete`, `commit`) | `writeBatch(db)` (`set`, `update`, `delete`, `commit`) | **100% Match** | All-or-nothing atomic database transactions |
| **Optimistic Transactions** | `runTransaction(db, updateFn)` | `runTransaction(db, updateFn)` | **100% Match** | Precondition checking with automatic jittered exponential backoff |
| **Realtime Sync** | `onSnapshot(ref, onNext, onError)` | `onSnapshot(ref, onNext, onError)` | **100% Match** | Duplex WebSocket CDC channel with automatic cleanup |
| **Offline Persistence** | `enableIndexedDbPersistence(db)` | `enableIndexedDbPersistence(db)` | **100% Match** | Browser IndexedDB local snapshot cache with memory fallback |
| **Object Storage** | `ref()`, `uploadBytes()`, `getDownloadURL()`, `deleteObject()`, `listAll()` | `ref()`, `uploadBytes()`, `getDownloadURL()`, `deleteObject()`, `listAll()` | **100% Match** | S3/MinIO backend with signed download URLs |

---

## 2. Admin SDK Comparison: `@syntrabase/admin-sdk` vs. Firebase Admin SDK (Node.js)

| Capability / Feature | Firebase Admin SDK (`firebase-admin/*`) | Syntrabase Admin SDK (`@syntrabase/admin-sdk`) | Compatibility Status | Syntrabase Implementation / Advantage |
|---|---|---|:---:|---|
| **App Initialization** | `initializeApp({ credential, projectId })` | `initializeAdminApp({ secretKey, projectId, apiUrl })` | **100% Match** | Secret key (`sk_live_...`) authorization bypassing security rules |
| **Get User by UID** | `auth().getUser(uid)` | `adminAuth.getUser(uid)` | **100% Match** | Returns full user profile entity |
| **Get User by Email** | `auth().getUserByEmail(email)` | `adminAuth.getUserByEmail(email)` | **100% Match** | Case-insensitive lookup |
| **List Users (Paginated)** | `auth().listUsers(maxResults, pageToken)` | `adminAuth.listUsers({ page, limit, search })` | **Enhanced** | Added direct server-side regex/substring search parameter |
| **Create User** | `auth().createUser({ email, password, ... })` | `adminAuth.createUser({ email, password, displayName, phoneNumber, disabled })` | **100% Match** | Direct backend account creation |
| **Update User Profile** | `auth().updateUser(uid, properties)` | `adminAuth.updateUser(uid, properties)` | **100% Match** | Full profile mutation including enable/disable |
| **Delete Single User** | `auth().deleteUser(uid)` | `adminAuth.deleteUser(uid)` | **100% Match** | Cascade purges user sessions & auth tokens |
| **Bulk Delete Users** | `auth().deleteUsers([uid1, uid2])` | `adminAuth.deleteUsers([uid1, uid2])` | **100% Match** | Returns `{ successCount, failureCount, errors }` |
| **Custom User Claims** | `auth().setCustomUserClaims(uid, claims)` | `adminAuth.setCustomUserClaims(uid, claims)` | **100% Match** | Injected into JWT claims and evaluated in rules (`request.auth.token.role`) |
| **Session Revocation** | `auth().revokeRefreshTokens(uid)` | `adminAuth.revokeRefreshTokens(uid)` | **100% Match** | Instantly invalidates all active client refresh tokens |
| **Verify Client ID Token** | `auth().verifyIdToken(token)` | `adminAuth.verifyIdToken(token)` | **100% Match** | Validates signature, claims, expiration, and enforces project tenant isolation |
| **Auth Config Management** | Console / GCP API only | `adminAuth.getProjectAuthConfig()` & `updateProjectAuthConfig()` | **Syntrabase Exclusive** | Programmatic control of password strength, MFA enforcement, and token expiry |
| **Admin Firestore CRUD** | `firestore().collection().doc().get()`, `.set()`, `.update()`, `.delete()` | `adminFirestore.getDoc()`, `setDoc()`, `updateDoc()`, `deleteDoc()` | **100% Match** | Privileged access bypassing security rules |
| **Admin Document Query** | `firestore().collection().where().get()` | `adminFirestore.queryDocs({ collectionPath, filters, orderBy, limit })` | **100% Match** | Full filtering, ordering, and pagination |
| **Admin Collection Groups** | `firestore().collectionGroup('id').get()` | `adminFirestore.queryCollectionGroup(id, { limit, offset })` | **100% Match** | Cross-tree queries |
| **Admin Transactions** | `firestore().runTransaction()` | `adminFirestore.commitTransaction(preconditions, writes)` | **100% Match** | Multi-document atomic transactions |
| **Admin Storage (Signed URLs)** | `bucket().file().getSignedUrl()` | `adminStorage.getSignedDownloadUrl(bucket, path, expires)` | **100% Match** | HMAC-signed URLs with configurable expiry |
| **Admin Storage (List & Delete)** | `bucket().getFiles()`, `file().delete()` | `adminStorage.listObjects()`, `adminStorage.deleteObject(path)` | **100% Match** | Metadata retrieval and permanent object removal |
| **Live Rules Deployment** | Firebase CLI only (`firebase deploy`) | `adminRules.publishRules(sourceCode)` | **Syntrabase Exclusive** | Dynamic programmatic deployment of security rules without CLI tooling |
| **Tamper-Evident Audit Ledger** | GCP Cloud Audit Logs (Read-only) | `adminAudit.verifyLedger()` | **Syntrabase Exclusive** | Cryptographic SHA-256 Merkle chain verification guaranteeing zero-log tampering |

---

## 3. Core Architectural & Infrastructure Differences

| Dimension | Firebase (Google Cloud) | Syntrabase |
|---|---|---|
| **Underlying Database** | Proprietary Google Cloud Firestore | Open-Standard **PostgreSQL** with indexed JSONB columns |
| **Hosting & Portability** | Locked to Google Cloud Platform (GCP) | **100% Self-hostable & Cloud-agnostic** (Docker, Kubernetes, Bare Metal, AWS, Azure) |
| **Pricing / Quota Structure** | Proprietary read/write per-document pricing (can lead to unexpected cost spikes) | Predictable compute / storage tiers with built-in Developer Tier quota enforcement |
| **Object Storage Engine** | Google Cloud Storage (GCS) | Standard **S3-compatible Object Storage** (MinIO, Ceph, AWS S3) |
| **Security Rules Engine** | Proprietary Google CEL / Common Expression Language | Syntrabase AST Parser with full support for `allow read, write: if request.auth != null` |
| **Data Sovereignty** | Governed by Google Cloud region policies | Complete local data sovereignty and cryptographic ledger compliance |

---

## 4. Side-by-Side Migration Code Examples

### Client SDK Migration Example

```typescript
// --- BEFORE: Firebase v9/v10 ---
// import { initializeApp } from 'firebase/app';
// import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
// import { getFirestore, doc, setDoc, onSnapshot } from 'firebase/firestore';

// --- AFTER: Syntrabase Client SDK ---
import { initializeApp, getAuth, signInWithEmailAndPassword, getFirestore, doc, setDoc, onSnapshot } from '@syntrabase/client-sdk';

const app = initializeApp({
  apiKey: 'pk_live_13843d1e66ef7bdd8816602f42ceb2d2',
  projectId: '00000000-0000-0000-0000-000000000020',
  apiUrl: 'http://localhost:4000',
  environmentId: 'production'
});

const auth = getAuth(app);
await signInWithEmailAndPassword(auth, 'user@example.com', 'Pass123!');

const db = getFirestore(app);
const docRef = doc(db, 'cities', 'tokyo');
await setDoc(docRef, { name: 'Tokyo', population: 14000000 });

// Realtime snapshot listener
const unsubscribe = onSnapshot(docRef, (snap) => {
  console.log('Current data:', snap.data());
});
```

### Admin SDK Migration Example

```typescript
// --- BEFORE: Firebase Admin ---
// import admin from 'firebase-admin';
// admin.initializeApp({ ... });
// const auth = admin.auth();

// --- AFTER: Syntrabase Admin SDK ---
import { initializeAdminApp, getAdminAuth, getAdminFirestore } from '@syntrabase/admin-sdk';

const adminApp = initializeAdminApp({
  secretKey: process.env.SYNTRABASE_SECRET_KEY || 'sk_live_admin_secret_key_sample',
  projectId: '00000000-0000-0000-0000-000000000020',
  apiUrl: 'http://localhost:4000'
});

const adminAuth = getAdminAuth(adminApp);
const user = await adminAuth.getUserByEmail('user@example.com');
await adminAuth.setCustomUserClaims(user.id, { role: 'admin', tier: 'enterprise' });

const adminDb = getAdminFirestore(adminApp);
await adminDb.setDoc('system_metrics', 'health', { status: 'healthy', uptime: process.uptime() });
```
