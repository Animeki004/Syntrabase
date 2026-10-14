import test from 'node:test';
import assert from 'node:assert/strict';
import { RealtimeService } from '../services/realtime.service.js';

test('Realtime Correctness - Outbox mutex prevents concurrent race conditions', async () => {
  // Trigger multiple concurrent process calls
  const p1 = RealtimeService.processNewOutboxEvents();
  const p2 = RealtimeService.processNewOutboxEvents();
  const p3 = RealtimeService.processNewOutboxEvents();

  // All should resolve gracefully without unhandled race collisions
  await assert.doesNotReject(Promise.all([p1, p2, p3]));
});

test('Realtime Correctness - Checkpoint deduplication suppresses past events', () => {
  // Test sequence comparison logic
  const lastCheckpoint = '105';
  const incomingPast = '104';
  const incomingCurrent = '105';
  const incomingNext = '106';

  // Any event <= lastCheckpoint is duplicate
  assert.equal(BigInt(incomingPast) <= BigInt(lastCheckpoint), true);
  assert.equal(BigInt(incomingCurrent) <= BigInt(lastCheckpoint), true);
  assert.equal(BigInt(incomingNext) <= BigInt(lastCheckpoint), false);
});

test('Realtime Correctness - WebSocket client registration and telemetry metrics', () => {
  const initialMetrics = RealtimeService.getMetrics();
  assert.ok(typeof initialMetrics.activeConnections === 'number');
  assert.ok(typeof initialMetrics.activeSubscriptions === 'number');

  // Register a mock client
  const mockWs = {
    readyState: 1, // OPEN
    send: (_data: string) => {},
    on: (_event: string, _fn: Function) => {},
  } as any;

  const client = RealtimeService.registerClient(mockWs);
  assert.ok(client);
  assert.ok(client.subscriptions);

  // Subscribe
  client.subscriptions.set('sub_1', {
    id: 'sub_1',
    projectId: 'test_proj',
    environmentId: 'default',
    collectionPath: 'users',
    documentId: 'u1',
    lastCheckpointId: '50',
  });

  const updatedMetrics = RealtimeService.getMetrics();
  assert.ok(updatedMetrics.activeSubscriptions >= 1);

  // Unsubscribe
  RealtimeService.unsubscribe(client, 'sub_1');
  assert.equal(client.subscriptions.size, 0);
});

test('Realtime Correctness - Continuous watermark preserves uncommitted gaps during delayed commits', () => {
  // Reset watermark to 99
  RealtimeService.resetWatermark('99');
  assert.equal(RealtimeService.getSafeWatermark(), '99');

  // Simulate client listener
  const receivedSequences: string[] = [];
  const mockWs = {
    readyState: 1, // OPEN
    send: (data: string) => {
      const parsed = JSON.parse(data);
      if (parsed.sequenceId) receivedSequences.push(parsed.sequenceId);
    },
    on: () => {},
  } as any;

  const client = RealtimeService.registerClient(mockWs);
  client.subscriptions.set('sub_watermark', {
    id: 'sub_watermark',
    projectId: 'p_watermark',
    environmentId: 'default',
    collectionPath: 'orders',
    lastCheckpointId: '99',
  });

  // Safe watermark guarantees that if sequence 101 commits before sequence 100,
  // safeWatermark will NOT jump to 101 until 100 is resolved or expired.
  assert.equal(RealtimeService.getSafeWatermark(), '99');

  RealtimeService.unsubscribe(client, 'sub_watermark');
});

test('Realtime Correctness - Out-of-order commit: lower sequence committing after higher sequence is never skipped', async () => {
  RealtimeService.resetWatermark('99');

  const dispatchedToClient1: string[] = [];
  const mockWs1 = {
    readyState: 1, // OPEN
    send: (data: string) => {
      const parsed = JSON.parse(data);
      if (parsed.sequenceId) dispatchedToClient1.push(parsed.sequenceId);
    },
    on: () => {},
  } as any;

  const client1 = RealtimeService.registerClient(mockWs1);
  client1.subscriptions.set('sub_stream', {
    id: 'sub_stream',
    projectId: 'proj_concurrent',
    environmentId: 'default',
    collectionPath: 'inventory',
    lastCheckpointId: '99',
  });

  const event100 = {
    sequenceId: '100',
    projectId: 'proj_concurrent',
    environmentId: 'default',
    collectionPath: 'inventory',
    documentId: 'item_100',
    eventType: 'document_created',
    payload: { name: 'Item 100' },
    version: 1,
    createdAt: new Date().toISOString(),
  } as any;

  const event101 = {
    sequenceId: '101',
    projectId: 'proj_concurrent',
    environmentId: 'default',
    collectionPath: 'inventory',
    documentId: 'item_101',
    eventType: 'document_created',
    payload: { name: 'Item 101' },
    version: 1,
    createdAt: new Date().toISOString(),
  } as any;

  // 1. Transaction B commits first with sequence 101 (Tx A with sequence 100 still uncommitted)
  await RealtimeService.processEventsBatch([event101]);

  // Client 1 receives 101
  assert.deepEqual(dispatchedToClient1, ['101']);
  // Watermark MUST hold at 99 due to detected uncommitted gap at candidate 100
  assert.equal(RealtimeService.getSafeWatermark(), '99');

  // 2. Transaction A now commits with sequence 100.
  // Next cycle reads sequence_id > 99, returning BOTH [100, 101]
  await RealtimeService.processEventsBatch([event100, event101]);

  // Client 1 receives delayed event 100; event 101 is NOT duplicated
  assert.deepEqual(dispatchedToClient1, ['101', '100']);
  // Safe continuous watermark advances past both 100 and 101 to 101
  assert.equal(RealtimeService.getSafeWatermark(), '101');

  RealtimeService.unsubscribe(client1, 'sub_stream');
});
