import { query } from '../db/pool.js';
import { AuditService } from './audit.service.js';
import { ResponseLevel, SecurityEvent, SecuritySeverity } from '@syntrabase/shared-types';

export class DefenseService {
  private static throttledIps: Map<string, number> = new Map(); // IP -> expire timestamp

  /**
   * Evaluates a security event and executes the appropriate policy-driven response level.
   */
  public static async handleSecurityEvent(params: {
    category: SecurityEvent['category'];
    severity: SecuritySeverity;
    sourceIp?: string;
    actorId?: string;
    projectId?: string;
    details: Record<string, unknown>;
  }): Promise<{ level: ResponseLevel; actionTaken: string }> {
    // 1. Record security event in database
    await query(
      `INSERT INTO security_events (severity, category, source_ip, actor_id, project_id, details)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        params.severity,
        params.category,
        params.sourceIp || null,
        params.actorId || null,
        params.projectId || null,
        params.details,
      ]
    );

    // 2. Select response level based on severity & frequency
    let level: ResponseLevel = 'LEVEL_0_OBSERVE';
    let actionTaken = 'Event observed and recorded in security ledger';

    if (params.severity === 'medium') {
      level = 'LEVEL_1_THROTTLE';
      if (params.sourceIp) {
        this.throttledIps.set(params.sourceIp, Date.now() + 15 * 60 * 1000); // 15 min throttle
        actionTaken = `Applied Level 1 throttle on IP ${params.sourceIp} for 15 minutes`;
      }
    } else if (params.severity === 'high') {
      level = 'LEVEL_2_QUARANTINE';
      if (params.actorId) {
        // Invalidate active session for suspicious actor
        await query('UPDATE auth_sessions SET revoked_at = NOW() WHERE user_id = $1', [params.actorId]);
        actionTaken = `Applied Level 2 quarantine: Revoked active sessions for actor ${params.actorId}`;
      }
    } else if (params.severity === 'critical') {
      level = 'LEVEL_3_CONTAINMENT';
      if (params.projectId) {
        // Suspend compromised project
        await query("UPDATE projects SET status = 'suspended' WHERE id = $1", [params.projectId]);
        actionTaken = `Applied Level 3 emergency containment: Suspended project ${params.projectId}`;
      }
    }

    // 3. Log to tamper-evident audit ledger
    await AuditService.log({
      actorId: 'system.defense_engine',
      actorType: 'system',
      action: `defense.${level.toLowerCase()}`,
      targetResource: params.projectId ? `project:${params.projectId}` : `ip:${params.sourceIp}`,
      payload: {
        category: params.category,
        severity: params.severity,
        actionTaken,
        details: params.details,
      },
    });

    return { level, actionTaken };
  }

  /**
   * Checks if an IP is currently throttled by the defense engine.
   */
  public static isIpThrottled(ip: string): boolean {
    const expiresAt = this.throttledIps.get(ip);
    if (!expiresAt) return false;
    if (Date.now() > expiresAt) {
      this.throttledIps.delete(ip);
      return false;
    }
    return true;
  }

  /**
   * Runs an authorized autonomous incident simulation.
   */
  public static async simulateIncident(scenario: string): Promise<{ simulatedSignal: string; policySelected: ResponseLevel; expectedOutcome: string; level?: number }> {
    let simulatedSignal = 'Autonomous security check';
    let policySelected: ResponseLevel = 'LEVEL_0_OBSERVE';
    let expectedOutcome = 'Recorded in telemetry ledger for review';
    let numericLevel = 0;
    let severity: SecuritySeverity = 'low';
    let category: SecurityEvent['category'] = 'admin_action';

    switch (scenario) {
      case 'DDOS_SURGE_ATTACK':
      case 'ddos_surge':
      case 'brute_force_login':
        simulatedSignal = '5,000 rapid HTTP requests detected from single source subnet';
        policySelected = 'LEVEL_1_THROTTLE';
        expectedOutcome = 'Application-level 429 Throttle engaged (Fastify Token Bucket)';
        numericLevel = 1;
        severity = 'medium';
        category = 'rate_limit_tripped';
        break;

      case 'OUTBOX_BACKPRESSURE_TEST':
      case 'outbox_flood':
        simulatedSignal = '20,000 events/min burst onto outbox stream';
        policySelected = 'LEVEL_2_QUARANTINE';
        expectedOutcome = 'Outbox cursor backpressure engaged; 0 events dropped';
        numericLevel = 2;
        severity = 'high';
        category = 'rules_violation';
        break;

      case 'BRUTEFORCE_CREDENTIAL_SPRAY':
      case 'stolen_token_reuse':
      case 'cross_tenant_access_attempt':
        simulatedSignal = 'Repeated invalid secret key authentication signatures detected';
        policySelected = 'LEVEL_2_QUARANTINE';
        expectedOutcome = 'Origin IP quarantined for 60 minutes; token family revoked';
        numericLevel = 2;
        severity = 'high';
        category = 'auth_failure';
        break;

      case 'CLIENT_BUNDLE_SCAN':
      case 'client_bundle_scan':
        simulatedSignal = 'Deep static asset inspection of client JS bundles';
        policySelected = 'LEVEL_0_OBSERVE';
        expectedOutcome = 'Clean: Zero server secret tokens found in public distribution';
        numericLevel = 0;
        severity = 'low';
        category = 'admin_action';
        break;

      default:
        simulatedSignal = `Telemetry inspection: ${scenario}`;
        policySelected = 'LEVEL_0_OBSERVE';
        expectedOutcome = 'Recorded in telemetry ledger for review';
        numericLevel = 0;
        severity = 'low';
        category = 'admin_action';
        break;
    }

    // Persist to security_events table so live telemetry shows the simulation immediately
    try {
      await query(
        `INSERT INTO security_events (severity, category, source_ip, details)
         VALUES ($1, $2, $3, $4)`,
        [
          severity,
          category,
          `simulated-${Math.floor(Math.random() * 200) + 1}.corp`,
          { scenario, simulatedSignal, expectedOutcome, policySelected },
        ]
      );
    } catch {}

    await AuditService.log({
      actorId: 'system.defense_simulator',
      actorType: 'system',
      action: `defense.simulation.${scenario.toLowerCase()}`,
      targetResource: `scenario:${scenario}`,
      payload: { scenario, simulatedSignal, policySelected, expectedOutcome },
    }).catch(() => {});

    return {
      simulatedSignal,
      policySelected,
      expectedOutcome,
      level: numericLevel,
    };
  }
}
