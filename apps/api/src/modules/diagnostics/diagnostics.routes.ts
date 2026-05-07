import type { FastifyInstance } from 'fastify'
import { ok } from '../../common/http/response.js'

export async function diagnosticsRoutes(app: FastifyInstance) {
  app.get('/', { schema: { tags: ['diagnostics'] } }, async (_req, reply) => {
    const checks = await Promise.allSettled([
      app.prisma.$queryRaw`SELECT 1`.then(() => 'ok'),
      app.redis.ping().then((r) => (r === 'PONG' ? 'ok' : 'error')),
      new Promise<string>((resolve) =>
        app.mqtt.connected ? resolve('ok') : resolve('disconnected'),
      ),
    ])

    const [db, redis, mqtt] = checks.map((r) =>
      r.status === 'fulfilled' ? r.value : 'error',
    )

    const allOk = [db, redis, mqtt].every((s) => s === 'ok')

    return reply.status(allOk ? 200 : 503).send(
      ok({
        status: allOk ? 'healthy' : 'degraded',
        services: { db, redis, mqtt },
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      }),
    )
  })

  app.get('/api-usage', { schema: { tags: ['diagnostics'] } }, async (_req) => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const [todayCount, totalCount] = await Promise.all([
      app.prisma.apiUsageLog.count({ where: { calledAt: { gte: today } } }),
      app.prisma.apiUsageLog.count(),
    ])
    return ok({ todayCount, totalCount })
  })
}
