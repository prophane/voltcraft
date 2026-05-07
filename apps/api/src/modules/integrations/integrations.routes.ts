import type { FastifyInstance } from 'fastify'
import { ok } from '../../common/http/response.js'
import { AuthRepository } from '../auth/auth.repository.js'
import { AuthService } from '../auth/auth.service.js'
import { requireAuth } from '../auth/auth.routes.js'

export async function integrationsRoutes(app: FastifyInstance) {
  const authService = new AuthService(new AuthRepository(app.prisma))

  app.get('/home-assistant', { schema: { tags: ['integrations'] } }, async (req) => {
    const token = await requireAuth(req)
    await authService.validateSession(token)
    const config = await app.prisma.integrationConfig.upsert({
      where: { name: 'home_assistant' },
      create: { name: 'home_assistant' },
      update: {},
    })
    return ok({
      enabled: config.enabled,
      lastTestedAt: config.lastTestedAt,
      lastStatus: config.lastStatus,
      mqttConnected: app.mqtt.connected,
    })
  })

  app.post('/home-assistant/test', { schema: { tags: ['integrations'] } }, async (req, reply) => {
    const token = await requireAuth(req)
    await authService.validateSession(token)

    const connected = app.mqtt.connected
    const status = connected ? 'connected' : 'error'

    await app.prisma.integrationConfig.upsert({
      where: { name: 'home_assistant' },
      create: { name: 'home_assistant', lastTestedAt: new Date(), lastStatus: status },
      update: { lastTestedAt: new Date(), lastStatus: status },
    })

    return reply.status(connected ? 200 : 503).send(
      ok({ connected, status, message: connected ? 'MQTT broker reachable' : 'MQTT broker unreachable' }),
    )
  })
}
