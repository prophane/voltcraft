import fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import cookie from '@fastify/cookie'
import rateLimit from '@fastify/rate-limit'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import staticPlugin from '@fastify/static'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

import { env } from './config/env.js'
import { registerErrorHandler } from './common/errors/error-handler.js'
import { ok } from './common/http/response.js'

// Plugins
import { prismaPlugin } from './plugins/prisma.js'
import { redisPlugin } from './plugins/redis.js'
import { mqttPlugin } from './plugins/mqtt.js'
import { bullmqPlugin } from './plugins/bullmq.js'

// Routes
import { authRoutes } from './modules/auth/auth.routes.js'
import { registerSetupRoutes } from './modules/auth/auth.setup.routes.js'
import { vehicleRoutes } from './modules/vehicle/vehicle.routes.js'
import { commandsRoutes } from './modules/commands/commands.routes.js'
import { tripsRoutes } from './modules/trips/trips.routes.js'
import { chargesRoutes } from './modules/charges/charges.routes.js'
import { statsRoutes } from './modules/stats/stats.routes.js'
import { automationsRoutes } from './modules/automations/automations.routes.js'
import { integrationsRoutes } from './modules/integrations/integrations.routes.js'
import { settingsRoutes } from './modules/settings/settings.routes.js'
import { diagnosticsRoutes } from './modules/diagnostics/diagnostics.routes.js'

export async function buildApp() {
  const app = fastify({
    logger: {
      level: env.LOG_LEVEL,
      transport:
        env.NODE_ENV === 'development'
          ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } }
          : undefined,
    },
    trustProxy: true,
  })

  // ── Security ────────────────────────────────────────────────
  await app.register(helmet, {
    contentSecurityPolicy: false, // managed by frontend
  })
  await app.register(cors, {
    origin: env.NODE_ENV === 'development' ? true : false,
    credentials: true,
  })
  await app.register(cookie, {
    secret: env.SESSION_SECRET,
  })
  await app.register(rateLimit, {
    global: false, // apply per-route
    max: 100,
    timeWindow: '1 minute',
  })

  // ── OpenAPI / Swagger ───────────────────────────────────────
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Voltcraft API',
        description: 'Self-hosted Tesla Fleet companion — local API',
        version: '0.1.0',
      },
      tags: [
        { name: 'auth', description: 'Authentication' },
        { name: 'vehicle', description: 'Vehicle state' },
        { name: 'commands', description: 'Vehicle commands' },
        { name: 'trips', description: 'Trip history' },
        { name: 'charges', description: 'Charge sessions' },
        { name: 'stats', description: 'Statistics' },
        { name: 'automations', description: 'Automation rules' },
        { name: 'integrations', description: 'External integrations' },
        { name: 'settings', description: 'User settings' },
        { name: 'diagnostics', description: 'System diagnostics' },
      ],
    },
  })
  await app.register(swaggerUi, {
    routePrefix: '/docs',
  })

  // ── Infrastructure plugins ──────────────────────────────────
  await app.register(prismaPlugin)
  await app.register(redisPlugin)
  await app.register(mqttPlugin)
  await app.register(bullmqPlugin)

  // ── Health check ────────────────────────────────────────────
  app.get('/health', { schema: { tags: ['diagnostics'] } }, async (_req, reply) => {
    return reply.send({ status: 'ok', service: 'voltcraft-api', timestamp: new Date().toISOString() })
  })

  // ── API routes with /api prefix ──────────────────────────────
  await app.register(
    async (app) => {
      // ── Config endpoint (frontend setup detection) ───────────────
      app.get('/config', async () => {
        return ok({ authDisabled: process.env.AUTH_DISABLED === 'true' })
      })
      // Setup routes (no auth required for initial setup)
      await app.register(registerSetupRoutes, { prefix: '/auth' })
      // Auth routes
      await app.register(authRoutes, { prefix: '/auth' })
      await app.register(vehicleRoutes, { prefix: '/vehicle' })
      await app.register(commandsRoutes, { prefix: '/commands' })
      await app.register(tripsRoutes, { prefix: '/trips' })
      await app.register(chargesRoutes, { prefix: '/charges' })
      await app.register(statsRoutes, { prefix: '/stats' })
      await app.register(automationsRoutes, { prefix: '/automations' })
      await app.register(integrationsRoutes, { prefix: '/integrations' })
      await app.register(settingsRoutes, { prefix: '/settings' })
      await app.register(diagnosticsRoutes, { prefix: '/diagnostics' })
    },
    { prefix: '/api' }
  )

  // ── Serve frontend SPA (fallback to index.html) ──────────────
  const __dirname = dirname(fileURLToPath(import.meta.url))
  const distPath = join(__dirname, '../../web/dist')

  await app.register(staticPlugin, {
    root: distPath,
  })

  // Keep JSON 404s for API routes; serve SPA for non-API routes.
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api')) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: `Route ${req.method}:${req.url} not found` },
      })
    }
    return reply.sendFile('index.html')
  })

  // ── Error handler ────────────────────────────────────────────
  registerErrorHandler(app)

  return app
}
