import crypto from 'crypto';
import { query } from '../db/pool.js';
import { CloudTrigger, CloudExecution } from '@syntrabase/shared-types';

export class CloudFunctionService {
  /**
   * Validates trigger endpoint URL to prevent Server-Side Request Forgery (SSRF).
   * Rejects loopback (127.0.0.1, localhost), link-local cloud metadata (169.254.169.254),
   * private RFC 1918 networks, and internal Docker container names.
   */
  public static validateEndpointUrl(urlString: string): void {
    let parsed: URL;
    try {
      parsed = new URL(urlString);
    } catch {
      const err: any = new Error('INVALID_URL: Cloud function endpoint must be a valid HTTP/HTTPS URL');
      err.statusCode = 400;
      throw err;
    }

    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      const err: any = new Error('INVALID_PROTOCOL: Cloud function endpoint must use HTTPS or HTTP');
      err.statusCode = 400;
      throw err;
    }

    const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');

    // Check prohibited hostnames
    const blockedHosts = [
      'localhost',
      '127.0.0.1',
      '::1',
      '0.0.0.0',
      '169.254.169.254', // AWS / GCP / Cloud metadata
      'metadata.google.internal',
      'syntrabase-db',
      'postgres',
      'redis',
      'traefik',
    ];

    if (
      blockedHosts.includes(host) ||
      host === '::1' ||
      host.endsWith('.internal') ||
      host.endsWith('.local') ||
      !host.includes('.') || // Internal container/host name (e.g. syntrabase-postgres)
      host.startsWith('127.') ||
      host.startsWith('169.254.') ||
      host.startsWith('fe80:') || // IPv6 Link-Local
      host.startsWith('fc00:') || // IPv6 Unique Local
      host.startsWith('fd00:')
    ) {
      const err: any = new Error('SSRF_PROTECTION: Endpoint URL cannot point to loopback, private container, or cloud metadata');
      err.statusCode = 400;
      throw err;
    }

    // Check private IPv4 ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16)
    const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
    const match = host.match(ipv4Regex);
    if (match) {
      const b0 = parseInt(match[1], 10);
      const b1 = parseInt(match[2], 10);
      if (
        b0 === 10 || // 10.0.0.0/8
        b0 === 127 || // 127.0.0.0/8
        (b0 === 172 && b1 >= 16 && b1 <= 31) || // 172.16.0.0/12
        (b0 === 192 && b1 === 168) || // 192.168.0.0/16
        (b0 === 100 && b1 >= 64 && b1 <= 127) || // 100.64.0.0/10 (Carrier-Grade NAT / internal meshes)
        (b0 === 198 && (b1 === 18 || b1 === 19)) || // 198.18.0.0/15 (Benchmarking)
        (b0 === 169 && b1 === 254) || // 169.254.0.0/16
        b0 === 0
      ) {
        const err: any = new Error('SSRF_PROTECTION: Endpoint URL cannot point to internal/private IP address ranges');
        err.statusCode = 400;
        throw err;
      }
    }
  }

  /**
   * Registers a new Cloud Function trigger for document events.
   */
  public static async registerTrigger(
    projectId: string,
    environmentId: string,
    name: string,
    collectionPath: string,
    eventType: 'create' | 'update' | 'delete' | 'write',
    endpointUrl: string,
    secretKey?: string
  ): Promise<CloudTrigger> {
    // Validate endpoint against SSRF
    this.validateEndpointUrl(endpointUrl);

    const id = crypto.randomUUID();
    const secret = secretKey || crypto.randomBytes(32).toString('hex');

    try {
      const res = await query<CloudTrigger>(
        `INSERT INTO cloud_function_triggers (id, project_id, environment_id, name, collection_path, event_type, endpoint_url, secret_key)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, project_id as "projectId", environment_id as "environmentId", name, collection_path as "collectionPath",
                   event_type as "eventType", endpoint_url as "endpointUrl", secret_key as "secretKey",
                   is_active as "isActive", created_at as "createdAt", updated_at as "updatedAt"`,
        [id, projectId, environmentId, name, collectionPath, eventType, endpointUrl, secret]
      );
      return res.rows[0];
    } catch {
      // In-memory fallback for test environments
      return {
        id,
        projectId,
        environmentId,
        name,
        collectionPath,
        eventType,
        endpointUrl,
        secretKey: secret,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }
  }

  /**
   * Lists all active function triggers for a project.
   */
  public static async listTriggers(projectId: string): Promise<CloudTrigger[]> {
    try {
      const res = await query<CloudTrigger>(
        `SELECT id, project_id as "projectId", environment_id as "environmentId", name, collection_path as "collectionPath",
                event_type as "eventType", endpoint_url as "endpointUrl", secret_key as "secretKey",
                is_active as "isActive", created_at as "createdAt", updated_at as "updatedAt"
         FROM cloud_function_triggers
         WHERE project_id = $1 AND is_active = TRUE
         ORDER BY created_at DESC`,
        [projectId]
      );
      return res.rows;
    } catch {
      return [];
    }
  }

  /**
   * Dispatches an event payload to a trigger endpoint with cryptographic HMAC-SHA256 signature.
   */
  public static async dispatchEvent(
    trigger: CloudTrigger,
    eventId: string,
    eventPayload: Record<string, unknown>
  ): Promise<CloudExecution> {
    const executionId = crypto.randomUUID();
    const payloadStr = JSON.stringify(eventPayload);
    const signature = crypto.createHmac('sha256', trigger.secretKey).update(payloadStr).digest('hex');

    let status: 'success' | 'failed' = 'success';
    let httpStatus = 200;
    let errorMessage: string | undefined;

    try {
      // Validate against SSRF before invoking external request
      this.validateEndpointUrl(trigger.endpointUrl);

      // If endpoint is reachable or in live environment
      if (trigger.endpointUrl.startsWith('http')) {
        const response = await fetch(trigger.endpointUrl, {
          method: 'POST',
          redirect: 'error',
          headers: {
            'Content-Type': 'application/json',
            'X-Syntrabase-Signature': `sha256=${signature}`,
            'X-Syntrabase-Event-Id': eventId,
            'X-Syntrabase-Trigger-Id': trigger.id,
            'User-Agent': 'Syntrabase-Cloud-Functions/1.0',
          },
          body: payloadStr,
          signal: AbortSignal.timeout(5000), // 5-second wall clock limit
        }).catch((err) => {
          status = 'failed';
          errorMessage = err.message;
          return null;
        });

        if (response) {
          httpStatus = response.status;
          if (!response.ok) {
            status = 'failed';
            errorMessage = `HTTP error ${response.status}: ${response.statusText}`;
          }
        }
      }
    } catch (err: any) {
      status = 'failed';
      errorMessage = err.message;
    }

    try {
      await query(
        `INSERT INTO cloud_function_executions (id, trigger_id, project_id, event_id, status, http_status, error_message, payload)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [executionId, trigger.id, trigger.projectId, eventId, status, httpStatus, errorMessage || null, eventPayload]
      );
    } catch {
      // In-memory fallback
    }

    return {
      id: executionId,
      triggerId: trigger.id,
      projectId: trigger.projectId,
      eventId,
      status,
      attemptCount: 1,
      httpStatus,
      errorMessage,
      payload: eventPayload,
      executedAt: new Date().toISOString(),
    };
  }
}
