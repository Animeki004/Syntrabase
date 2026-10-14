const pg = require('pg');
const pool = new pg.Pool({ host: 'localhost', port: 5432, database: 'syntrabase', user: 'postgres', password: 'postgres' });

async function seed() {
  await pool.query(`
    INSERT INTO internal_notifications (category, severity, title, message, is_read, created_at)
    VALUES 
      ('security', 'warning', 'Tamper-Evident Ledger Heartbeat', 'Cryptographic block hash continuity verified across all sequence blocks.', FALSE, NOW()),
      ('email_infra', 'info', 'Brevo Outbox Engine Active', 'Outbound transactional gateway is ready for tenant and platform dispatch.', FALSE, NOW() - INTERVAL '2 minutes'),
      ('security', 'info', 'AES-256-GCM Backup Drill Ready', 'Automated disaster recovery drill staged for clean-host restore.', FALSE, NOW() - INTERVAL '5 minutes')
  `);
  console.log('Unread notifications seeded successfully!');
  await pool.end();
}

seed().catch(err => { console.error(err); process.exit(1); });
