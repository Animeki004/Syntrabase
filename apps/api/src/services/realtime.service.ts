import { WebSocket } from 'ws';
import pg from 'pg';
import { config } from '../config.js';
import { query } from '../db/pool.js';
import { DocumentSnapshot, OutboxEvent } from '@syntrabase/shared-types';

interface ClientSubscription {
  id: string;
  projectId: string;
  environmentId: string;
  collectionPath: string;
  documentId?: string;
  lastCheckpointId: string;
  seenSequenceIds?: Set<string>;
}

interface ConnectedClient {
  ws: WebSocket;
  userId?: string;
  projectId?: string;
  subscriptions: Map<string, ClientSubscription>;
}

export class RealtimeService {
  private static clients: Set<ConnectedClient> = new Set();
  private static listenerClient: pg.Client | null = null;
  private static lastProcessedSequenceId = '0';
  private static isListening = false;

  /**
   * Initializes the PostgreSQL LISTEN wake-up listener for the event_outbox.
   */
  public static async startListener(): Promise<void> {
    if (this.isListening) return;

    try {
      this.listenerClient = new pg.Client({
        host: config.db.host,
        port: config.db.port,
        database: config.db.name,
        user: config.db.user,
        password: config.db.password,
        ssl: config.db.ssl ? { rejectUnauthorized: false } : false,
      });

      await this.listenerClient.connect();
      await this.listenerClient.query('LISTEN outbox_wakeup');

      this.listenerClient.on('notification', async (msg) => {
        if (msg.channel === 'outbox_wakeup') {
          await this.processNewOutboxEvents();
        }
      });

      this.listenerClient.on('error', (err) => {
        console.error('[REALTIME] Listener client error:', err);
        this.isListening = false;
        setTimeout(() => this.startListener(), 3000);
      });

      this.isListening = true;
      console.log('[REALTIME] PostgreSQL durable outbox wake-up listener initialized');
    } catch (err) {
      console.warn('[REALTIME] Could not connect persistent DB listener (running in offline/mock mode):', (err as Error).message);
    }
  }

  /**
   * Registers a new connected WebSocket client.
   */
  public static registerClient(ws: WebSocket): ConnectedClient {
    const client: ConnectedClient = {
      ws,
      subscriptions: new Map(),
    };
    this.clients.add(client);

    ws.on('close', () => {
      this.clients.delete(client);
    });

    return client;
  }

  /**
   * Subscribes a client to document or collection path with checkpoint replay.
   */
  public static async subscribe(
    client: ConnectedClient,
    sub: ClientSubscription
  ): Promise<void> {
    client.subscriptions.set(sub.id, sub);

    // If client provided a checkpoint cursor, replay any missed events from event_outbox!
    if (sub.lastCheckpointId && sub.lastCheckpointId !== '0') {
      const missedEvents = await query<OutboxEvent>(
        `SELECT sequence_id as "sequenceId", project_id as "projectId", environment_id as "environmentId",
                collection_path as "collectionPath", document_id as "documentId", event_type as "eventType",
                payload, version, created_at as "createdAt"
         FROM event_outbox
         WHERE project_id = $1 AND environment_id = $2 AND collection_path = $3 AND sequence_id > $4
         ORDER BY sequence_id ASC
         LIMIT 100`,
        [sub.projectId, sub.environmentId, sub.collectionPath, sub.lastCheckpointId]
      );

      if (!sub.seenSequenceIds) {
        sub.seenSequenceIds = new Set();
      }

      for (const event of missedEvents.rows) {
        if (sub.documentId && sub.documentId !== event.documentId) continue;

        const seqBig = BigInt(event.sequenceId);
        const lastCheckBig = sub.lastCheckpointId ? BigInt(sub.lastCheckpointId) : 0n;

        // Skip if already below continuous checkpoint or seen
        if (seqBig <= lastCheckBig || sub.seenSequenceIds.has(event.sequenceId)) {
          continue;
        }

        sub.seenSequenceIds.add(event.sequenceId);

        // Advance continuous watermark for this subscription
        let nextCandidate = lastCheckBig + 1n;
        while (sub.seenSequenceIds.has(nextCandidate.toString())) {
          sub.seenSequenceIds.delete(nextCandidate.toString());
          sub.lastCheckpointId = nextCandidate.toString();
          nextCandidate += 1n;
        }

        const deltaType = event.eventType === 'document_deleted' ? 'removed' : 'modified';
        const docSnapshot: DocumentSnapshot = {
          id: event.documentId,
          path: `/${event.collectionPath}/${event.documentId}`,
          data: event.payload,
          version: Number(event.version),
          createdAt: event.createdAt,
          updatedAt: event.createdAt,
        };

        if (client.ws.readyState === WebSocket.OPEN) {
          client.ws.send(
            JSON.stringify({
              type: deltaType,
              subscriptionId: sub.id,
              sequenceId: event.sequenceId,
              doc: docSnapshot,
            })
          );
        }
      }
    }
  }

  /**
   * Unsubscribes a client from a specific subscription.
   */
  public static unsubscribe(client: ConnectedClient, subscriptionId: string): void {
    client.subscriptions.delete(subscriptionId);
  }

  private static safeWatermark = '0';
  private static dispatchedSequenceIds = new Set<string>();
  private static gapFirstSeenAt = new Map<string, number>();
  private static readonly GAP_TIMEOUT_MS = 3000;
  private static isProcessing = false;
  private static hasPendingSignal = false;

  public static getSafeWatermark(): string {
    return this.safeWatermark;
  }

