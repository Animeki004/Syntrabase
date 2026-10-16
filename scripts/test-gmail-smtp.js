#!/usr/bin/env node

/**
 * =============================================================================
 * Syntrabase - Gmail SMTP & Custom Sender Domain Diagnostic CLI Tool
 * =============================================================================
 * This standalone script connects to Google's SMTP servers (smtp.gmail.com)
 * and tests transmitting email using a custom sender domain / alias while
 * analyzing how Google handles header rewriting and sender privacy.
 *
 * Usage:
 *   node scripts/test-gmail-smtp.js
 * Or with environment variables:
 *   GMAIL_USER="yourname@gmail.com" \
 *   GMAIL_APP_PASSWORD="xxxx xxxx xxxx xxxx" \
 *   SENDER_NAME="Syntrabase Cloud" \
 *   SENDER_EMAIL="notifications@yourdomain.com" \
 *   RECIPIENT_EMAIL="you@example.com" \
 *   node scripts/test-gmail-smtp.js
 * =============================================================================
 */

import nodemailer from 'nodemailer';
import readline from 'node:readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(query, defaultValue = '') {
  return new Promise((resolve) => {
    const promptText = defaultValue ? `${query} [${defaultValue}]: ` : `${query}: `;
    rl.question(promptText, (ans) => {
      resolve(ans.trim() || defaultValue);
    });
  });
}

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(`
Syntrabase - Gmail SMTP & Custom Sender Domain Diagnostic Tool

Usage:
  node scripts/test-gmail-smtp.js
  npm run test:smtp

Environment Variables (Optional - skips interactive prompts):
  GMAIL_USER           Your Gmail account (e.g. user@gmail.com)
  GMAIL_APP_PASSWORD   16-character App Password (e.g. "abcd efgh ijkl mnop")
  SENDER_NAME          Display Name (default: "Syntrabase Cloud")
  SENDER_EMAIL         Custom Domain Email (e.g. notifications@mydomain.com)
  RECIPIENT_EMAIL      Where to send the test email
  SMTP_PORT            465 (SSL) or 587 (STARTTLS) (default: 465)

Web Interface:
  npm run start:smtp-test-server (launches interactive UI at http://localhost:4055)
`);
    rl.close();
    process.exit(0);
  }

  console.log('\n=============================================================================');
  console.log('       SYNTRABASE - GMAIL SMTP & CUSTOM SENDER DOMAIN TESTER                ');
  console.log('=============================================================================\n');
  console.log('NOTE: Gmail requires an App Password (16 characters) if 2-Step Verification');
  console.log('is active on your Google Account. Generate one at:');
  console.log('  -> https://myaccount.google.com/apppasswords\n');

  // 1. Collect inputs (from env or prompt)
  const gmailUser = process.env.GMAIL_USER || (await ask('1. Gmail Address / Username (e.g. user@gmail.com)'));
  if (!gmailUser) {
    console.error('Error: Gmail username is required.');
    rl.close();
    process.exit(1);
  }

  const gmailPass =
    process.env.GMAIL_APP_PASSWORD || (await ask('2. Gmail App Password (16 chars, e.g. "abcd efgh ijkl mnop")'));
  if (!gmailPass) {
    console.error('Error: Gmail App Password is required.');
    rl.close();
    process.exit(1);
  }

  const senderName = process.env.SENDER_NAME || (await ask('3. Custom Sender Display Name', 'Syntrabase Support'));
  const senderEmail =
    process.env.SENDER_EMAIL ||
    (await ask('4. Custom Sender Email (Your Domain, e.g. support@yourdomain.com)', gmailUser));
  const replyTo = process.env.REPLY_TO || (await ask('5. Reply-To Address', senderEmail));
  const recipient =
    process.env.RECIPIENT_EMAIL || (await ask('6. Recipient Email Address', gmailUser));

  const portStr = await ask('7. SMTP Port (465 for SSL, 587 for TLS)', '465');
  const port = parseInt(portStr, 10);
  const secure = port === 465;

  rl.close();

  const cleanPass = gmailPass.replace(/\s+/g, '');

  console.log('\n-----------------------------------------------------------------------------');
  console.log('Configuration Summary:');
  console.log(`  SMTP Server:   smtp.gmail.com:${port} (${secure ? 'SSL Direct' : 'STARTTLS'})`);
  console.log(`  Auth User:     ${gmailUser}`);
  console.log(`  From Header:   "${senderName}" <${senderEmail}>`);
  console.log(`  Reply-To:      ${replyTo}`);
  console.log(`  Recipient:     ${recipient}`);
  console.log('-----------------------------------------------------------------------------\n');

  console.log('1. Establishing secure connection & validating credentials...');

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port,
    secure,
    auth: {
      user: gmailUser.trim(),
      pass: cleanPass,
    },
    tls: {
      rejectUnauthorized: true,
    },
    debug: true,
    logger: false,
  });

  try {
    await transporter.verify();
    console.log('   [SUCCESS] Gmail SMTP authentication accepted! Credentials are valid.\n');
  } catch (verifyErr) {
    console.error('   [FAILED] Could not connect to Gmail SMTP:');
    console.error(`   ${verifyErr.message}\n`);
    if (verifyErr.message.includes('535') || verifyErr.message.includes('Username and Password not accepted')) {
      console.log('   [TROUBLESHOOTING]:');
      console.log('   1. Gmail Username MUST be your actual personal @gmail.com address (do NOT enter your custom Namecheap domain here).');
      console.log('   2. Ensure 2-Step Verification is turned ON for your Google account.');
      console.log('   3. Create a dedicated App Password at: https://myaccount.google.com/apppasswords');
      console.log('   4. Do NOT use your regular Google login password; use the 16-character App Password without spaces.');
    }
    process.exit(1);
  }

  console.log('2. Transmitting test message with custom sender domain headers...');

  const messageId = `<syntrabase-smtp-${Date.now()}@${senderEmail.split('@')[1] || 'syntrabase.local'}>`;
  const mailOptions = {
    from: `"${senderName}" <${senderEmail}>`,
    to: recipient,
    replyTo: `"${senderName}" <${replyTo}>`,
    subject: `Syntrabase Custom Domain Test [${senderEmail}]`,
    messageId,
    headers: {
      'X-Mailer': 'Syntrabase-Platform-v1.2.2',
      'X-Custom-Sender-Domain': senderEmail.split('@')[1] || 'syntrabase.internal',
    },
    text: [
      `Syntrabase SMTP Test Message`,
      `----------------------------------------------------`,
      `Auth Account:   ${gmailUser}`,
      `Custom From:    "${senderName}" <${senderEmail}>`,
      `Reply-To:       ${replyTo}`,
      `Recipient:      ${recipient}`,
      `Timestamp:      ${new Date().toISOString()}`,
      `----------------------------------------------------`,
      `If you received this message, your Gmail SMTP connection is operational!`,
      ``,
      `SENDER PRIVACY & CUSTOM DOMAIN REPORT:`,
      `Check your email client's "From" field and raw message headers:`,
      `1. If the sender shows as "${senderEmail}", your custom domain alias is approved by Google!`,
      `2. If the sender shows as "${gmailUser}" or "via ${gmailUser}", follow the Gmail "Send mail as"`,
      `   instructions in the documentation to hide your personal @gmail.com address permanently.`,
    ].join('\n'),
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 620px; margin: 0 auto; padding: 28px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
        <div style="display: flex; align-items: center; gap: 12px; border-bottom: 2px solid #3b82f6; padding-bottom: 16px; margin-bottom: 20px;">
          <h2 style="color: #1e293b; margin: 0; font-size: 1.25rem;">Syntrabase SMTP Test: Custom Domain Delivery</h2>
        </div>
        <p style="color: #334155; font-size: 0.95rem; line-height: 1.5;">
          This test message confirms that outbound email was successfully dispatched through <strong>smtp.gmail.com</strong> using your custom sender configuration.
        </p>

        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 0.85rem; color: #1e293b;">
          <div><strong style="color: #64748b;">Declared Sender:</strong> "${senderName}" &lt;${senderEmail}&gt;</div>
          <div style="margin-top: 6px;"><strong style="color: #64748b;">Reply-To:</strong> ${replyTo}</div>
          <div style="margin-top: 6px;"><strong style="color: #64748b;">Authenticated Via:</strong> ${gmailUser}</div>
          <div style="margin-top: 6px;"><strong style="color: #64748b;">Recipient:</strong> ${recipient}</div>
          <div style="margin-top: 6px;"><strong style="color: #64748b;">Server Handshake:</strong> smtp.gmail.com:${port} (${secure ? 'SSL' : 'STARTTLS'})</div>
          <div style="margin-top: 6px;"><strong style="color: #64748b;">Timestamp:</strong> ${new Date().toISOString()}</div>
        </div>

        <div style="background: #eff6ff; border-left: 4px solid #3b82f6; padding: 14px; border-radius: 4px; margin-top: 24px;">
          <h4 style="margin: 0 0 6px; color: #1e40af; font-size: 0.9rem;">Custom Domain Privacy Verification</h4>
          <p style="margin: 0; font-size: 0.82rem; color: #1e3a8a; line-height: 1.45;">
            Inspect this incoming message in your email client. If you see your custom domain <strong>${senderEmail}</strong> without any reference to <strong>${gmailUser}</strong>, your domain alias configuration is complete.
          </p>
        </div>
      </div>
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('   [SUCCESS] Message accepted by Google SMTP queue!');
    console.log(`   Message ID:   ${info.messageId}`);
    console.log(`   Response:     ${info.response}`);
    console.log(`   Accepted:     ${info.accepted.join(', ')}`);
    if (info.rejected.length > 0) {
      console.log(`   Rejected:     ${info.rejected.join(', ')}`);
    }

    console.log('\n=============================================================================');
    console.log('             HOW TO 100% HIDE YOUR ACTUAL GMAIL ADDRESS                      ');
    console.log('=============================================================================');
    console.log('By default, if Google detects a "From:" address that is NOT listed in your');
    console.log('Google Account, it may append a "Sender:" header or rewrite the From header.');
    console.log('\nTo guarantee ONLY your custom domain appears (and NEVER your @gmail.com):');
    console.log('1. Open Gmail on the web: https://mail.google.com');
    console.log('2. Click the Gear icon (top-right) -> "See all settings"');
    console.log('3. Go to the "Accounts and Import" tab');
    console.log('4. Under "Send mail as", click "Add another email address"');
    console.log(`5. Enter Name: "${senderName}" and Email: "${senderEmail}"`);
    console.log('6. Click "Next Step" and enter the verification code Google emails to that address.');
    console.log(`7. (Optional) Click "Make default" next to ${senderEmail}.\n`);
    console.log('Once verified, Google allows you to send through smtp.gmail.com with your');
    console.log(`custom domain "${senderEmail}" as the primary sender without exposing your personal Gmail!`);
    console.log('=============================================================================\n');
  } catch (sendErr) {
    console.error('   [FAILED] Message dispatch error:');
    console.error(`   ${sendErr.message}\n`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
