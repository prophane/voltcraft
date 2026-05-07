import type { FastifyInstance } from 'fastify'
import { ok } from '../../common/http/response.js'
import { env } from '../../config/env.js'

type TeslaRegion = 'na' | 'eu' | 'cn'

const REGION_BASE: Record<TeslaRegion, string> = {
  na: 'https://fleet-api.prd.na.vn.cloud.tesla.com',
  eu: 'https://fleet-api.prd.eu.vn.cloud.tesla.com',
  cn: 'https://fleet-api.prd.cn.vn.cloud.tesla.cn',
}

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

  app.get('/tesla-connection', { schema: { tags: ['diagnostics'] } }, async (_req, reply) => {
    const activeAccount = await app.prisma.teslaAccount.findFirst({
      where: { isActive: true },
      orderBy: { updatedAt: 'desc' },
    })

    const region = (activeAccount?.region ?? env.TESLA_REGION) as TeslaRegion
    const token = (env.TESLA_TOKEN || activeAccount?.accessToken || '').trim()
    const tokenConfigured = token.length > 0

    const dbVehicleCount = await app.prisma.vehicle.count({ where: { isActive: true } })

    if (!tokenConfigured) {
      return reply.status(503).send(ok({
        connected: false,
        tokenConfigured: false,
        accountConfigured: !!activeAccount,
        region,
        dbVehicleCount,
        apiReachable: false,
        error: 'Tesla token not configured',
      }))
    }

    const url = `${REGION_BASE[region]}/api/1/vehicles`

    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(15_000),
      })

      if (!res.ok) {
        const details = await res.text().catch(() => '')
        return reply.status(503).send(ok({
          connected: false,
          tokenConfigured: true,
          accountConfigured: !!activeAccount,
          region,
          dbVehicleCount,
          apiReachable: false,
          httpStatus: res.status,
          error: `Tesla Fleet API rejected request (${res.status})${details ? `: ${details.slice(0, 180)}` : ''}`,
        }))
      }

      const payload = (await res.json()) as { response?: unknown[] }
      const apiVehicleCount = Array.isArray(payload.response) ? payload.response.length : 0

      return reply.status(200).send(ok({
        connected: true,
        tokenConfigured: true,
        accountConfigured: !!activeAccount,
        region,
        dbVehicleCount,
        apiVehicleCount,
        apiReachable: true,
      }))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown Tesla API network error'

      return reply.status(503).send(ok({
        connected: false,
        tokenConfigured: true,
        accountConfigured: !!activeAccount,
        region,
        dbVehicleCount,
        apiReachable: false,
        error: `Unable to reach Tesla Fleet API: ${message}`,
      }))
    }
  })
}
