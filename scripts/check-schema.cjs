const pg = require('pg');
const pool = new pg.Pool({ host: 'localhost', port: 5432, database: 'syntrabase', user: 'postgres', password: 'postgres' });

async function main() {
  const pCols = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'projects'");
  console.log('projects columns:', pCols.rows.map(r => `${r.column_name} (${r.data_type})`));
  
  const dCols = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'custom_sender_domains'");
  console.log('custom_sender_domains columns:', dCols.rows.map(r => `${r.column_name} (${r.data_type})`));
  
  const aCols = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'email_provider_accounts'");
  console.log('email_provider_accounts columns:', aCols.rows.map(r => `${r.column_name} (${r.data_type})`));

  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
