import type { FastifyInstance } from 'fastify'
import { SettingsRepository } from './settings.repository.js'
import { AuthRepository } from '../auth/auth.repository.js'
import { AuthService } from '../auth/auth.service.js'
import { requireAuth } from '../auth/auth.routes.js'
import { updateSettingsSchema } from './settings.schemas.js'
import { ok } from '../../common/http/response.js'
import { env } from '../../config/env.js'
import { persistTeslaOAuthConfig } from '../../config/tesla-config.js'
import { TeslaClient } from '../../providers/tesla/tesla.client.js'
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

  // Tesla Fleet partner registration (one-time, needed to call Fleet API on behalf of users)
  app.post('/tesla/register-partner', { schema: { tags: ['settings'] } }, async (req, reply) => {
    if (!env.AUTH_DISABLED) {
      const token = await requireAuth(req)
      await authService.validateSession(token)
    }

    const { domain } = z.object({ domain: z.string().min(1) }).parse(req.body)

    // Prefer the active account's region (set during OAuth), fall back to env
    const activeAccount = await app.prisma.teslaAccount.findFirst({
      where: { isActive: true },
      orderBy: { updatedAt: 'desc' },
      select: { region: true },
    })
    const region = activeAccount?.region ?? env.TESLA_REGION ?? 'eu'

    const client = new TeslaClient(app.prisma, app.redis)

    try {
      const result = await client.registerPartner(domain, region)
      app.log.info(`Tesla partner registration successful for domain=${domain} region=${region}`)
      return reply.status(200).send(ok({
        message: `Partner account registered for ${domain} in region ${region}.`,
        region,
        response: result.response,
      }))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      app.log.error(`Tesla partner registration failed: ${message}`)
      return reply.status(500).send({ error: { code: 'PARTNER_REGISTRATION_FAILED', message } })
    }
  })
}
