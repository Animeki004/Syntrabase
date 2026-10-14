import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { WebSocket } from 'ws';
import { RealtimeService } from '../services/realtime.service.js';
import { AuthService } from '../services/auth.service.js';

export const realtimeRoutes: FastifyPluginAsync = async (server: FastifyInstance) => {
  server.get('/ws/realtime', { websocket: true }, (connection: any) => {
    const ws: WebSocket = connection.socket || connection;
    const client = RealtimeService.registerClient(ws);

    ws.on('message', async (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString('utf8'));

        if (msg.type === 'auth') {
          try {
            const tokenPayload = AuthService.verifyAccessToken(msg.token);
            client.userId = tokenPayload.uid;
            client.projectId = tokenPayload.projectId;
            ws.send(JSON.stringify({ type: 'auth_success', userId: client.userId }));
          } catch (err) {
            ws.send(JSON.stringify({ type: 'auth_error', message: (err as Error).message }));
          }
        } else if (msg.type === 'listen') {
          const { subscriptionId, projectId, environmentId, collectionPath, documentId, lastCheckpointId } = msg;

          const targetProjectId = projectId || client.projectId || '';
          if (client.projectId && targetProjectId && client.projectId !== targetProjectId) {
            ws.send(JSON.stringify({
              type: 'error',
              subscriptionId,
              message: 'FORBIDDEN: Cross-project subscription denied — client token belongs to another project',
            }));
            return;
          }

          await RealtimeService.subscribe(client, {
            id: subscriptionId,
            projectId: targetProjectId,
            environmentId: environmentId || 'default',
            collectionPath,
            documentId,
            lastCheckpointId: lastCheckpointId || '0',
          });

          ws.send(JSON.stringify({ type: 'subscribed', subscriptionId }));
        } else if (msg.type === 'unlisten') {
          RealtimeService.unsubscribe(client, msg.subscriptionId);
          ws.send(JSON.stringify({ type: 'unsubscribed', subscriptionId: msg.subscriptionId }));
        }
      } catch (err) {
        ws.send(JSON.stringify({ type: 'error', message: (err as Error).message }));
      }
    });
  });
};
