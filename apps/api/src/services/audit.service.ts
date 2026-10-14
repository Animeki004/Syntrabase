import fs from 'fs';
import path from 'path';
import { query } from '../db/pool.js';
import { CryptoUtil } from '../utils/crypto.js';
import { config } from '../config.js';
import { AuditEntry } from '@syntrabase/shared-types';

const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

export class AuditService {
  /**
   * Logs a tamper-evident audit record using cryptographic HMAC-SHA256 chaining.
   */
  public static async log(params: {
    actorId: string;
    actorType: 'developer' | 'app_user' | 'system' | 'api_key';
    action: string;
    targetResource: string;
    projectId?: string;
    ipAddress?: string;
    userAgent?: string;
    payload?: Record<string, unknown>;
  }): Promise<AuditEntry> {
    const timestamp = new Date().toISOString();
    const payload = params.payload || {};

    // 1. Fetch previous hash from the latest audit ledger record
    const lastRow = await query<{ current_hash: string }>(
      'SELECT current_hash FROM audit_ledger ORDER BY sequence_id DESC LIMIT 1'
    );
    const prevHash = lastRow.rows[0]?.current_hash || GENESIS_HASH;

    // 2. Compute current hash = HMAC-SHA256(prevHash || timestamp || actorId || action || payload)
    const payloadString = JSON.stringify(payload);
    const message = `${prevHash}|${timestamp}|${params.actorId}|${params.action}|${params.targetResource}|${payloadString}`;
    const currentHash = CryptoUtil.hmacSha256(message);

    const isUuid = params.projectId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.projectId);
    const resolvedProjectId = isUuid
      ? params.projectId
      : (params.projectId ? '00000000-0000-0000-0000-000000000020' : null);

    // 3. Persist to PostgreSQL audit_ledger
    const insertRes = await query<{ sequence_id: string }>(
      `INSERT INTO audit_ledger (
        prev_hash, current_hash, actor_id, actor_type, action,
        target_resource, project_id, ip_address, user_agent, payload, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING sequence_id`,
      [
        prevHash,
        currentHash,
        params.actorId,
        params.actorType,
        params.action,
        params.targetResource,
        resolvedProjectId,
        params.ipAddress || null,
        params.userAgent || null,
        payload,
        timestamp,
      ]
    );

    const sequenceId = insertRes.rows[0].sequence_id;

    const entry: AuditEntry = {
      sequenceId,
      prevHash,
      currentHash,
      timestamp,
      actorId: params.actorId,
      actorType: params.actorType,
      action: params.action,
      targetResource: params.targetResource,
      projectId: params.projectId,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      payload,
    };

    // 4. Stream to append-only log file on disk
    try {
      const logDir = path.dirname(config.security.auditLogFilePath);
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
      fs.appendFileSync(config.security.auditLogFilePath, JSON.stringify(entry) + '\n', 'utf8');
    } catch (err) {
      console.error('[AUDIT] Failed to append to disk log:', err);
    }

    return entry;
  }

  /**
   * Verifies the cryptographic continuity of the entire audit chain.
   */
  public static async verifyChainIntegrity(): Promise<{ valid: boolean; totalChecked: number; brokenSequenceId?: string }> {
    const rows = await query<AuditEntry>(
      'SELECT sequence_id, prev_hash, current_hash, actor_id, action, target_resource, payload, created_at as timestamp FROM audit_ledger ORDER BY sequence_id ASC'
    );

    let expectedPrevHash = GENESIS_HASH;
    let totalChecked = 0;

    for (const row of rows.rows) {
      if (row.prevHash !== expectedPrevHash) {
        return { valid: false, totalChecked, brokenSequenceId: row.sequenceId };
      }

      const payloadString = JSON.stringify(row.payload || {});
      const message = `${row.prevHash}|${new Date(row.timestamp).toISOString()}|${row.actorId}|${row.action}|${row.targetResource}|${payloadString}`;
      const recomputedHash = CryptoUtil.hmacSha256(message);

      if (recomputedHash !== row.currentHash) {
        return { valid: false, totalChecked, brokenSequenceId: row.sequenceId };
      }

      expectedPrevHash = row.currentHash;
      totalChecked++;
    }

    return { valid: true, totalChecked };
  }
}
