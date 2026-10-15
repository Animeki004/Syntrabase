import * as Syntrabase from '../packages/client-sdk/dist/client-sdk/src/index.js';

// Application State
let app = null;
let auth = null;
let db = null;
let storage = null;
let activeSnapshotUnsubscribe = null;

// DOM Elements
const terminalOutput = document.getElementById('terminal-output');
const headerAvatar = document.getElementById('header-avatar');
const headerUserEmail = document.getElementById('header-user-email');
const currentAuthPill = document.getElementById('current-user-pill');

// Logging Utility
function log(msg, type = 'info', data = null) {
  const line = document.createElement('div');
  line.className = `log-line ${type}`;

  const timestamp = new Date().toLocaleTimeString();
  const tag = `[${type.toUpperCase()}]`;

  line.innerHTML = `<span style="color: #64748b;">${timestamp}</span> <span class="log-tag">${tag}</span> ${msg}`;
  terminalOutput.appendChild(line);

  if (data !== null) {
    const jsonBlock = document.createElement('div');
    jsonBlock.className = 'log-line json';
    try {
      jsonBlock.textContent = JSON.stringify(data, null, 2);
    } catch {
      jsonBlock.textContent = String(data);
    }
    terminalOutput.appendChild(jsonBlock);
  }

  terminalOutput.scrollTop = terminalOutput.scrollHeight;
}

// Clear Terminal
document.getElementById('btn-clear-terminal').addEventListener('click', () => {
  terminalOutput.innerHTML = '';
  log('Terminal logs cleared.', 'info');
});

// Tab Navigation
document.querySelectorAll('.nav-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.nav-tab').forEach((t) => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));

    tab.classList.add('active');
    const target = document.getElementById(tab.dataset.tab);
    if (target) target.classList.add('active');
  });
});

// SDK Initialization Function
function initSdk() {
  const apiUrl = document.getElementById('cfg-api-url').value.trim();
  const projectId = document.getElementById('cfg-project-id').value.trim();
  const apiKey = document.getElementById('cfg-api-key').value.trim();
  const environmentId = document.getElementById('cfg-env-id').value.trim();

  try {
    app = Syntrabase.initializeApp({
      apiUrl,
      projectId,
      apiKey,
      environmentId,
    });

    auth = Syntrabase.getAuth(app);
    db = Syntrabase.getFirestore(app);
    storage = Syntrabase.getStorage(app);

    // Bind AuthStateChanged Listener
    Syntrabase.onAuthStateChanged(auth, (user) => {
      if (user) {
        headerAvatar.textContent = (user.email ? user.email[0] : 'A').toUpperCase();
        headerUserEmail.textContent = user.email || `Anonymous (${user.id.slice(0, 8)})`;
        currentAuthPill.style.borderColor = 'rgba(16, 185, 129, 0.4)';
        log(`Auth state change: Signed in as ${user.email || user.id}`, 'info');
      } else {
        headerAvatar.textContent = '?';
        headerUserEmail.textContent = 'Unauthenticated';
        currentAuthPill.style.borderColor = 'var(--card-border)';
        log('Auth state change: Signed out', 'info');
      }
    });

    log(`Syntrabase App initialized successfully for project "${projectId}"`, 'success', {
      apiUrl,
      projectId,
      environmentId,
    });
  } catch (err) {
    log(`Initialization failed: ${err.message}`, 'error');
  }
}

document.getElementById('btn-reinit-sdk').addEventListener('click', initSdk);

// -----------------------------------------------------------------------------
// Authentication Feature Handlers
// -----------------------------------------------------------------------------

document.getElementById('btn-auth-signup').addEventListener('click', async () => {
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;

  try {
    log(`Registering user ${email}...`, 'info');
    const userCred = await Syntrabase.createUserWithEmailAndPassword(auth, email, password);
    log(`User registered successfully!`, 'success', userCred.user);
  } catch (err) {
    log(`Sign-up error: ${err.message}`, 'error');
  }
});

document.getElementById('btn-auth-signin').addEventListener('click', async () => {
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;

  try {
    log(`Signing in user ${email}...`, 'info');
    const userCred = await Syntrabase.signInWithEmailAndPassword(auth, email, password);
    log(`Signed in successfully!`, 'success', userCred.user);
  } catch (err) {
    log(`Sign-in error: ${err.message}`, 'error');
  }
});

