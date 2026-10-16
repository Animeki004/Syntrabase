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
            <label>Gmail Username / Login</label>
            <input type="email" id="smtpUser" placeholder="your-account@gmail.com" />
            <div class="input-hint">The authenticated Google account email used to connect to Google's server.</div>
          </div>

          <div class="form-group">
            <label>Gmail 16-Character App Password</label>
            <input type="password" id="smtpPass" placeholder="abcd efgh ijkl mnop" />
            <div class="input-hint">
              Generate in Google Account -> Security -> 2-Step Verification -> <a href="https://myaccount.google.com/apppasswords" target="_blank" style="color: var(--primary);">App Passwords</a>
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
              <input type="email" id="senderEmail" placeholder="support@yourcompany.com" />
            </div>
          </div>
          <div class="input-hint" style="margin-top: -6px; margin-bottom: 12px;">
            This is the address recipients see. To prevent Gmail from replacing it with your @gmail.com, configure it as an alias in Gmail.
          </div>

          <div class="row-2">
            <div class="form-group">
              <label>Reply-To Address</label>
              <input type="email" id="replyTo" placeholder="support@yourcompany.com" />
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
            <textarea id="messageContent" rows="3">Hello from Syntrabase! This is a test email sent via Gmail SMTP with a custom sender domain.</textarea>
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
          <div class="terminal-box" id="terminalLog">[Ready] Enter your Gmail SMTP credentials and click "Verify Connection" or "Send Live Test Email".</div>
        </div>

        <div class="card info-card">
          <h4>How to 100% Hide Your Gmail Address:</h4>
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
        log('Gmail username and App Password are required.', 'error');
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
          log('Handshake successful! Google SMTP credentials accepted.', 'success');
        } else {
          log('Handshake failed: ' + result.error, 'error');
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
        log('Please provide Gmail credentials and recipient email.', 'error');
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
          log('Dispatch failed: ' + result.error, 'error');
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
          pass: (body.pass || '').replace(/\\s+/g, ''),
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
          pass: (body.pass || '').replace(/\\s+/g, ''),
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
