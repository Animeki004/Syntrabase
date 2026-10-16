#!/usr/bin/env node

/**
 * =============================================================================
 * Syntrabase - Standalone SMTP & Custom Sender Domain Test Server
 * =============================================================================
 * Serves a dedicated web UI on http://localhost:4055 where developers can test
 * Gmail SMTP (or any SMTP relay), evaluate custom sender domains, and verify
 * that their personal Gmail address is not exposed to recipients.
 *
 * Usage:
 *   node scripts/smtp-test-server.js
 * Or with custom port:
 *   PORT=4055 node scripts/smtp-test-server.js
 * =============================================================================
 */

import http from 'node:http';
import nodemailer from 'nodemailer';

const PORT = parseInt(process.env.PORT || '4055', 10);

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1e6) {
        req.destroy();
        reject(new Error('Request payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (err) {
        reject(new Error('Invalid JSON'));
      }
    });
  });
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(payload));
}

const HTML_DASHBOARD = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Syntrabase SMTP & Sender Domain Diagnostic Server</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-base: #0b0d11;
      --bg-surface: #13171f;
      --bg-surface-elevated: #1a202c;
      --border-subtle: #242c3d;
      --border-focus: #3b82f6;
      --primary: #3b82f6;
      --primary-hover: #2563eb;
      --text-main: #f1f5f9;
      --text-muted: #94a3b8;
      --success: #10b981;
      --warning: #f59e0b;
      --danger: #ef4444;
      --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      --font-mono: 'JetBrains Mono', monospace;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      background: var(--bg-base);
      color: var(--text-main);
      font-family: var(--font-sans);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      padding: 24px;
    }

    .container {
      max-width: 1100px;
      margin: 0 auto;
      width: 100%;
    }

    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 24px;
      border-bottom: 1px solid var(--border-subtle);
      margin-bottom: 24px;
    }

    .brand-title {
      font-size: 1.35rem;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 10px;
      color: #ffffff;
    }

    .badge {
      font-size: 0.72rem;
      font-weight: 700;
      padding: 3px 8px;
      border-radius: 9999px;
      background: rgba(59, 130, 246, 0.15);
      color: var(--primary);
      border: 1px solid rgba(59, 130, 246, 0.3);
      text-transform: uppercase;
    }

    .grid-layout {
      display: grid;
      grid-template-columns: 1.15fr 0.85fr;
      gap: 24px;
    }

    @media (max-width: 900px) {
      .grid-layout { grid-template-columns: 1fr; }
    }

    .card {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: 12px;
      padding: 20px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.25);
    }

    .card-title {
      font-size: 0.95rem;
      font-weight: 700;
      margin-bottom: 16px;
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--text-main);
    }

    .form-group {
      margin-bottom: 14px;
    }

    label {
      display: block;
      font-size: 0.78rem;
      font-weight: 600;
      color: var(--text-muted);
      margin-bottom: 6px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    input, textarea, select {
      width: 100%;
      background: var(--bg-surface-elevated);
      border: 1px solid var(--border-subtle);
      border-radius: 6px;
      padding: 9px 12px;
      font-size: 0.88rem;
      color: var(--text-main);
      font-family: inherit;
      transition: all 0.15s ease;
    }

    input:focus, textarea:focus, select:focus {
      outline: none;
      border-color: var(--border-focus);
      box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.25);
    }

    .input-hint {
      font-size: 0.72rem;
      color: var(--text-muted);
      margin-top: 4px;
    }

    .row-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }

    .btn-group {
      display: flex;
      gap: 12px;
      margin-top: 20px;
    }

    button {
      flex: 1;
      padding: 10px 16px;
      border-radius: 6px;
      font-size: 0.85rem;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      transition: all 0.15s ease;
      border: none;
    }

    .btn-primary {
      background: var(--primary);
      color: #ffffff;
    }
    .btn-primary:hover { background: var(--primary-hover); }
    .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

    .btn-secondary {
      background: var(--bg-surface-elevated);
      color: var(--text-main);
      border: 1px solid var(--border-subtle);
    }
    .btn-secondary:hover { background: rgba(255,255,255,0.08); }

    .terminal-box {
      background: #06080b;
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      padding: 14px;
      font-family: var(--font-mono);
      font-size: 0.78rem;
      color: #38bdf8;
      max-height: 480px;
      overflow-y: auto;
      white-space: pre-wrap;
      word-break: break-all;
      line-height: 1.5;
    }

    .info-card {
      background: rgba(59, 130, 246, 0.06);
      border: 1px solid rgba(59, 130, 246, 0.25);
      border-radius: 8px;
      padding: 14px;
      margin-top: 16px;
      font-size: 0.8rem;
      line-height: 1.5;
    }

    .info-card h4 {
      color: var(--primary);
      margin-bottom: 6px;
      font-size: 0.85rem;
    }

    .info-card ol {
      padding-left: 18px;
      color: var(--text-muted);
    }

    .info-card li { margin-bottom: 4px; }
    .info-card strong { color: var(--text-main); }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div>
        <div class="brand-title">
          <span>⚡ Syntrabase SMTP Test Server</span>
          <span class="badge">v1.2.2 Ready</span>
        </div>
        <p style="font-size: 0.82rem; color: var(--text-muted); margin-top: 4px;">
          Validate Gmail SMTP, authenticate custom sending domains, and verify sender address privacy.
        </p>
      </div>
      <div>
        <span style="font-family: var(--font-mono); font-size: 0.75rem; color: var(--text-muted);">
          Listening: http://localhost:${PORT}
        </span>
      </div>
    </header>

    <div class="grid-layout">
      <!-- Left Column: Form Settings -->
      <div style="display: flex; flex-direction: column; gap: 20px;">
        <div class="card">
          <div class="card-title">1. SMTP Server &amp; Credentials</div>
          
          <div style="margin-bottom: 12px;">
            <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 6px;">Provider Presets:</div>
            <div style="display: flex; gap: 6px; flex-wrap: wrap;">
              <button type="button" class="btn-secondary" style="font-size: 0.72rem; padding: 4px 10px; flex: initial;" onclick="applyPreset('gmail')">Gmail SMTP</button>
              <button type="button" class="btn-secondary" style="font-size: 0.72rem; padding: 4px 10px; flex: initial;" onclick="applyPreset('brevo')">Brevo Relay (Free)</button>
              <button type="button" class="btn-secondary" style="font-size: 0.72rem; padding: 4px 10px; flex: initial;" onclick="applyPreset('resend')">Resend (Free)</button>
              <button type="button" class="btn-secondary" style="font-size: 0.72rem; padding: 4px 10px; flex: initial;" onclick="applyPreset('namecheap')">Namecheap Private Email</button>
            </div>
          </div>

          <div class="row-2">
            <div class="form-group">
              <label>SMTP Host</label>
              <input type="text" id="smtpHost" value="smtp.gmail.com" />
            </div>
            <div class="form-group">
              <label>Port &amp; Security</label>
              <select id="smtpPort">
                <option value="465" selected>Port 465 (Direct SSL)</option>
                <option value="587">Port 587 (STARTTLS)</option>
              </select>
            </div>
          </div>

          <div class="form-group">
            <label id="userLabel">Gmail Username / Auth Login</label>
            <input type="email" id="smtpUser" placeholder="your-account@gmail.com" />
            <div class="input-hint" id="userHint">Must be your actual authenticated account email (e.g. your @gmail.com address, NOT your custom domain!).</div>
          </div>

          <div class="form-group">
            <label id="passLabel">Gmail 16-Character App Password / API Key</label>
            <input type="password" id="smtpPass" placeholder="abcd efgh ijkl mnop" />
            <div class="input-hint" id="passHint">
              For Gmail: Google Account -> Security -> 2-Step Verification -> <a href="https://myaccount.google.com/apppasswords" target="_blank" style="color: var(--primary);">App Passwords</a> (16 characters, spaces stripped automatically).
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-title">2. Custom Sender Domain &amp; Message</div>

          <div class="row-2">
            <div class="form-group">
              <label>Custom Sender Display Name</label>
              <input type="text" id="senderName" value="Syntrabase Platform" />
            </div>
            <div class="form-group">
              <label>Custom Sender Email (Domain)</label>
              <input type="email" id="senderEmail" placeholder="support@yourcustomdomain.com" />
            </div>
          </div>
          <div class="input-hint" style="margin-top: -6px; margin-bottom: 12px;">
            This is what recipients see. To prevent Gmail from displaying "via your@gmail.com", configure this address as an alias in Gmail settings.
          </div>

          <div class="row-2">
            <div class="form-group">
              <label>Reply-To Address</label>
              <input type="email" id="replyTo" placeholder="support@yourcustomdomain.com" />
            </div>
            <div class="form-group">
              <label>Recipient Email</label>
              <input type="email" id="recipientEmail" placeholder="destination@example.com" />
            </div>
          </div>

          <div class="form-group">
            <label>Subject</label>
            <input type="text" id="subject" value="Syntrabase Custom Domain Delivery Test" />
          </div>

          <div class="form-group">
            <label>Message Content (HTML Supported)</label>
            <textarea id="messageContent" rows="3">Hello from Syntrabase! This is a test email sent via SMTP with a custom sender domain.</textarea>
          </div>

          <div class="btn-group">
            <button class="btn-secondary" id="btnVerify" onclick="testConnection()">
              🔍 Verify Connection
            </button>
            <button class="btn-primary" id="btnSend" onclick="sendTestEmail()">
              🚀 Send Live Test Email
            </button>
          </div>
        </div>
      </div>

      <!-- Right Column: Terminal Logs & Instructions -->
      <div style="display: flex; flex-direction: column; gap: 20px;">
        <div class="card">
          <div class="card-title" style="justify-content: space-between;">
            <span>Live Diagnostic Terminal</span>
            <button class="btn-secondary" style="padding: 2px 8px; font-size: 0.7rem; height: auto;" onclick="clearLogs()">Clear</button>
          </div>
          <div class="terminal-box" id="terminalLog">[Ready] Enter your SMTP credentials and click "Verify Connection" or "Send Live Test Email".</div>
        </div>

        <div class="card info-card" style="background: rgba(245, 158, 11, 0.08); border-color: rgba(245, 158, 11, 0.3);">
          <h4 style="color: #fbbf24;">⚠️ Namecheap Domain "Receive-Only"?</h4>
          <p style="margin-bottom: 6px; font-size: 0.78rem;">
            Namecheap's <strong>Free Email Forwarding</strong> is receive-only. It has NO outbound SMTP server (there is no <code>mail.yourdomain.com</code>).
          </p>
          <div style="font-size: 0.76rem; color: #cbd5e1; line-height: 1.5;">
            <strong>Solution 1 (100% Free with Gmail):</strong><br/>
            1. Forward <code>support@yourdomain.com</code> &rarr; your personal <code>@gmail.com</code>.<br/>
            2. In Gmail &rarr; Accounts &rarr; <em>Send mail as</em> &rarr; Add email: use <strong>Host: smtp.gmail.com</strong>, <strong>User: your actual @gmail.com</strong>, and your 16-char App Password.<br/>
            3. Gmail sends verification to your domain, which forwards to your Gmail! Verify it.<br/>
            <strong>Solution 2 (Professional Free Relay):</strong><br/>
            Use Brevo (300 emails/day free) or Resend (3,000/mo free) by adding free TXT records in Namecheap DNS.
          </div>
        </div>

        <div class="card info-card">
          <h4>How to 100% Hide Your Personal Gmail:</h4>
          <p style="margin-bottom: 8px;">
            Google's SMTP servers protect against unauthorized spoofing. If you send with <em>From: support@yourdomain.com</em>, Google checks whether that address is linked to your Google Account.
          </p>
          <ol>
            <li>Open <a href="https://mail.google.com" target="_blank" style="color: var(--primary);">Gmail</a> on the web.</li>
            <li>Click <strong>Settings (Gear) &rarr; See all settings</strong>.</li>
            <li>Go to the <strong>Accounts and Import</strong> tab.</li>
            <li>Under <strong>"Send mail as"</strong>, click <strong>"Add another email address"</strong>.</li>
            <li>Enter your custom domain address (e.g. <code>support@yourdomain.com</code>).</li>
            <li>Complete the confirmation code Google emails to that inbox.</li>
          </ol>
          <p style="margin-top: 8px; color: var(--success); font-weight: 600;">
            ✓ Once verified in "Send mail as", Google SMTP will send directly from your custom domain without exposing your personal @gmail.com!
          </p>
        </div>
      </div>
    </div>
  </div>

  <script>
    function log(msg, type = 'info') {
      const el = document.getElementById('terminalLog');
      const time = new Date().toLocaleTimeString();
      let prefix = '[INFO]';
      if (type === 'error') prefix = '[ERROR]';
      if (type === 'success') prefix = '[SUCCESS]';
      el.textContent += '\\n' + time + ' ' + prefix + ' ' + msg;
      el.scrollTop = el.scrollHeight;
    }

    function clearLogs() {
      document.getElementById('terminalLog').textContent = '[Cleared] Ready for next test.';
    }

    function applyPreset(type) {
      if (type === 'gmail') {
        document.getElementById('smtpHost').value = 'smtp.gmail.com';
        document.getElementById('smtpPort').value = '465';
        document.getElementById('userLabel').textContent = 'Gmail Username / Auth Login';
        document.getElementById('smtpUser').placeholder = 'your-account@gmail.com';
        document.getElementById('userHint').textContent = 'Must be your actual Google account email (e.g. user@gmail.com, NOT your custom domain!).';
        document.getElementById('passLabel').textContent = 'Gmail 16-Character App Password';
        document.getElementById('passHint').innerHTML = 'Generate in Google Account -> Security -> 2-Step Verification -> <a href="https://myaccount.google.com/apppasswords" target="_blank" style="color: var(--primary);">App Passwords</a>';
        log('Loaded preset: Google Gmail SMTP (smtp.gmail.com:465 SSL Direct)', 'info');
      } else if (type === 'brevo') {
        document.getElementById('smtpHost').value = 'smtp-relay.brevo.com';
        document.getElementById('smtpPort').value = '587';
        document.getElementById('userLabel').textContent = 'Brevo Login / Account Email';
        document.getElementById('smtpUser').placeholder = 'you@company.com';
        document.getElementById('userHint').textContent = 'Your registered Brevo account email or SMTP login.';
        document.getElementById('passLabel').textContent = 'Brevo SMTP Key (Master Password)';
        document.getElementById('passHint').textContent = 'Found in Brevo -> SMTP & API -> Generate a new SMTP key (starts with xsmtpsib-).';
        log('Loaded preset: Brevo Transactional SMTP (smtp-relay.brevo.com:587 TLS - Free 300 emails/day)', 'info');
      } else if (type === 'resend') {
        document.getElementById('smtpHost').value = 'smtp.resend.com';
        document.getElementById('smtpPort').value = '465';
        document.getElementById('userLabel').textContent = 'Resend Auth Username';
        document.getElementById('smtpUser').value = 'resend';
        document.getElementById('userHint').textContent = 'Resend always uses the fixed literal username "resend".';
        document.getElementById('passLabel').textContent = 'Resend API Key';
        document.getElementById('smtpPass').placeholder = 're_123456789...';
        document.getElementById('passHint').textContent = 'Generate in Resend.com -> API Keys (starts with re_). Free tier includes 3,000 emails/month.';
        log('Loaded preset: Resend SMTP (smtp.resend.com:465 SSL)', 'info');
      } else if (type === 'namecheap') {
        document.getElementById('smtpHost').value = 'mail.privateemail.com';
        document.getElementById('smtpPort').value = '465';
        document.getElementById('userLabel').textContent = 'Namecheap Private Email Address';
        document.getElementById('smtpUser').placeholder = 'support@yourdomain.com';
        document.getElementById('userHint').textContent = 'Requires a paid Namecheap Private Email subscription (~$1.20/mo). Free forwarding does NOT support this.';
        document.getElementById('passLabel').textContent = 'Namecheap Mailbox Password';
        document.getElementById('passHint').textContent = 'The password created when setting up the mailbox in Namecheap Private Email.';
        log('Loaded preset: Namecheap Private Email (mail.privateemail.com:465 SSL)', 'info');
      }
    }

    function analyzeError(err) {
      if (err.includes('535') || err.includes('Username and Password not accepted') || err.includes('BadCredentials')) {
        return err + '\\n' +
          '\\n  ==> DIAGNOSIS: Authentication Failed (535)\\n' +
          '  1. If using Gmail: Username MUST be your actual @gmail.com address (do NOT enter your custom Namecheap domain as the auth user!).\\n' +
          '  2. Password MUST be a 16-character Google App Password (not your personal Google account password).\\n' +
          '  3. Ensure 2-Step Verification is active on your Google account at https://myaccount.google.com/apppasswords';
      }
      if (err.includes('ENOTFOUND') || err.includes('getaddrinfo') || err.includes('EAI_AGAIN')) {
        return err + '\\n' +
          '\\n  ==> DIAGNOSIS: SMTP Host Not Found (DNS Error)\\n' +
          '  Namecheap Free Email Forwarding DOES NOT provide an outgoing SMTP host (like mail.yourdomain.com).\\n' +
          '  To send for free, keep SMTP Host as "smtp.gmail.com" or use Brevo "smtp-relay.brevo.com".';
      }
      if (err.includes('ETIMEDOUT') || err.includes('ECONNREFUSED')) {
        return err + '\\n' +
          '\\n  ==> DIAGNOSIS: Connection Blocked or Timed Out\\n' +
          '  Network or ISP blocked outbound connection on this port. Try switching between Port 465 (SSL) and Port 587 (TLS).';
      }
      return err;
    }

    function getFormData() {
      return {
        host: document.getElementById('smtpHost').value.trim(),
        port: parseInt(document.getElementById('smtpPort').value, 10),
        user: document.getElementById('smtpUser').value.trim(),
        pass: document.getElementById('smtpPass').value.trim(),
        senderName: document.getElementById('senderName').value.trim(),
        senderEmail: document.getElementById('senderEmail').value.trim(),
        replyTo: document.getElementById('replyTo').value.trim(),
        recipient: document.getElementById('recipientEmail').value.trim(),
        subject: document.getElementById('subject').value.trim(),
        message: document.getElementById('messageContent').value.trim(),
      };
    }

    async function testConnection() {
      const data = getFormData();
      if (!data.user || !data.pass) {
        log('Username and Password / App Key are required.', 'error');
        return;
      }

      const btn = document.getElementById('btnVerify');
      btn.disabled = true;
      btn.textContent = 'Verifying...';
      log('Attempting handshake with ' + data.host + ':' + data.port + ' as ' + data.user + '...');

      try {
        const res = await fetch('/api/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        const result = await res.json();
        if (result.success) {
          log('Handshake successful! SMTP credentials accepted.', 'success');
        } else {
          log('Handshake failed: ' + analyzeError(result.error), 'error');
        }
      } catch (err) {
        log('Network error connecting to test server: ' + err.message, 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = '🔍 Verify Connection';
      }
    }

    async function sendTestEmail() {
      const data = getFormData();
      if (!data.user || !data.pass || !data.recipient) {
        log('Please provide SMTP credentials and recipient email.', 'error');
        return;
      }

      const btn = document.getElementById('btnSend');
      btn.disabled = true;
      btn.textContent = 'Transmitting...';
      log('Preparing to send email to ' + data.recipient + ' with From: "' + data.senderName + '" <' + (data.senderEmail || data.user) + '>...');

      try {
        const res = await fetch('/api/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        const result = await res.json();
        if (result.success) {
          log('MESSAGE DISPATCHED SUCCESSFULLY!', 'success');
          log('Message-ID: ' + result.messageId, 'info');
          log('Server Response: ' + result.response, 'info');
          log('Accepted recipients: ' + result.accepted.join(', '), 'success');
          log('----------------------------------------------------', 'info');
          log('INSPECT INCOMING MESSAGE: Check your inbox headers. If you see From: ' + (data.senderEmail || data.user) + ', custom domain relay is working!', 'success');
        } else {
          log('Dispatch failed: ' + analyzeError(result.error), 'error');
        }
      } catch (err) {
        log('Error contacting test server: ' + err.message, 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = '🚀 Send Live Test Email';
      }
    }
  </script>
</body>
</html>
`;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }

  // Web Dashboard Route
  if (url.pathname === '/' || url.pathname === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(HTML_DASHBOARD);
  }

  // API: Verify SMTP Credentials
  if (url.pathname === '/api/verify' && req.method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const transporter = nodemailer.createTransport({
        host: body.host || 'smtp.gmail.com',
        port: body.port || 465,
        secure: body.port === 465,
        auth: {
          user: body.user,
          pass: (body.pass || '').replace(/\s+/g, ''),
        },
        tls: { rejectUnauthorized: true },
      });

      await transporter.verify();
      return sendJson(res, 200, { success: true });
    } catch (err) {
      return sendJson(res, 400, { success: false, error: err.message });
    }
  }

  // API: Send Live Test Email
  if (url.pathname === '/api/send' && req.method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const port = body.port || 465;
      const secure = port === 465;

      const transporter = nodemailer.createTransport({
        host: body.host || 'smtp.gmail.com',
        port,
        secure,
        auth: {
          user: body.user,
          pass: (body.pass || '').replace(/\s+/g, ''),
        },
        tls: { rejectUnauthorized: true },
      });

      const senderEmail = body.senderEmail || body.user;
      const senderName = body.senderName || 'Syntrabase Support';
      const replyTo = body.replyTo || senderEmail;
      const recipient = body.recipient;
      const subject = body.subject || 'Syntrabase Custom Domain Test';
      const customDomain = senderEmail.split('@')[1] || 'syntrabase.local';

      const mailOptions = {
        from: `"${senderName}" <${senderEmail}>`,
        to: recipient,
        replyTo: `"${senderName}" <${replyTo}>`,
        subject,
        headers: {
          'X-Mailer': 'Syntrabase-Platform-v1.2.2',
          'X-Custom-Sender-Domain': customDomain,
        },
        text: body.message || 'Syntrabase SMTP Test Message',
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">
            <h2 style="color: #2563eb; margin-top: 0;">${subject}</h2>
            <div style="font-size: 14px; line-height: 1.6; color: #334155;">
              ${body.message || 'Syntrabase SMTP Test Message'}
            </div>
            <div style="background: #f8fafc; padding: 12px; border-radius: 6px; font-family: monospace; font-size: 12px; margin-top: 20px;">
              <div><strong>Declared From:</strong> "${senderName}" &lt;${senderEmail}&gt;</div>
              <div><strong>Authenticated As:</strong> ${body.user}</div>
              <div><strong>Recipient:</strong> ${recipient}</div>
              <div><strong>Timestamp:</strong> ${new Date().toISOString()}</div>
            </div>
          </div>
        `,
      };

      const info = await transporter.sendMail(mailOptions);
      return sendJson(res, 200, {
        success: true,
        messageId: info.messageId,
        response: info.response,
        accepted: info.accepted,
        rejected: info.rejected,
      });
    } catch (err) {
      return sendJson(res, 400, { success: false, error: err.message });
    }
  }

  // 404 Fallback
  return sendJson(res, 404, { error: 'Not found' });
});

server.listen(PORT, () => {
  console.log('\\n=============================================================================');
  console.log(`🚀 Syntrabase SMTP & Custom Domain Test Server running on:`);
  console.log(`   👉 http://localhost:${PORT}`);
  console.log('=============================================================================\\n');
  console.log('Open http://localhost:' + PORT + ' in your browser to test Gmail SMTP with a custom domain.');
  console.log('Press Ctrl+C to terminate.\\n');
});