document.getElementById('btn-auth-anonymous').addEventListener('click', async () => {
  try {
    log('Initiating anonymous authentication...', 'info');
    const userCred = await Syntrabase.signInAnonymously(auth);
    log('Anonymous session active!', 'success', userCred.user);
  } catch (err) {
    log(`Anonymous sign-in error: ${err.message}`, 'error');
  }
});

document.getElementById('btn-auth-signout').addEventListener('click', async () => {
  try {
    await Syntrabase.signOut(auth);
    log('Signed out successfully.', 'info');
  } catch (err) {
    log(`Sign-out error: ${err.message}`, 'error');
  }
});

document.getElementById('btn-auth-send-reset').addEventListener('click', async () => {
  const email = document.getElementById('auth-email').value.trim();
  try {
    log(`Sending password reset email to ${email}...`, 'info');
    await Syntrabase.sendPasswordResetEmail(auth, email);
    log(`Password reset email dispatched to ${email}`, 'success');
  } catch (err) {
    log(`Password reset error: ${err.message}`, 'error');
  }
});

document.getElementById('btn-auth-mfa-enroll').addEventListener('click', async () => {
  try {
    log('Enrolling TOTP Multi-Factor Authentication...', 'info');
    const result = await Syntrabase.enrollTotpMfa(auth);
    log('MFA Enrollment initiated! Secret generated.', 'success', result);
    document.getElementById('mfa-verify-row').style.display = 'flex';
  } catch (err) {
    log(`MFA enrollment error: ${err.message}`, 'error');
  }
});

document.getElementById('btn-auth-mfa-verify').addEventListener('click', async () => {
  const token = document.getElementById('mfa-token-input').value.trim();
  try {
    log(`Verifying TOTP code "${token}"...`, 'info');
    const result = await Syntrabase.verifyTotpMfa(auth, token);
    log('MFA Verified & Activated successfully!', 'success', result);
  } catch (err) {
    log(`MFA verify error: ${err.message}`, 'error');
  }
});

// -----------------------------------------------------------------------------
// Firestore Feature Handlers
// -----------------------------------------------------------------------------

function parseJsonPayload() {
  try {
    return JSON.parse(document.getElementById('fs-data-payload').value);
  } catch (err) {
    throw new Error(`Invalid JSON document data: ${err.message}`);
  }
}

document.getElementById('btn-fs-add').addEventListener('click', async () => {
  const collPath = document.getElementById('fs-collection').value.trim();
  try {
    const data = parseJsonPayload();
    log(`addDoc: Creating new document in collection "${collPath}" with auto-ID...`, 'info');
    const collRef = Syntrabase.collection(db, collPath);
    const newDocRef = await Syntrabase.addDoc(collRef, data);
    document.getElementById('fs-doc-id').value = newDocRef.id;
    log(`addDoc succeeded! Generated ID: ${newDocRef.id}`, 'success', { path: newDocRef.path });
  } catch (err) {
    log(`addDoc failed: ${err.message}`, 'error');
  }
});

document.getElementById('btn-fs-set').addEventListener('click', async () => {
  const collPath = document.getElementById('fs-collection').value.trim();
  const docId = document.getElementById('fs-doc-id').value.trim() || 'demo_doc';
  try {
    const data = parseJsonPayload();
    const docRef = Syntrabase.doc(db, collPath, docId);
    log(`setDoc: Writing to "${docRef.path}"...`, 'info');
    await Syntrabase.setDoc(docRef, data);
    log(`setDoc succeeded for "${docRef.path}"!`, 'success');
  } catch (err) {
    log(`setDoc failed: ${err.message}`, 'error');
  }
});

document.getElementById('btn-fs-get').addEventListener('click', async () => {
  const collPath = document.getElementById('fs-collection').value.trim();
  const docId = document.getElementById('fs-doc-id').value.trim() || 'demo_doc';
  try {
    const docRef = Syntrabase.doc(db, collPath, docId);
    log(`getDoc: Fetching document "${docRef.path}"...`, 'info');
    const snapshot = await Syntrabase.getDoc(docRef);
    if (snapshot.exists()) {
      log(`Document exists (v${snapshot.version})`, 'success', snapshot.data());
    } else {
      log(`Document "${docRef.path}" does not exist (404).`, 'warn');
    }
  } catch (err) {
    log(`getDoc failed: ${err.message}`, 'error');
  }
});

