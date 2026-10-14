import crypto from 'node:crypto';
import pg from 'pg';

const ENCRYPTION_KEY = crypto
  .createHash('sha256')
  .update(process.env.CREDENTIALS_ENCRYPTION_KEY || 'syntrabase-default-dev-credential-key-32b')
  .digest();

function decryptCredentials(encrypted) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, Buffer.from(encrypted.iv, 'hex'));
  decipher.setAuthTag(Buffer.from(encrypted.authTag, 'hex'));
  let plain = decipher.update(encrypted.ciphertext, 'hex', 'utf8');
  plain += decipher.final('utf8');
  return JSON.parse(plain);
}

async function run() {
  const client = new pg.Client({
    host: 'localhost',
    port: 5432,
    database: 'syntrabase',
    user: 'postgres',
    password: 'postgres'
  });
  await client.connect();

  const res = await client.query("SELECT encrypted_credentials FROM email_provider_accounts WHERE id = 'db6f8e98-13c3-48c2-a692-69ebc53d32cb'");
  const apiKey = decryptCredentials(res.rows[0].encrypted_credentials).apiKey;

  // Dispatch live email to melkanipankaj28@gmail.com
  const sendRes = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'content-type': 'application/json',
      'accept': 'application/json'
    },
    body: JSON.stringify({
      sender: { name: 'Syntrabase Cloud Security', email: 'histrogen12@gmail.com' },
      to: [{ email: 'melkanipankaj28@gmail.com', name: 'Pankaj Melkani' }],
      subject: 'Syntrabase Cloud: Real-Time Transactional Email Delivered',
      htmlContent: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #2563eb; margin-top: 0;">Syntrabase Cloud Delivery Verified</h2>
          <p>Hello Pankaj,</p>
          <p>This message confirms that the Syntrabase email pipeline is fully connected to Brevo and transmitting transactional messages successfully.</p>
          <div style="background: #f8fafc; padding: 14px; border-radius: 6px; font-family: monospace; font-size: 13px; margin: 16px 0;">
            <strong>Recipient:</strong> melkanipankaj28@gmail.com<br/>
            <strong>Status:</strong> Dispatched via Brevo API<br/>
            <strong>Timestamp:</strong> ${new Date().toISOString()}
          </div>
          <p style="color: #64748b; font-size: 13px;">This is an automated test from Syntrabase Platform.</p>
        </div>
      `,
      textContent: `Syntrabase Cloud Delivery Verified for melkanipankaj28@gmail.com at ${new Date().toISOString()}`
    })
  });

  console.log('Send HTTP Status:', sendRes.status);
  const data = await sendRes.json();
  console.log('Brevo response:', data);

  // Record in outbox queue
  if (sendRes.ok && data.messageId) {
    await client.query(
      `INSERT INTO email_outbox_queue (
        project_id, recipient_email, recipient_name, sender_email, sender_name,
        subject, status, attempts, provider_message_id, processed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, 'sent', 1, $7, NOW())`,
      [
        '00000000-0000-0000-0000-000000000020',
        'melkanipankaj28@gmail.com',
        'Pankaj Melkani',
        'histrogen12@gmail.com',
        'Syntrabase Cloud Security',
        'Syntrabase Cloud: Real-Time Transactional Email Delivered',
        data.messageId
      ]
    );
    console.log('Recorded in email_outbox_queue as SENT.');
  }

  // Poll event statistics after 3 seconds
  console.log('Awaiting Brevo delivery confirmation...');
  await new Promise(r => setTimeout(r, 4000));

  const evRes = await fetch('https://api.brevo.com/v3/smtp/statistics/events?email=melkanipankaj28@gmail.com&limit=3', {
    headers: { 'api-key': apiKey }
  });
  const evData = await evRes.json();
  console.log('Latest Brevo Events for melkanipankaj28@gmail.com:');
  console.log(JSON.stringify(evData.events, null, 2));

  await client.end();
}

run().catch(console.error);
