import type { FastifyInstance } from 'fastify'
import { ok } from '../../common/http/response.js'
import { AuthRepository } from '../auth/auth.repository.js'
import { AuthService } from '../auth/auth.service.js'
import { requireAuth } from '../auth/auth.routes.js'
import { env } from '../../config/env.js'

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
      mqttConnected: env.MQTT_ENABLED ? app.mqtt.connected : false,
      mqttEnabled: env.MQTT_ENABLED,
    })
  })

  app.post('/home-assistant/test', { schema: { tags: ['integrations'] } }, async (req, reply) => {
    const token = await requireAuth(req)
    await authService.validateSession(token)

    const connected = env.MQTT_ENABLED ? app.mqtt.connected : false
    const status = env.MQTT_ENABLED ? (connected ? 'connected' : 'error') : 'disabled'

    await app.prisma.integrationConfig.upsert({
      where: { name: 'home_assistant' },
      create: { name: 'home_assistant', lastTestedAt: new Date(), lastStatus: status },
      update: { lastTestedAt: new Date(), lastStatus: status },
    })

    return reply.status(env.MQTT_ENABLED ? (connected ? 200 : 503) : 200).send(
      ok({
        connected,
        status,
        message: env.MQTT_ENABLED
          ? (connected ? 'MQTT broker reachable' : 'MQTT broker unreachable')
          : 'MQTT disabled by configuration',
      }),
    )
  })
}