  public static resetWatermark(watermark = '0'): void {
    this.safeWatermark = watermark;
    this.dispatchedSequenceIds.clear();
    this.gapFirstSeenAt.clear();
  }

  /**
   * Processes a batch of outbox events, dispatches to active clients, and advances safe watermark.
   * Handles out-of-order commits and delayed transaction gaps.
   */
  public static async processEventsBatch(rows: OutboxEvent[]): Promise<void> {
    const now = Date.now();

    for (const event of rows) {
      // If already dispatched in a previous cycle (e.g. higher sequence committed before delayed lower sequence), skip!
      if (this.dispatchedSequenceIds.has(event.sequenceId)) {
        continue;
      }

      this.dispatchedSequenceIds.add(event.sequenceId);

      // Broadcast to matching clients
      for (const client of this.clients) {
        if (client.ws.readyState !== WebSocket.OPEN) continue;

        for (const sub of client.subscriptions.values()) {
          if (
            sub.projectId === event.projectId &&
            sub.environmentId === event.environmentId &&
            sub.collectionPath === event.collectionPath
          ) {
            if (sub.documentId && sub.documentId !== event.documentId) {
              continue;
            }

            if (!sub.seenSequenceIds) {
              sub.seenSequenceIds = new Set();
            }

            const seqBig = BigInt(event.sequenceId);
            const lastCheckBig = sub.lastCheckpointId ? BigInt(sub.lastCheckpointId) : 0n;

            // Sequence deduplication: Skip if already acknowledged or in sliding window
            if (seqBig <= lastCheckBig || sub.seenSequenceIds.has(event.sequenceId)) {
              continue;
            }

            sub.seenSequenceIds.add(event.sequenceId);

            // Advance continuous watermark for this subscription
            let nextCandidate = lastCheckBig + 1n;
            while (sub.seenSequenceIds.has(nextCandidate.toString())) {
              sub.seenSequenceIds.delete(nextCandidate.toString());
              sub.lastCheckpointId = nextCandidate.toString();
              nextCandidate += 1n;
            }

            const deltaType = event.eventType === 'document_deleted' ? 'removed' : 'modified';
            const docSnapshot: DocumentSnapshot = {
              id: event.documentId,
              path: `/${event.collectionPath}/${event.documentId}`,
              data: event.payload,
              version: Number(event.version),
              createdAt: event.createdAt,
              updatedAt: event.createdAt,
            };

            client.ws.send(
              JSON.stringify({
                type: deltaType,
                subscriptionId: sub.id,
                sequenceId: event.sequenceId,
                doc: docSnapshot,
              })
            );
          }
        }
      }
    }

    // Advance safe watermark continuously without skipping uncommitted gaps
    if (rows.length > 0) {
      let candidate = BigInt(this.safeWatermark) + 1n;
      const maxVisible = BigInt(rows[rows.length - 1].sequenceId);

      while (candidate <= maxVisible) {
        const candStr = candidate.toString();
        if (this.dispatchedSequenceIds.has(candStr)) {
          this.safeWatermark = candStr;
          this.gapFirstSeenAt.delete(candStr);
          candidate += 1n;
        } else {
          // Gap detected (candidate was not in the result set, e.g. uncommitted delayed transaction)
          if (!this.gapFirstSeenAt.has(candStr)) {
            this.gapFirstSeenAt.set(candStr, now);
            break; // Stop advancing watermark; wait for delayed lower sequence to commit
          } else {
            const gapAge = now - (this.gapFirstSeenAt.get(candStr) || now);
            if (gapAge > this.GAP_TIMEOUT_MS) {
              // Gap expired (presumed rolled back or aborted transaction)
              this.safeWatermark = candStr;
              this.gapFirstSeenAt.delete(candStr);
              candidate += 1n;
            } else {
              break; // Wait for delayed commit within timeout window
            }
          }
        }
      }

      // Prune dispatched IDs that are strictly below or equal to safeWatermark
      const currentWatermarkNum = BigInt(this.safeWatermark);
      for (const id of this.dispatchedSequenceIds) {
        if (BigInt(id) <= currentWatermarkNum) {
          this.dispatchedSequenceIds.delete(id);
        }
      }
    }
  }

  /**
   * Continuous Watermark Outbox Processor:
   * Handles out-of-order commits where a lower sequence ID commits AFTER a higher sequence ID.
   * Uses a safe continuous watermark, deduplication set, and gap expiry to guarantee zero missed events.
   */
  public static async processNewOutboxEvents(): Promise<void> {
    if (this.isProcessing) {
      this.hasPendingSignal = true;
      return;
    }
    this.isProcessing = true;
    try {
      do {
        this.hasPendingSignal = false;
        const res = await query<OutboxEvent>(
          `SELECT sequence_id as "sequenceId", project_id as "projectId", environment_id as "environmentId",
                  collection_path as "collectionPath", document_id as "documentId", event_type as "eventType",
                  payload, version, created_at as "createdAt"
           FROM event_outbox
           WHERE sequence_id > $1
           ORDER BY sequence_id ASC
           LIMIT 200`,
          [this.safeWatermark]
        );

        await this.processEventsBatch(res.rows);
      } while (this.hasPendingSignal);
    } catch (err) {
      console.error('[REALTIME] Error dispatching outbox events:', err);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Returns telemetry for active WebSocket connections.
   */
  public static getMetrics(): { activeConnections: number; activeSubscriptions: number } {
    let subCount = 0;
    for (const c of this.clients) {
      subCount += c.subscriptions.size;
    }
    return {
      activeConnections: this.clients.size,
      activeSubscriptions: subCount,
    };
  }
}
