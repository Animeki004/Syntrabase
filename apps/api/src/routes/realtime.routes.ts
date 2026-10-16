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
          if (msg.token) {
            try {
              const tokenPayload = AuthService.verifyAccessToken(msg.token);
              client.userId = tokenPayload.uid;
              client.projectId = tokenPayload.projectId;
              client.tokenPayload = tokenPayload;
              ws.send(JSON.stringify({ type: 'auth_success', userId: client.userId }));
            } catch (err) {
              ws.send(JSON.stringify({ type: 'auth_error', message: (err as Error).message }));
            }
          } else if (msg.apiKey) {
            try {
              const { CredentialService } = await import('../services/credential.service.js');
              const validSecret = await CredentialService.validateCredential(msg.apiKey);
              if (!validSecret.valid || !validSecret.credential) {
                throw new Error(validSecret.error || 'Invalid API key');
              }
              client.projectId = validSecret.credential.projectId;
              client.apiKey = msg.apiKey;
              ws.send(JSON.stringify({ type: 'auth_success', projectId: client.projectId }));
            } catch (err) {
              ws.send(JSON.stringify({ type: 'auth_error', message: (err as Error).message }));
            }
          }
        } else if (msg.type === 'listen') {
          const { subscriptionId, projectId, environmentId, collectionPath, documentId, lastCheckpointId } = msg;

          let targetProjectId = projectId || client.projectId || '';
          if (targetProjectId) {
            const { ProjectService } = await import('../services/project.service.js');
            targetProjectId = await ProjectService.resolveProjectId(targetProjectId).catch(() => targetProjectId);
          }

          if (!client.projectId && !client.apiKey) {
            ws.send(JSON.stringify({
              type: 'error',
              subscriptionId,
              message: 'UNAUTHORIZED: Authentication required before subscribing to realtime feeds',
            }));
            return;
          }

          // Authoritative cross-project subscription check
          if (client.tokenPayload?.isPlatformAdmin) {
            // Super Admin permitted
          } else if (client.projectId === 'platform') {
            // Console developer: verify ownership
            try {
              const { ProjectService } = await import('../services/project.service.js');
              await ProjectService.assertProjectAccess(client.userId!, targetProjectId);
            } catch {
              ws.send(JSON.stringify({
                type: 'error',
                subscriptionId,
                message: 'FORBIDDEN: Cross-project developer subscription denied',
              }));
              return;
            }
          } else if (client.projectId !== targetProjectId) {
            ws.send(JSON.stringify({
              type: 'error',
              subscriptionId,
              message: 'FORBIDDEN: Cross-project subscription denied — client token belongs to another project',
            }));
            return;
          }

          // Evaluate security rules for subscription
          const canSubscribe = await RealtimeService.canClientSubscribe(
            client,
            targetProjectId,
            collectionPath,
            documentId
          );
          if (!canSubscribe) {
            ws.send(JSON.stringify({
              type: 'error',
              subscriptionId,
              message: 'PERMISSION_DENIED: Subscription denied by security rules',
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
