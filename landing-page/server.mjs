import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const PORT = process.env.PORT || 5000;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// Import Admin SDK components
let adminModules = null;
async function getAdminSdk() {
  if (!adminModules) {
    const appMod = await import('../packages/admin-sdk/dist/admin-sdk/src/app.js');
    const firestoreMod = await import('../packages/admin-sdk/dist/admin-sdk/src/firestore.js');
    const authMod = await import('../packages/admin-sdk/dist/admin-sdk/src/auth.js');
    const storageMod = await import('../packages/admin-sdk/dist/admin-sdk/src/storage.js');
    const rulesMod = await import('../packages/admin-sdk/dist/admin-sdk/src/rules.js');
    adminModules = { ...appMod, ...firestoreMod, ...authMod, ...storageMod, ...rulesMod };
  }
  return adminModules;
}

const server = http.createServer(async (req, res) => {
  // CORS and Cache Control headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const urlPath = req.url.split('?')[0];

  // ---------------------------------------------------------------------------
  // Admin SDK Server-Side API Handlers
  // ---------------------------------------------------------------------------
  if (urlPath === '/api/admin/run-suite' && req.method === 'POST') {
    try {
      const sdk = await getAdminSdk();
      const adminApp = sdk.initializeAdminApp({
        apiUrl: 'http://localhost:4000',
        projectId: 'default-project',
        secretKey: 'sk_live_default_admin_key_syntrabase_2026_supersecret',
      });

      const adminDb = sdk.getAdminFirestore(adminApp);
      const adminAuth = sdk.getAdminAuth(adminApp);
      const adminStorage = sdk.getAdminStorage(adminApp);
      const adminRules = sdk.getAdminRules(adminApp);

      const steps = [];

      // Step 1: Admin Initialization
      steps.push({
        id: 'adm1',
        name: 'AdminApp Privileged Initialization',
        passed: true,
        data: { projectId: adminApp.options.projectId, apiUrl: adminApp.options.apiUrl },
      });

      // Step 2: Privileged Document Read
      const userDoc = await adminDb.getDoc('users', 'usr_1');
      steps.push({
        id: 'adm2',
        name: 'Admin Firestore Privileged Read (users/usr_1)',
        passed: !!userDoc,
        data: userDoc?.data,
      });

      // Step 3: Privileged Document Write
      await adminDb.setDoc('admin_audit_test', 'entry_live', {
        source: 'Syntrabase Admin SDK Test Studio',
        executedAt: new Date().toISOString(),
        privileged: true,
      });
      const writeVerify = await adminDb.getDoc('admin_audit_test', 'entry_live');
      steps.push({
        id: 'adm3',
        name: 'Admin Firestore Privileged Write & Verification',
        passed: writeVerify?.data?.privileged === true,
        data: writeVerify?.data,
      });

      // Step 4: Admin Auth List Users
      const userList = await adminAuth.listUsers({ limit: 5 });
      steps.push({
        id: 'adm4',
        name: 'Admin Auth Privileged User Listing',
        passed: userList.users.length > 0,
        data: { total: userList.total, count: userList.users.length, firstEmail: userList.users[0]?.email },
      });

      // Step 5: Admin Storage List & Signed Download URL
      const storageObjects = await adminStorage.listObjects();
      const signedUrl = await adminStorage.getSignedDownloadUrl('default', 'auto_suite_uploads/test.txt', 3600);
      steps.push({
        id: 'adm5',
        name: 'Admin Storage List Objects & Signed URL Generation',
        passed: signedUrl.includes('/download?token='),
        data: { objectCount: storageObjects.length, signedUrl },
      });

      // Step 6: Admin Security Rules Dynamic Deployment
      const ruleDeploy = await adminRules.publishRules(`
        rules_version = '2';
        service cloud.firestore {
          match /databases/{database}/documents {
            match /{document=**} {
              allow read, write: if request.auth != null;
            }
          }
        }
      `);
      steps.push({
        id: 'adm6',
        name: 'Admin Security Rules Compilation & Publication',
        passed: ruleDeploy.versionNumber > 0,
        data: ruleDeploy,
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, steps }));
      return;
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
      return;
    }
  }

  // ---------------------------------------------------------------------------
  // Static File Serving
  // ---------------------------------------------------------------------------
  let filePath;

  if (urlPath === '/' || urlPath === '/index.html') {
    filePath = path.join(__dirname, 'index.html');
  } else if (urlPath.startsWith('/packages/')) {
    filePath = path.join(rootDir, urlPath);
  } else {
    // Relative to temp-website
    filePath = path.join(__dirname, urlPath);
  }

  // Fallback check: if not in temp-website, try root
  if (!fs.existsSync(filePath)) {
    filePath = path.join(rootDir, urlPath);
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end(`404 Not Found: ${urlPath}`);
  }
});

server.listen(PORT, () => {
  console.log(`[Syntrabase Studio] Test bench server running at http://localhost:${PORT}`);
});
