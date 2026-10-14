import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import { config, validateConfig } from './config.js';
import { pool } from './db/pool.js';
import { RealtimeService } from './services/realtime.service.js';
import { healthRoutes } from './routes/health.routes.js';
import { authRoutes } from './routes/auth.routes.js';
import { documentRoutes } from './routes/document.routes.js';
import { realtimeRoutes } from './routes/realtime.routes.js';
import { rulesRoutes } from './routes/rules.routes.js';
import { storageRoutes } from './routes/storage.routes.js';
import { adminRoutes } from './routes/admin.routes.js';
import { functionRoutes } from './routes/function.routes.js';
import { projectRoutes } from './routes/project.routes.js';
import { ProjectService } from './services/project.service.js';
import { AuthService } from './services/auth.service.js';
import { runMigrations } from './db/migrate.js';

export async function buildServer() {
  validateConfig();

  const server = Fastify({
    logger: {
      level: config.env === 'development' ? 'info' : 'warn',
    },
    bodyLimit: 10 * 1024 * 1024, // 10 MB payload limit
  });

  // Support empty JSON bodies gracefully without throwing FST_ERR_CTP_EMPTY_JSON_BODY
  server.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    try {
      const trimmed = (typeof body === 'string' ? body.trim() : '');
      const json = trimmed.length > 0 ? JSON.parse(trimmed) : {};
      done(null, json);
    } catch (err: any) {
      err.statusCode = 400;
      done(err, undefined);
    }
  });

  // 1. Edge & App Security Plugins
  await server.register(helmet, {
    contentSecurityPolicy: false, // Managed by reverse proxy at edge
    crossOriginEmbedderPolicy: false,
  });

  await server.register(cors, {
    origin: (origin, cb) => {
      // Allow non-browser requests (e.g. mobile app, curl, server-to-server, SDK CLI)
      if (!origin) return cb(null, true);

      // In development/test, allow localhost and 127.0.0.1
      if (config.env !== 'production' && config.env !== 'staging') {
        if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
          return cb(null, true);
        }
      }

      try {
        const parsed = new URL(origin);
        const host = parsed.hostname;
        const platformDomain = config.platformDomain;

        if (host === platformDomain || host.endsWith('.' + platformDomain)) {
          return cb(null, true);
        }
      } catch {
        // Fall through
      }

      cb(new Error(`CORS policy violation: Origin '${origin}' is not permitted.`), false);
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  });

  // 2. Application-Level Token-Bucket Rate Limiter
  await server.register(rateLimit, {
    max: 10000,
    timeWindow: config.rateLimit.globalWindowMs,
    allowList: ['127.0.0.1', '::1'],
    errorResponseBuilder: (req, context) => ({
      statusCode: 429,
      error: 'Too Many Requests',
      message: `Rate limit exceeded. Try again in ${context.after}`,
    }),
  });

  // 3. WebSocket Realtime Transport
  await server.register(websocket);

  // 3.5 Parameter Sanitization: Automatically resolve project slugs and 'default' environments to canonical UUIDs
  server.addHook('preHandler', async (req) => {
    if (req.params && typeof (req.params as any).projectId === 'string') {
      (req.params as any).projectId = await ProjectService.resolveProjectId((req.params as any).projectId);
    }
    if (req.params && typeof (req.params as any).environmentId === 'string') {
      const pId = (req.params as any).projectId || '00000000-0000-0000-0000-000000000020';
      (req.params as any).environmentId = await AuthService.resolveEnvironmentId(pId, (req.params as any).environmentId);
    }
  });

  // 4. Enforce Secure Cookie Flags in Production/Staging
  server.addHook('onSend', async (_request, reply, _payload) => {
    const setCookie = reply.getHeader('set-cookie');
    if (setCookie && (config.env === 'production' || config.env === 'staging')) {
      const cookies = Array.isArray(setCookie) ? setCookie : [String(setCookie)];
      const hardenedCookies = cookies.map((c) => {
        let cookieStr = c;
        if (!cookieStr.toLowerCase().includes('secure')) cookieStr += '; Secure';
        if (!cookieStr.toLowerCase().includes('httponly')) cookieStr += '; HttpOnly';
        if (!cookieStr.toLowerCase().includes('samesite')) cookieStr += '; SameSite=Strict';
        return cookieStr;
      });
      reply.header('set-cookie', hardenedCookies);
    }
  });

  // 5. Global Error Handler (Sanitizes stack traces & maps auth errors)
  server.setErrorHandler((error, req, reply) => {
    req.log.error(error);

    if (error.name === 'ZodError' || (error as any).issues) {
      let details: any = error.message;
      try {
        details = (error as any).issues || JSON.parse(error.message);
      } catch {
        details = error.message;
      }
      return reply.status(400).send({
        error: 'Validation Error',
        details,
      });
    }

    if (error.statusCode) {
      return reply.status(error.statusCode).send({
        error: (error as any).code || error.name || 'Error',
        message: error.message,
        code: (error as any).code,
        feature: (error as any).feature,
        details: (error as any).details,
        upgradeUrl: (error as any).upgradeUrl,
      });
    }

    if (error.message?.includes('FORBIDDEN')) {
      return reply.status(403).send({
        error: 'Forbidden',
        message: error.message,
      });
    }

    if (error.message?.includes('UNAUTHORIZED')) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: error.message,
      });
    }

    // Default 500 error: Do not leak internal stack traces
    return reply.status(500).send({
      error: 'Internal Server Error',
      message: 'An unexpected internal error occurred. Request ID: ' + req.id,
    });
  });

  // 6. Register Route Modules
  await server.register(healthRoutes);
  await server.register(authRoutes);
  await server.register(documentRoutes);
  await server.register(realtimeRoutes);
  await server.register(rulesRoutes);
  await server.register(storageRoutes);
  await server.register(adminRoutes);
  await server.register(functionRoutes);
  await server.register(projectRoutes);

  return server;
}

async function start() {
  try {
    const server = await buildServer();

    // Run database migrations on startup to ensure all tables exist
    try {
      await runMigrations();
    } catch (migErr) {
      console.warn('[MIGRATIONS] Auto-migration notice:', (migErr as Error).message);
    }

    // Start background listeners and bootstrap platform admin
    await RealtimeService.startListener();
    await AuthService.bootstrapPlatformAdmin();

    await server.listen({ port: config.port, host: config.host });
    console.log(`[API GATEWAY] Server listening on http://${config.host}:${config.port}`);

    // Graceful Shutdown
    const signals = ['SIGINT', 'SIGTERM'];
    for (const signal of signals) {
      process.on(signal, async () => {
        console.log(`[API GATEWAY] Received ${signal}, closing server gracefully...`);
        await server.close();
        await pool.end();
        process.exit(0);
      });
    }
  } catch (err) {
    console.error('[API GATEWAY] Startup error:', err);
    process.exit(1);
  }
}

// Only start directly if not imported as module
if (process.argv[1]?.endsWith('server.js') || process.argv[1]?.endsWith('server.ts')) {
  start();
}
