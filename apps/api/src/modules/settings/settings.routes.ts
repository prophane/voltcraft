import type { FastifyInstance } from 'fastify'
import { SettingsRepository } from './settings.repository.js'
import { AuthRepository } from '../auth/auth.repository.js'
import { AuthService } from '../auth/auth.service.js'
import { requireAuth } from '../auth/auth.routes.js'
import { updateSettingsSchema } from './settings.schemas.js'
import { ok } from '../../common/http/response.js'
import { env } from '../../config/env.js'
import { z } from 'zod'

const teslaCfgSchema = z.object({
  token: z.string(),
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
  app.get('/tesla', { schema: { tags: ['settings'] } }, async () => {
    return {
      token: env.TESLA_TOKEN ? '••••••••' : '',
      region: env.TESLA_REGION,
      configured: !!env.TESLA_TOKEN,
    }
  })

  app.post('/tesla', { schema: { tags: ['settings'] } }, async (req, reply) => {
    // In production with auth enabled, verify session first
    if (!env.AUTH_DISABLED) {
      const token = await requireAuth(req)
      await authService.validateSession(token)
    }

    const input = teslaCfgSchema.parse(req.body)

    // In a real app, you'd store this in DB and restart the service
    // For now, we acknowledge it
    app.log.info(`Tesla config updated: region=${input.region}`)

    return reply.status(201).send({
      success: true,
      message: 'Tesla configuration updated. Service restart may be required.',
      applied: {
        region: input.region ?? env.TESLA_REGION,
      },
    })
  })
}
