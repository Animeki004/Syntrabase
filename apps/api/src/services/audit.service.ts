import fs from 'fs';
import path from 'path';
import { query } from '../db/pool.js';
import { CryptoUtil } from '../utils/crypto.js';
import { config } from '../config.js';
import { AuditEntry } from '@syntrabase/shared-types';

const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

export class AuditService {
  /**
   * Generates a deterministic canonical JSON string with recursively sorted keys.
   */
  public static canonicalStringify(obj: any): string {
    if (obj === null || obj === undefined) return '{}';
    if (typeof obj !== 'object') return JSON.stringify(obj);
    if (Array.isArray(obj)) {
      return '[' + obj.map((item) => this.canonicalStringify(item)).join(',') + ']';
    }
    const keys = Object.keys(obj).sort();
    return '{' + keys.map((k) => `${JSON.stringify(k)}:${this.canonicalStringify(obj[k])}`).join(',') + '}';
  }

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
    const payloadString = this.canonicalStringify(payload);
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

    // 4. Stream to append-only log file on disk (with graceful fallback if volume is root-owned)
    try {
      const primaryPath = config.security.auditLogFilePath;
      const logDir = path.dirname(primaryPath);
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
      fs.appendFileSync(primaryPath, JSON.stringify(entry) + '\n', 'utf8');
    } catch (err: any) {
      try {
        const fallbackPath = '/tmp/tamper_evident.log';
        fs.appendFileSync(fallbackPath, JSON.stringify(entry) + '\n', 'utf8');
      } catch {
        // Fallback write failed; audit ledger in PostgreSQL is already safely committed
      }
    }

    return entry;
  }

  /**
   * Verifies the cryptographic continuity of the entire audit chain.
   */
  public static async verifyChainIntegrity(): Promise<{ valid: boolean; totalChecked: number; brokenSequenceId?: string }> {
    const rows = await query<any>(
      `SELECT sequence_id as "sequenceId", prev_hash as "prevHash", current_hash as "currentHash",
              actor_id as "actorId", action, target_resource as "targetResource", payload,
              created_at as "timestamp"
       FROM audit_ledger
       ORDER BY sequence_id ASC`
    );

    let expectedPrevHash = GENESIS_HASH;
    let totalChecked = 0;

    for (const row of rows.rows) {
      const prevHash = row.prevHash || row.prev_hash;
      const currentHash = row.currentHash || row.current_hash;
      const sequenceId = row.sequenceId || row.sequence_id;
      const actorId = row.actorId || row.actor_id;
      const action = row.action;
      const targetResource = row.targetResource || row.target_resource;
      const timestamp = row.timestamp || row.created_at;

      // 1. Verify chain continuity
      if (prevHash !== expectedPrevHash) {
        return { valid: false, totalChecked, brokenSequenceId: String(sequenceId) };
      }

      // 2. Verify cryptographic HMAC signature
      const isoTime = new Date(timestamp).toISOString();
      const payloadCanonical = this.canonicalStringify(row.payload || {});
      const message1 = `${prevHash}|${isoTime}|${actorId}|${action}|${targetResource}|${payloadCanonical}`;
      let isValidHash = CryptoUtil.hmacSha256(message1) === currentHash;

      if (!isValidHash) {
        const payloadLegacy = JSON.stringify(row.payload || {});
        const message2 = `${prevHash}|${isoTime}|${actorId}|${action}|${targetResource}|${payloadLegacy}`;
        isValidHash = CryptoUtil.hmacSha256(message2) === currentHash;
      }

      if (!isValidHash) {
        const rawTimeStr = typeof timestamp === 'string' ? timestamp : String(timestamp);
        const message3 = `${prevHash}|${rawTimeStr}|${actorId}|${action}|${targetResource}|${payloadCanonical}`;
        isValidHash = CryptoUtil.hmacSha256(message3) === currentHash;
      }

      if (!isValidHash) {
        return { valid: false, totalChecked, brokenSequenceId: String(sequenceId) };
      }

      expectedPrevHash = currentHash;
      totalChecked++;
    }

    return { valid: true, totalChecked };
  }
}
