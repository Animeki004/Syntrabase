import fs from 'fs';
import path from 'path';
import { pool } from './pool.js';

export async function runMigrations(): Promise<void> {
  console.log('[MIGRATIONS] Starting database migrations...');
  let migrationsDir = path.resolve(process.cwd(), 'infrastructure/database/migrations');
  if (!fs.existsSync(migrationsDir)) {
    migrationsDir = path.resolve(process.cwd(), '../../infrastructure/database/migrations');
  }

  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`Migrations directory not found at: ${migrationsDir}`);
  }

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql') && !f.includes('rollback'))
    .sort();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const file of files) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      await client.query(sql);
      console.log(`[MIGRATIONS] Successfully executed ${file}`);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[MIGRATIONS] Failed to execute migrations:', err);
    throw err;
  } finally {
    client.release();
  }
}

// Allow standalone execution
if (process.argv[1]?.endsWith('migrate.js') || process.argv[1]?.endsWith('migrate.ts')) {
  runMigrations()
    .then(() => {
      console.log('[MIGRATIONS] Done.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[MIGRATIONS] Error:', err);
      process.exit(1);
    });
}
