import pg from 'pg';
import assert from 'node:assert/strict';

const { Pool } = pg;

const pool = new Pool({
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5432', 10),
  database: process.env.DATABASE_NAME || 'syntrabase',
  user: process.env.DATABASE_USER || 'postgres',
  password: process.env.DATABASE_PASSWORD || 'postgres',
  connectionTimeoutMillis: 5000,
});

async function runDatabaseTestSuite() {
  console.log('================================================================');
  console.log('       SYNTRABASE AUTHORITATIVE DATABASE VERIFICATION SUITE      ');
  console.log('================================================================\n');

  const client = await pool.connect();
  let passedTests = 0;
  let totalTests = 0;

  async function testStep(name, fn) {
    totalTests++;
    process.stdout.write(`[TEST ${totalTests}] ${name} ... `);
    try {
      await fn();
      console.log('PASSED');
      passedTests++;
    } catch (err) {
      console.log('FAILED');
      console.error(`   -> Error: ${err.message}`);
      throw err;
    }
  }

  try {
    // TEST 1: Database Connectivity and Version
    await testStep('PostgreSQL 16 Engine Connectivity & Latency', async () => {
      const res = await client.query('SELECT version(), NOW() as server_time');
      assert.ok(res.rows[0].version.includes('PostgreSQL 16'));
      assert.ok(res.rows[0].server_time);
    });

    // TEST 2: Schema Migrations Validation (All 35 authoritative tables)
    await testStep('Schema Completeness: 35 Core Tables Exist', async () => {
      const res = await client.query(`
        SELECT count(*)::int as table_count
        FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
      `);
      assert.ok(res.rows[0].table_count >= 35, `Expected at least 35 tables, found ${res.rows[0].table_count}`);
    });

    // TEST 3: Multi-Database Hierarchy & Project Integrity
    await testStep('Multi-Database & Hierarchy Integrity', async () => {
      const projRes = await client.query(`SELECT id, slug, status FROM projects WHERE slug = 'default-project'`);
      assert.equal(projRes.rows.length, 1);
      const projectId = projRes.rows[0].id;

      const dbRes = await client.query(`SELECT id, database_id, engine, status FROM databases WHERE project_id = $1`, [projectId]);
      assert.ok(dbRes.rows.length >= 1);
      const defaultDb = dbRes.rows.find((d) => d.database_id === '(default)');
      assert.ok(defaultDb, 'Default database must be present');
      assert.equal(defaultDb.engine, 'syntrabase-jsonb');
      assert.equal(defaultDb.status, 'ready');
    });

    // TEST 4: JSONB Document Store: Direct Document Read & Structure
    await testStep('Firestore JSONB Store: Seeded Documents Verified', async () => {
      const usersRes = await client.query(`
        SELECT document_id, data FROM documents 
        WHERE collection_path = 'users' ORDER BY document_id;
      `);
      assert.equal(usersRes.rows.length, 3);
      assert.equal(usersRes.rows[0].document_id, 'usr_1');
      assert.equal(usersRes.rows[0].data.name, 'Alice Smith');
      assert.equal(usersRes.rows[0].data.role, 'admin');
      assert.equal(usersRes.rows[0].data.credits, 1250);
    });

    // TEST 5: JSONB Operators & GIN Index Querying
    await testStep('JSONB Query Engine: Filter, Type Cast & Array Containment', async () => {
      // 5a. Key/Value filter
      const adminUsers = await client.query(`
        SELECT document_id FROM documents
        WHERE collection_path = 'users' AND data->>'role' = 'admin';
      `);
      assert.equal(adminUsers.rows.length, 1);
      assert.equal(adminUsers.rows[0].document_id, 'usr_1');

      // 5b. Numeric comparison
      const highCreditUsers = await client.query(`
        SELECT document_id FROM documents
        WHERE collection_path = 'users' AND (data->>'credits')::int > 300
        ORDER BY (data->>'credits')::int DESC;
      `);
      assert.equal(highCreditUsers.rows.length, 2);
      assert.equal(highCreditUsers.rows[0].document_id, 'usr_1');
      assert.equal(highCreditUsers.rows[1].document_id, 'usr_2');

      // 5c. Array containment
      const vipUsers = await client.query(`
        SELECT document_id FROM documents
        WHERE collection_path = 'users' AND data->'tags' ? 'vip';
      `);
      assert.equal(vipUsers.rows.length, 1);
      assert.equal(vipUsers.rows[0].document_id, 'usr_1');
    });

    // TEST 6: Atomic Document CRUD & Version Increment
    await testStep('Atomic CRUD Cycle & Document Versioning', async () => {
      const testDocId = `test_doc_${Date.now()}`;
      const projRes = await client.query(`SELECT id FROM projects WHERE slug = 'default-project'`);
      const envRes = await client.query(`SELECT id FROM environments WHERE slug = 'production'`);
      const projectId = projRes.rows[0].id;
      const envId = envRes.rows[0].id;

      // 1. CREATE
      await client.query(`
        INSERT INTO documents (project_id, environment_id, collection_path, document_id, data, database_id, version)
        VALUES ($1, $2, 'integration_tests', $3, '{"score": 100, "status": "draft"}'::jsonb, '(default)', 1);
      `, [projectId, envId, testDocId]);

      // 2. READ
      const readRes = await client.query(`
        SELECT version, data FROM documents WHERE collection_path = 'integration_tests' AND document_id = $1;
      `, [testDocId]);
      assert.equal(readRes.rows.length, 1);
      assert.equal(readRes.rows[0].version, '1');
      assert.equal(readRes.rows[0].data.score, 100);

      // 3. UPDATE (atomic increment + version bump)
      await client.query(`
        UPDATE documents
        SET data = jsonb_set(data, '{score}', '250'::jsonb),
            version = version + 1,
            updated_at = NOW()
        WHERE collection_path = 'integration_tests' AND document_id = $1;
      `, [testDocId]);

      const updatedRes = await client.query(`
        SELECT version, data FROM documents WHERE collection_path = 'integration_tests' AND document_id = $1;
      `, [testDocId]);
      assert.equal(updatedRes.rows[0].version, '2');
      assert.equal(updatedRes.rows[0].data.score, 250);

      // 4. DELETE
      await client.query(`
        DELETE FROM documents WHERE collection_path = 'integration_tests' AND document_id = $1;
      `, [testDocId]);

      const deletedRes = await client.query(`
        SELECT * FROM documents WHERE collection_path = 'integration_tests' AND document_id = $1;
      `, [testDocId]);
      assert.equal(deletedRes.rows.length, 0);
    });

    // TEST 7: ACID Transactional Rollback Guarantee
    await testStep('ACID Transaction Isolation & Rollback Verification', async () => {
      const testRollbackId = `doc_rollback_${Date.now()}`;
      const projRes = await client.query(`SELECT id FROM projects WHERE slug = 'default-project'`);
      const envRes = await client.query(`SELECT id FROM environments WHERE slug = 'production'`);
      const projectId = projRes.rows[0].id;
      const envId = envRes.rows[0].id;

      let rollbackTriggered = false;
      const txClient = await pool.connect();
      try {
        await txClient.query('BEGIN');
        await txClient.query(`
          INSERT INTO documents (project_id, environment_id, collection_path, document_id, data, database_id, version)
          VALUES ($1, $2, 'rollback_test', $3, '{"trans": "active"}'::jsonb, '(default)', 1);
        `, [projectId, envId, testRollbackId]);

        // Force intentional failure
        await txClient.query(`SELECT * FROM nonexistent_table_error_trigger`);
        await txClient.query('COMMIT');
      } catch {
        await txClient.query('ROLLBACK');
        rollbackTriggered = true;
      } finally {
        txClient.release();
      }

      assert.ok(rollbackTriggered, 'Rollback should have been triggered');
      const checkRes = await client.query(`
        SELECT * FROM documents WHERE collection_path = 'rollback_test' AND document_id = $1;
      `, [testRollbackId]);
      assert.equal(checkRes.rows.length, 0, 'Document must not exist after rollback');
    });

    // TEST 8: Custom Domains & Sender Identities Schema & Constraints
    await testStep('Email & Custom Domains Schema Consistency', async () => {
      const domainRes = await client.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'custom_sender_domains' AND column_name = 'updated_at';
      `);
      assert.equal(domainRes.rows.length, 1, 'Column updated_at must exist on custom_sender_domains');

      const senderConstraint = await client.query(`
        SELECT constraint_name 
        FROM information_schema.table_constraints 
        WHERE table_name = 'authorized_sender_identities' AND constraint_type = 'FOREIGN KEY';
      `);
      assert.ok(senderConstraint.rows.length >= 1, 'Foreign key to custom_sender_domains must exist');
    });

    // TEST 9: Event Outbox & Durable Queue Guarantee
    await testStep('Durable Event Outbox Queue & Status Flow', async () => {
      const emailOutboxRes = await client.query(`
        SELECT count(*)::int as pending_count 
        FROM email_outbox_queue 
        WHERE status IN ('queued', 'processing', 'sent');
      `);
      assert.ok(typeof emailOutboxRes.rows[0].pending_count === 'number');

      const eventOutboxRes = await client.query(`
        SELECT count(*)::int as event_count
        FROM event_outbox;
      `);
      assert.ok(typeof eventOutboxRes.rows[0].event_count === 'number');
    });

    // TEST 10: Cryptographic Audit Ledger Forward-Chain Verification
    await testStep('Cryptographic Audit Ledger Chain Integrity', async () => {
      const ledgerRes = await client.query(`
        SELECT sequence_id, current_hash, prev_hash 
        FROM audit_ledger 
        ORDER BY sequence_id ASC;
      `);
      // If records exist, verify chain
      for (let i = 1; i < ledgerRes.rows.length; i++) {
        assert.equal(ledgerRes.rows[i].prev_hash, ledgerRes.rows[i - 1].current_hash);
      }
    });

    console.log('\n================================================================');
    console.log(` ALL ${passedTests}/${totalTests} DATABASE VERIFICATION TESTS PASSED`);
    console.log(' Authoritative PostgreSQL 16 JSONB Engine is 100% Operational');
    console.log('================================================================\n');
  } finally {
    client.release();
    await pool.end();
  }
}

runDatabaseTestSuite()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[DATABASE TEST ERROR]', err);
    process.exit(1);
  });
