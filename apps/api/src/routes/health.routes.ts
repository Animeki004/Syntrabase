import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { checkDatabaseHealth } from '../db/pool.js';

export const healthRoutes: FastifyPluginAsync = async (server: FastifyInstance) => {
  server.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  server.get('/ready', async (req, reply) => {
    const dbHealth = await checkDatabaseHealth();
    if (!dbHealth.connected) {
      return reply.status(503).send({
        status: 'not_ready',
        database: 'disconnected',
        timestamp: new Date().toISOString(),
      });
    }
    return reply.send({
      status: 'ready',
      database: 'connected',
      latencyMs: dbHealth.latencyMs,
      timestamp: new Date().toISOString(),
    });
  });
};
