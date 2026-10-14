const pg = require('pg');
const pool = new pg.Pool({ host: 'localhost', port: 5432, database: 'syntrabase', user: 'postgres', password: 'postgres' });

async function run() {
  await pool.query(`
    ALTER TABLE projects
    ADD COLUMN IF NOT EXISTS dedicated_brevo_enabled BOOLEAN NOT NULL DEFAULT FALSE;
  `);
  console.log('Successfully added dedicated_brevo_enabled to projects table');
  await pool.end();
}

run().catch(err => { console.error(err); process.exit(1); });