document.getElementById('btn-fs-update').addEventListener('click', async () => {
  const collPath = document.getElementById('fs-collection').value.trim();
  const docId = document.getElementById('fs-doc-id').value.trim() || 'demo_doc';
  try {
    const data = parseJsonPayload();
    const docRef = Syntrabase.doc(db, collPath, docId);
    log(`updateDoc: Patching document "${docRef.path}"...`, 'info');
    await Syntrabase.updateDoc(docRef, data);
    log(`updateDoc succeeded for "${docRef.path}"!`, 'success');
  } catch (err) {
    log(`updateDoc failed: ${err.message}`, 'error');
  }
});

document.getElementById('btn-fs-delete').addEventListener('click', async () => {
  const collPath = document.getElementById('fs-collection').value.trim();
  const docId = document.getElementById('fs-doc-id').value.trim() || 'demo_doc';
  try {
    const docRef = Syntrabase.doc(db, collPath, docId);
    log(`deleteDoc: Removing document "${docRef.path}"...`, 'info');
    await Syntrabase.deleteDoc(docRef);
    log(`deleteDoc succeeded for "${docRef.path}"!`, 'success');
  } catch (err) {
    log(`deleteDoc failed: ${err.message}`, 'error');
  }
});

document.getElementById('btn-fs-query').addEventListener('click', async () => {
  const collPath = document.getElementById('fs-collection').value.trim();
  try {
    const collRef = Syntrabase.collection(db, collPath);
    const q = Syntrabase.query(
      collRef,
      Syntrabase.where('priority', '>=', 1),
      Syntrabase.orderBy('priority', 'asc'),
      Syntrabase.limit(5)
    );
    log(`Executing query on "${collPath}" (where priority >= 1, limit 5)...`, 'info');
    const snap = await Syntrabase.getDocs(q);
    log(`Query executed: Found ${snap.size} documents.`, 'success', snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  } catch (err) {
    log(`Query error: ${err.message}`, 'error');
  }
});

document.getElementById('btn-fs-batch').addEventListener('click', async () => {
  try {
    log('Preparing atomic WriteBatch with 3 operations...', 'info');
    const batch = Syntrabase.writeBatch(db);

    const doc1 = Syntrabase.doc(db, 'batch_test', 'b1');
    const doc2 = Syntrabase.doc(db, 'batch_test', 'b2');
    const doc3 = Syntrabase.doc(db, 'batch_test', 'b3');

    batch.set(doc1, { name: 'Batch Item 1', status: 'created' });
    batch.set(doc2, { name: 'Batch Item 2', status: 'created' });
    batch.update(doc3, { status: 'updated' }); // will update or set

    log('Committing WriteBatch...', 'info');
    await batch.commit();
    log('WriteBatch committed atomically!', 'success');
  } catch (err) {
    log(`WriteBatch error: ${err.message}`, 'error');
  }
});

document.getElementById('btn-fs-transaction').addEventListener('click', async () => {
  try {
    const counterDoc = Syntrabase.doc(db, 'counters', 'visitors');
    log('Executing interactive runTransaction...', 'info');

    const finalVal = await Syntrabase.runTransaction(db, async (tx) => {
      const snap = await tx.get(counterDoc);
      const current = snap.exists() ? (snap.data().count || 0) : 0;
      const next = current + 1;
      tx.set(counterDoc, { count: next, lastUpdated: new Date().toISOString() });
      return next;
    });

    log(`Transaction committed! New counter value: ${finalVal}`, 'success');
  } catch (err) {
    log(`Transaction error: ${err.message}`, 'error');
  }
});

document.getElementById('btn-fs-transforms').addEventListener('click', async () => {
  try {
    const transformDoc = Syntrabase.doc(db, 'metrics', 'stats');
    log('Applying FieldValue transforms (serverTimestamp + increment + arrayUnion)...', 'info');

    await Syntrabase.setDoc(transformDoc, {
      lastPing: Syntrabase.serverTimestamp(),
      views: Syntrabase.increment(5),
      tags: Syntrabase.arrayUnion('live', 'verified'),
    }, { merge: true });

    log('FieldValue transforms applied! Fetching updated document...', 'info');
    const snap = await Syntrabase.getDoc(transformDoc);
    log('Transformed Document Snapshot:', 'success', snap.data());
  } catch (err) {
    log(`Transform error: ${err.message}`, 'error');
  }
});

// -----------------------------------------------------------------------------
// Realtime WebSocket Handlers
// -----------------------------------------------------------------------------

document.getElementById('btn-rt-subscribe').addEventListener('click', () => {
  const path = document.getElementById('rt-path').value.trim();
  const docRef = Syntrabase.doc(db, path);

  const statusLabel = document.getElementById('rt-listener-status');
  const payloadLabel = document.getElementById('rt-last-payload');
  const liveBox = document.getElementById('rt-live-box');

  log(`Subscribing onSnapshot listener to "${docRef.path}"...`, 'info');
  statusLabel.textContent = `Connecting to ${docRef.path}...`;

  activeSnapshotUnsubscribe = Syntrabase.onSnapshot(
    docRef,
    (snapshot) => {
      liveBox.classList.add('active');
      statusLabel.textContent = `Active Stream (${docRef.path})`;
      const dataStr = snapshot.exists() ? JSON.stringify(snapshot.data()) : '[DELETED / EMPTY]';
      payloadLabel.textContent = `Latest Event: ${dataStr}`;
      log(`[ONSNAPSHOT BROADCAST] Received update for ${snapshot.id}:`, 'success', snapshot.data());
    },
    (err) => {
      liveBox.classList.remove('active');
      statusLabel.textContent = `Error: ${err.message}`;
      log(`onSnapshot Error: ${err.message}`, 'error');
    }
  );

  document.getElementById('btn-rt-subscribe').disabled = true;
  document.getElementById('btn-rt-unsubscribe').disabled = false;
});

document.getElementById('btn-rt-unsubscribe').addEventListener('click', () => {
  if (activeSnapshotUnsubscribe) {
    activeSnapshotUnsubscribe();
    activeSnapshotUnsubscribe = null;
  }
  document.getElementById('rt-live-box').classList.remove('active');
  document.getElementById('rt-listener-status').textContent = 'Idle (Unsubscribed)';
  document.getElementById('rt-last-payload').textContent = 'Listener stopped.';
  document.getElementById('btn-rt-subscribe').disabled = false;
  document.getElementById('btn-rt-unsubscribe').disabled = true;
  log('Unsubscribed realtime WebSocket listener.', 'info');
});

document.getElementById('btn-rt-trigger-update').addEventListener('click', async () => {
  const path = document.getElementById('rt-path').value.trim();
  const docRef = Syntrabase.doc(db, path);
  try {
    log(`Triggering update on "${docRef.path}" to broadcast over WebSocket...`, 'info');
    await Syntrabase.setDoc(docRef, {
      broadcastMessage: `Live pulse update at ${new Date().toISOString()}`,
      counter: Math.floor(Math.random() * 1000),
    });
    log('Remote document updated!', 'info');
  } catch (err) {
    log(`Update trigger error: ${err.message}`, 'error');
  }
});

// -----------------------------------------------------------------------------
// Storage Feature Handlers
// -----------------------------------------------------------------------------

document.getElementById('btn-st-upload').addEventListener('click', async () => {
  const fileInput = document.getElementById('st-file-input');
  const objectPath = document.getElementById('st-object-path').value.trim();

  let fileData = null;
  let contentType = 'text/plain';

  if (fileInput.files.length > 0) {
    fileData = fileInput.files[0];
    contentType = fileData.type || 'application/octet-stream';
  } else {
    // Default simulated Blob
    fileData = new Blob(['Syntrabase Client SDK isomorphic storage upload demonstration.'], { type: 'text/plain' });
    log('No file chosen, using synthesized test Blob payload.', 'info');
  }

  try {
    const storageRef = Syntrabase.ref(storage, objectPath);
    log(`Uploading to storage path "${storageRef.fullPath}"...`, 'info');
    const result = await Syntrabase.uploadBytes(storageRef, fileData, { contentType });
    log(`uploadBytes succeeded!`, 'success', result.metadata);
  } catch (err) {
    log(`Upload failed: ${err.message}`, 'error');
  }
});

document.getElementById('btn-st-download-url').addEventListener('click', async () => {
  const objectPath = document.getElementById('st-object-path').value.trim();
  try {
    const storageRef = Syntrabase.ref(storage, objectPath);
    log(`Generating signed download URL for "${storageRef.fullPath}"...`, 'info');
    const downloadUrl = await Syntrabase.getDownloadURL(storageRef);
    log(`getDownloadURL generated successfully!`, 'success', { downloadUrl });

    const previewContainer = document.getElementById('storage-preview-container');
    const previewLink = document.getElementById('storage-preview-link');
    previewLink.href = downloadUrl;
    previewLink.textContent = downloadUrl;
    previewContainer.style.display = 'block';
  } catch (err) {
    log(`getDownloadURL error: ${err.message}`, 'error');
  }
});

document.getElementById('btn-st-list').addEventListener('click', async () => {
  try {
    const storageRef = Syntrabase.ref(storage, '');
    log('Listing all storage objects in project...', 'info');
    const listResult = await Syntrabase.listAll(storageRef);
    log(`listAll returned ${listResult.items.length} items.`, 'success', listResult.items.map((i) => i.fullPath));
  } catch (err) {
    log(`listAll error: ${err.message}`, 'error');
  }
});

document.getElementById('btn-st-delete').addEventListener('click', async () => {
  const objectPath = document.getElementById('st-object-path').value.trim();
  try {
    const storageRef = Syntrabase.ref(storage, objectPath);
    log(`deleteObject: Removing "${storageRef.fullPath}"...`, 'info');
    await Syntrabase.deleteObject(storageRef);
    log(`deleteObject succeeded for "${storageRef.fullPath}"!`, 'success');
  } catch (err) {
    log(`deleteObject error: ${err.message}`, 'error');
  }
});

// -----------------------------------------------------------------------------
// Automated 1-Click Verification Test Runner
// -----------------------------------------------------------------------------

const AUTO_TESTS = [
  { id: 't1', name: 'App Initialization & Options Freeze', run: async () => {
    if (!app || !app.options.apiKey) throw new Error('App not initialized');
    return { projectId: app.options.projectId, apiUrl: app.options.apiUrl };
  }},
  { id: 't2', name: 'User Authentication (Email / Password Session)', run: async () => {
    const testEmail = `suite_user_${Date.now()}@example.com`;
    const testPassword = 'Password123!Safe';
    try {
      const cred = await Syntrabase.createUserWithEmailAndPassword(auth, testEmail, testPassword);
      return { uid: cred.user.id, email: cred.user.email };
    } catch {
      const cred = await Syntrabase.signInWithEmailAndPassword(auth, testEmail, testPassword);
      return { uid: cred.user.id, email: cred.user.email };
    }
  }},
  { id: 't3', name: 'Firestore Document Add (addDoc Auto-ID)', run: async () => {
    const col = Syntrabase.collection(db, 'auto_suite_docs');
    const docRef = await Syntrabase.addDoc(col, { test: 'Auto-ID validation', ts: Date.now() });
    if (!docRef.id) throw new Error('Missing generated ID');
    return { id: docRef.id, path: docRef.path };
  }},
  { id: 't4', name: 'Firestore Document Set & Get (setDoc & getDoc)', run: async () => {
    const docRef = Syntrabase.doc(db, 'auto_suite_docs', 'fixed_doc_test');
    await Syntrabase.setDoc(docRef, { message: 'Hello from Auto Suite', rating: 5 });
    const snap = await Syntrabase.getDoc(docRef);
    if (!snap.exists()) throw new Error('Document does not exist');
    return snap.data();
  }},
  { id: 't5', name: 'Atomic Field Transforms (serverTimestamp & increment)', run: async () => {
    const docRef = Syntrabase.doc(db, 'auto_suite_docs', 'transforms_test');
    await Syntrabase.setDoc(docRef, {
      time: Syntrabase.serverTimestamp(),
      score: Syntrabase.increment(10),
      list: Syntrabase.arrayUnion('item_a', 'item_b'),
    });
    const snap = await Syntrabase.getDoc(docRef);
    return snap.data();
  }},
  { id: 't6', name: 'Atomic Write Batch (writeBatch commit)', run: async () => {
    const batch = Syntrabase.writeBatch(db);
    const d1 = Syntrabase.doc(db, 'auto_suite_docs', 'batch_1');
    const d2 = Syntrabase.doc(db, 'auto_suite_docs', 'batch_2');
    batch.set(d1, { status: 'ok' });
    batch.set(d2, { status: 'ok' });
    await batch.commit();
    return { operations: 2, status: 'committed' };
  }},
  { id: 't7', name: 'Optimistic Concurrency Transaction (runTransaction)', run: async () => {
    const docRef = Syntrabase.doc(db, 'auto_suite_docs', 'tx_counter');
    const val = await Syntrabase.runTransaction(db, async (tx) => {
      const snap = await tx.get(docRef);
      const cur = snap.exists() ? (snap.data().count || 0) : 0;
      tx.set(docRef, { count: cur + 1 });
      return cur + 1;
    });
    return { counterValue: val };
  }},
  { id: 't8', name: 'Isomorphic Storage Upload (uploadBytes with Blob)', run: async () => {
    const storageRef = Syntrabase.ref(storage, 'auto_suite_uploads/test.txt');
    const blob = new Blob(['Verification test payload from browser.'], { type: 'text/plain' });
    const res = await Syntrabase.uploadBytes(storageRef, blob, { contentType: 'text/plain' });
    return res.metadata;
  }},
  { id: 't9', name: 'Storage Signed Download URL (getDownloadURL)', run: async () => {
    const storageRef = Syntrabase.ref(storage, 'auto_suite_uploads/test.txt');
    const signedUrl = await Syntrabase.getDownloadURL(storageRef);
    if (!signedUrl.includes('/download?token=')) throw new Error('Invalid download URL format');
    return { signedUrl };
  }},
  { id: 't10', name: 'Storage Object Teardown (deleteObject)', run: async () => {
    const storageRef = Syntrabase.ref(storage, 'auto_suite_uploads/test.txt');
    await Syntrabase.deleteObject(storageRef);
    return { deleted: true };
  }},
];

function renderAutoTestList() {
  const container = document.getElementById('auto-test-list');
  container.innerHTML = '';

  for (const test of AUTO_TESTS) {
    const card = document.createElement('div');
    card.id = `card-${test.id}`;
    card.className = 'test-card';
    card.innerHTML = `
      <div class="test-info">
        <span class="test-badge pending" id="badge-${test.id}">Pending</span>
        <span class="test-name">${test.name}</span>
      </div>
      <span class="test-timing" id="timing-${test.id}">-- ms</span>
    `;
    container.appendChild(card);
  }
}

async function runAutoTestSuite() {
  const btn = document.getElementById('btn-run-all-tests');
  btn.disabled = true;
  log('=== STARTING 1-CLICK CLIENT SDK AUTOMATED VERIFICATION ===', 'info');

  const progressBar = document.getElementById('test-progress-bar');
  let passedCount = 0;

  for (let i = 0; i < AUTO_TESTS.length; i++) {
    const test = AUTO_TESTS[i];
    const card = document.getElementById(`card-${test.id}`);
    const badge = document.getElementById(`badge-${test.id}`);
    const timing = document.getElementById(`timing-${test.id}`);

    card.className = 'test-card running';
    badge.className = 'test-badge running';
    badge.textContent = 'Running';

    const start = performance.now();
    try {
      const result = await test.run();
      const elapsed = (performance.now() - start).toFixed(1);

      card.className = 'test-card passed';
      badge.className = 'test-badge passed';
      badge.textContent = 'Passed';
      timing.textContent = `${elapsed} ms`;

      passedCount++;
      log(`✔ Step ${i + 1}/${AUTO_TESTS.length}: ${test.name} (${elapsed}ms)`, 'success', result);
    } catch (err) {
      const elapsed = (performance.now() - start).toFixed(1);
      card.className = 'test-card failed';
      badge.className = 'test-badge failed';
      badge.textContent = 'Failed';
      timing.textContent = `${elapsed} ms`;

      log(`✖ Step ${i + 1}/${AUTO_TESTS.length}: ${test.name} FAILED (${elapsed}ms): ${err.message}`, 'error');
    }

    progressBar.style.width = `${((i + 1) / AUTO_TESTS.length) * 100}%`;
  }

  btn.disabled = false;
  log(`=== TEST RUN FINISHED: ${passedCount}/${AUTO_TESTS.length} TESTS PASSED ===`, passedCount === AUTO_TESTS.length ? 'success' : 'warn');
}

document.getElementById('btn-run-all-tests').addEventListener('click', runAutoTestSuite);

// -----------------------------------------------------------------------------
// Admin SDK Automated Privileged Verification Runner
// -----------------------------------------------------------------------------

const ADMIN_TESTS = [
  { id: 'adm1', name: 'AdminApp Privileged Initialization & Browser Defense' },
  { id: 'adm2', name: 'Admin Firestore Privileged Document Read (users/usr_1)' },
  { id: 'adm3', name: 'Admin Firestore Privileged Document Write & Verification' },
  { id: 'adm4', name: 'Admin Auth Privileged User Listing & Quota Inspection' },
  { id: 'adm5', name: 'Admin Storage Object Listing & Signed URL Generation' },
  { id: 'adm6', name: 'Admin Security Rules Compilation & Dynamic Publication' },
];

function renderAdminTestList() {
  const container = document.getElementById('admin-test-list');
  if (!container) return;
  container.innerHTML = '';

  for (const test of ADMIN_TESTS) {
    const card = document.createElement('div');
    card.id = `card-${test.id}`;
    card.className = 'test-card';
    card.innerHTML = `
      <div class="test-info">
        <span class="test-badge pending" id="badge-${test.id}">Pending</span>
        <span class="test-name">${test.name}</span>
      </div>
      <span class="test-timing" id="timing-${test.id}">-- ms</span>
    `;
    container.appendChild(card);
  }
}

async function runAdminTestSuite() {
  const btn = document.getElementById('btn-run-admin-tests');
  if (btn) btn.disabled = true;
  log('=== STARTING ADMIN SDK PRIVILEGED VERIFICATION SUITE ===', 'info');

  const progressBar = document.getElementById('admin-test-progress-bar');
  const start = performance.now();

  try {
    for (const test of ADMIN_TESTS) {
      const card = document.getElementById(`card-${test.id}`);
      const badge = document.getElementById(`badge-${test.id}`);
      if (card && badge) {
        card.className = 'test-card running';
        badge.className = 'test-badge running';
        badge.textContent = 'Running';
      }
    }

    const res = await fetch('/api/admin/run-suite', { method: 'POST' });
    const data = await res.json();

    if (!data.success) {
      throw new Error(data.error || 'Admin suite execution failed');
    }

    let passed = 0;
    for (let i = 0; i < data.steps.length; i++) {
      const step = data.steps[i];
      const card = document.getElementById(`card-${step.id}`);
      const badge = document.getElementById(`badge-${step.id}`);
      const timing = document.getElementById(`timing-${step.id}`);

      if (card && badge && timing) {
        if (step.passed) {
          card.className = 'test-card passed';
          badge.className = 'test-badge passed';
          badge.textContent = 'Passed';
          timing.textContent = `${(performance.now() - start).toFixed(0)} ms`;
          passed++;
          log(`✔ [Admin SDK] ${step.name}`, 'success', step.data);
        } else {
          card.className = 'test-card failed';
          badge.className = 'test-badge failed';
          badge.textContent = 'Failed';
          log(`✖ [Admin SDK] ${step.name} FAILED`, 'error');
        }
      }
      if (progressBar) {
        progressBar.style.width = `${((i + 1) / data.steps.length) * 100}%`;
      }
    }

    log(`=== ADMIN SUITE COMPLETE: ${passed}/${data.steps.length} PRIVILEGED CHECKS PASSED ===`, 'success');
  } catch (err) {
    log(`Admin Suite Error: ${err.message}`, 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

const adminRunBtn = document.getElementById('btn-run-admin-tests');
if (adminRunBtn) {
  adminRunBtn.addEventListener('click', runAdminTestSuite);
}

// Initialize on Load
initSdk();
renderAutoTestList();
renderAdminTestList();

