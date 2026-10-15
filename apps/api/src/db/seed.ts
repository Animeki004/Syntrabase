import { pool, query } from './pool.js';
import { CryptoUtil } from '../utils/crypto.js';

export async function seedDatabase(): Promise<void> {
  console.log('[SEED] Starting full database seeding...');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 0. Super Admin Developer & Platform Admin
    const superAdminEmail = (process.env.PLATFORM_ADMIN_EMAIL || process.env.SUPERADMIN_EMAIL || 'superadmin@syntrabase.internal').trim().toLowerCase();
    const superAdminPassword = process.env.PLATFORM_ADMIN_PASSWORD || process.env.SUPERADMIN_PASSWORD || 'SyntrabaseRoot2026!';
    const superAdminHash = await CryptoUtil.hashPassword(superAdminPassword);
    await client.query(`
      INSERT INTO developers (id, email, password_hash, display_name, email_verified, is_platform_admin, status, created_at, updated_at)
      VALUES (
        '00000000-0000-0000-0000-000000000001',
        $1,
        $2,
        'Platform Operator',
        true,
        true,
        'active',
        NOW(),
        NOW()
      )
      ON CONFLICT (id) DO UPDATE SET email = $1, password_hash = $2, is_platform_admin = true, status = 'active';
    `, [superAdminEmail, superAdminHash]);

    await client.query(`
      INSERT INTO platform_admins (developer_id, mfa_enabled, created_at)
      VALUES ('00000000-0000-0000-0000-000000000001', false, NOW())
      ON CONFLICT (developer_id) DO NOTHING;
    `);
    console.log('[SEED] Super Admin verified.');

    // 1. Organization
    await client.query(`
      INSERT INTO organizations (id, name, slug, owner_id)
      VALUES (
        '00000000-0000-0000-0000-000000000010',
        'Syntrabase Core Org',
        'default-org',
        '00000000-0000-0000-0000-000000000001'
      )
      ON CONFLICT (slug) DO NOTHING;
    `);
    console.log('[SEED] Organization verified.');

    // 2. Project
    await client.query(`
      INSERT INTO projects (id, organization_id, name, slug, status, plan_id)
      VALUES (
        '00000000-0000-0000-0000-000000000020',
        '00000000-0000-0000-0000-000000000010',
        'Syntrabase Production Cluster',
        'default-project',
        'active',
        (SELECT id FROM plans WHERE slug = 'pro' LIMIT 1)
      )
      ON CONFLICT (organization_id, slug) DO UPDATE SET plan_id = (SELECT id FROM plans WHERE slug = 'pro' LIMIT 1);
    `);
    console.log('[SEED] Project default-project verified.');

    // 2b. Organization Membership for Developer
    await client.query(`
      INSERT INTO organization_members (organization_id, developer_id, role)
      VALUES (
        '00000000-0000-0000-0000-000000000010',
        '00000000-0000-0000-0000-000000000002',
        'admin'
      )
      ON CONFLICT (organization_id, developer_id) DO UPDATE SET role = 'admin';
    `);
    console.log('[SEED] Organization developer membership verified.');

    // 3. Environment
    await client.query(`
      INSERT INTO environments (id, project_id, name, slug, is_default)
      VALUES (
        '00000000-0000-0000-0000-000000000030',
        '00000000-0000-0000-0000-000000000020',
        'Production',
        'production',
        true
      )
      ON CONFLICT (project_id, slug) DO NOTHING;
    `);
    console.log('[SEED] Environment production verified.');

    // 4. Default Database
    await client.query(`
      INSERT INTO databases (id, project_id, database_id, name, engine, status)
      VALUES (
        '00000000-0000-0000-0000-000000000040',
        '00000000-0000-0000-0000-000000000020',
        '(default)',
        'Authoritative Primary JSONB',
        'syntrabase-jsonb',
        'ready'
      )
      ON CONFLICT (project_id, database_id) DO NOTHING;
    `);
    console.log('[SEED] Database (default) verified.');

    // 5. API Credentials
    await client.query(`
      INSERT INTO api_credentials (
        id, project_id, environment_id, name, type, key_prefix, key_identifier, hashed_secret, scopes
      )
      VALUES (
        '00000000-0000-0000-0000-000000000050',
        '00000000-0000-0000-0000-000000000020',
        '00000000-0000-0000-0000-000000000030',
        'Production Client Key',
        'public',
        'pk_live_',
        'pk_live_default_key_syntrabase_2026',
        'none',
        ARRAY['read', 'write']
      )
      ON CONFLICT (key_identifier) DO NOTHING;
    `);
    console.log('[SEED] Public API key verified.');

    // 6. Documents (Firestore JSONB Document collections)
    const documentsToSeed = [
      // Users collection
      {
        col: 'users',
        docId: 'usr_1',
        data: {
          name: 'Alice Smith',
          email: 'alice@example.com',
          role: 'admin',
          credits: 1250,
          status: 'active',
          tags: ['vip', 'beta'],
          createdAt: new Date().toISOString(),
        },
      },
      {
        col: 'users',
        docId: 'usr_2',
        data: {
          name: 'Bob Jones',
          email: 'bob@example.com',
          role: 'developer',
          credits: 340,
          status: 'active',
          tags: ['pro'],
          createdAt: new Date().toISOString(),
        },
      },
      {
        col: 'users',
        docId: 'usr_3',
        data: {
          name: 'Charlie Brown',
          email: 'charlie@example.com',
          role: 'viewer',
          credits: 0,
          status: 'pending',
          tags: [],
          createdAt: new Date().toISOString(),
        },
      },
      // Products collection
      {
        col: 'products',
        docId: 'prod_1',
        data: {
          title: 'Edge Compute Worker',
          category: 'infrastructure',
          price: 29.99,
          inStock: true,
          inventory: 1500,
          sku: 'ECW-100',
        },
      },
      {
        col: 'products',
        docId: 'prod_2',
        data: {
          title: 'PostgreSQL Realtime Channel',
          category: 'database',
          price: 99.00,
          inStock: true,
          inventory: 420,
          sku: 'PRC-200',
        },
      },
      // Orders collection
      {
        col: 'orders',
        docId: 'ord_1',
        data: {
          customerId: 'usr_1',
          total: 128.99,
          currency: 'USD',
          status: 'completed',
          itemsCount: 3,
          placedAt: new Date().toISOString(),
        },
      },
      {
        col: 'orders',
        docId: 'ord_2',
        data: {
          customerId: 'usr_2',
          total: 49.50,
          currency: 'USD',
          status: 'processing',
          itemsCount: 1,
          placedAt: new Date().toISOString(),
        },
      },
      // Audit logs collection
      {
        col: 'audit_logs',
        docId: 'log_1',
        data: {
          action: 'AUTH_LOGIN',
          userId: 'usr_1',
          ip: '192.168.1.100',
          timestamp: new Date().toISOString(),
          result: 'SUCCESS',
        },
      },
      {
        col: 'audit_logs',
        docId: 'log_2',
        data: {
          action: 'SCHEMA_UPDATE',
          userId: 'superadmin',
          ip: '127.0.0.1',
          timestamp: new Date().toISOString(),
          result: 'APPLIED',
        },
      },
    ];

    for (const doc of documentsToSeed) {
      await client.query(
        `
        INSERT INTO documents (
          project_id, environment_id, collection_path, document_id, data, database_id, version
        )
        VALUES (
          '00000000-0000-0000-0000-000000000020',
          '00000000-0000-0000-0000-000000000030',
          $1, $2, $3, '(default)', 1
        )
        ON CONFLICT (project_id, environment_id, collection_path, document_id)
        DO UPDATE SET data = $3, updated_at = NOW();
      `,
        [doc.col, doc.docId, JSON.stringify(doc.data)]
      );
    }
    console.log(`[SEED] Seeded ${documentsToSeed.length} Firestore documents across 4 collections.`);

    await client.query('COMMIT');
    console.log('[SEED] Database seeding committed successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[SEED] Database seeding failed:', err);
    throw err;
  } finally {
    client.release();
  }
}

if (process.argv[1]?.endsWith('seed.js') || process.argv[1]?.endsWith('seed.ts')) {
  seedDatabase()
    .then(() => {
      console.log('[SEED] All operations complete.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[SEED] Unhandled failure:', err);
      process.exit(1);
    });
}
