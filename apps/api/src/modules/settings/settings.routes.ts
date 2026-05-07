import type { FastifyInstance } from 'fastify'
import { SettingsRepository } from './settings.repository.js'
import { AuthRepository } from '../auth/auth.repository.js'
import { AuthService } from '../auth/auth.service.js'
import { requireAuth } from '../auth/auth.routes.js'
import { updateSettingsSchema } from './settings.schemas.js'
import { ok } from '../../common/http/response.js'
import { env } from '../../config/env.js'
import { persistTeslaOAuthConfig } from '../../config/tesla-config.js'
import { z } from 'zod'

const teslaOAuthCfgSchema = z.object({
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  redirectUri: z.string().url(),
  region: z.enum(['na', 'eu', 'cn']).optional(),
})

export async function settingsRoutes(app: FastifyInstance) {
  const repo = new SettingsRepository(app.prisma)
  const authService = new AuthService(new AuthRepository(app.prisma))

  app.get('/', { schema: { tags: ['settings'] } }, async (req) => {
    const token = await requireAuth(req)
    const session = await authService.validateSession(token)
    const settings = await repo.findByUserId(session.userId)
    // Mask sensitive field
    return ok({ ...settings, mqttPassword: settings.mqttPassword ? '••••••••' : null })
  })

  app.patch('/', { schema: { tags: ['settings'] } }, async (req) => {
    const token = await requireAuth(req)
    const session = await authService.validateSession(token)
    const input = updateSettingsSchema.parse(req.body)
    const updated = await repo.update(session.userId, input)
    return ok(updated)
  })

  // Tesla Configuration endpoints (no auth in AUTH_DISABLED mode)
  app.get('/tesla', { schema: { tags: ['settings'] } }, async (req) => {
    if (!env.AUTH_DISABLED) {
      const token = await requireAuth(req)
      await authService.validateSession(token)
    }

    const activeAccount = await app.prisma.teslaAccount.findFirst({
      where: { isActive: true },
      orderBy: { updatedAt: 'desc' },
    })

    const oauthConfigured = Boolean(env.TESLA_CLIENT_ID && env.TESLA_CLIENT_SECRET && env.TESLA_REDIRECT_URI)

    return ok({
      oauthConfigured,
      connected: Boolean(activeAccount?.accessToken),
      region: activeAccount?.region ?? env.TESLA_REGION,
      accountEmail: activeAccount?.email ?? null,
    })
  })

  app.post('/tesla', { schema: { tags: ['settings'] } }, async (req, reply) => {
    // In production with auth enabled, verify session first
    if (!env.AUTH_DISABLED) {
      const token = await requireAuth(req)
      await authService.validateSession(token)
    }

    const input = teslaOAuthCfgSchema.parse(req.body)
    const region = input.region ?? env.TESLA_REGION

    const persistence = await persistTeslaOAuthConfig({
      clientId: input.clientId,
      clientSecret: input.clientSecret,
      redirectUri: input.redirectUri,
    })

    env.TESLA_REGION = region
    app.log.info(`Tesla OAuth config updated: region=${region}; persisted=${persistence.persistedToFile}`)

    return reply.status(201).send(ok({
      message: 'Tesla OAuth configuration updated. Click Connect With Tesla OAuth to link account.',
      applied: {
        region,
        oauthConfigured: true,
      },
      persistedToFile: persistence.persistedToFile,
    }))
  })
}
