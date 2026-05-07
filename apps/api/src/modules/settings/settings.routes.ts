import type { FastifyInstance } from 'fastify'
import { SettingsRepository } from './settings.repository.js'
import { AuthRepository } from '../auth/auth.repository.js'
import { AuthService } from '../auth/auth.service.js'
import { requireAuth } from '../auth/auth.routes.js'
import { updateSettingsSchema } from './settings.schemas.js'
import { ok } from '../../common/http/response.js'

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
}
