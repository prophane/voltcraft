import type { FastifyInstance } from 'fastify'
import { ok } from '../../common/http/response.js'
import { env } from '../../config/env.js'
import { TeslaClient } from '../../providers/tesla/tesla.client.js'

type TeslaRegion = 'na' | 'eu' | 'cn'

interface TeslaConnectionResult {
  connected: boolean
  tokenConfigured: boolean
  accountConfigured: boolean
  oauthConfigured: boolean
  region: TeslaRegion
  dbVehicleCount: number
  apiVehicleCount?: number
  apiReachable: boolean
  httpStatus?: number
  error?: string
}

async function probeTeslaConnection(
  client: TeslaClient,
  input: {
    accountConfigured: boolean
    oauthConfigured: boolean
    dbVehicleCount: number
    region: TeslaRegion
    accessToken: string
    account?: {
      id: string
      userId: string
      email: string
      accessToken: string
      refreshToken: string
      tokenExpiry: Date
      region: string
      linkedAt: Date
      lastSyncAt: Date | null
      isActive: boolean
      createdAt: Date
      updatedAt: Date
    }
  },
): Promise<TeslaConnectionResult> {
  if (!input.accessToken.trim()) {
    return {
      connected: false,
      tokenConfigured: false,
      accountConfigured: input.accountConfigured,
      oauthConfigured: input.oauthConfigured,
      region: input.region,
      dbVehicleCount: input.dbVehicleCount,
      apiReachable: false,
      error: 'Tesla token not configured',
    }
  }

  try {
    if (!input.account) {
      return {
        connected: false,
        tokenConfigured: true,
        accountConfigured: false,
        oauthConfigured: input.oauthConfigured,
        region: input.region,
        dbVehicleCount: input.dbVehicleCount,
        apiReachable: false,
        error: 'Tesla account not found in database',
      }
    }

    const vehicles = await client.listVehicles(input.account)
    const apiVehicleCount = vehicles.length

    return {
      connected: true,
      tokenConfigured: true,
      accountConfigured: input.accountConfigured,
      oauthConfigured: input.oauthConfigured,
      region: input.region,
      dbVehicleCount: input.dbVehicleCount,
      apiVehicleCount,
      apiReachable: true,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown Tesla API network error'
    return {
      connected: false,
      tokenConfigured: true,
      accountConfigured: input.accountConfigured,
      oauthConfigured: input.oauthConfigured,
      region: input.region,
      dbVehicleCount: input.dbVehicleCount,
      apiReachable: false,
      error: `Unable to reach Tesla Fleet API: ${message}`,
    }
  }
}

export async function diagnosticsRoutes(app: FastifyInstance) {
  app.get('/', { schema: { tags: ['diagnostics'] } }, async (_req, reply) => {
    const mqttStatus = env.MQTT_ENABLED
      ? (app.mqtt.connected ? 'ok' : 'disconnected')
      : 'disabled'

    const checks = await Promise.allSettled([
      app.prisma.$queryRaw`SELECT 1`.then(() => 'ok'),
      app.redis.ping().then((r) => (r === 'PONG' ? 'ok' : 'error')),
      Promise.resolve(mqttStatus),
    ])

    const [db, redis, mqtt] = checks.map((r) =>
      r.status === 'fulfilled' ? r.value : 'error',
    )

    const allOk = db === 'ok' && redis === 'ok' && (mqtt === 'ok' || mqtt === 'disabled')

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

    const client = new TeslaClient(app.prisma, app.redis)
    const region = (activeAccount?.region ?? env.TESLA_REGION) as TeslaRegion
    const token = (activeAccount?.accessToken || '').trim()
    const oauthConfigured = Boolean(env.TESLA_CLIENT_ID && env.TESLA_CLIENT_SECRET && env.TESLA_REDIRECT_URI)
    const dbVehicleCount = await app.prisma.vehicle.count({ where: { isActive: true } })

    const result = await probeTeslaConnection(client, {
      accountConfigured: !!activeAccount,
      oauthConfigured,
      dbVehicleCount,
      region,
      accessToken: token,
      account: activeAccount ?? undefined,
    })

    if (!result.connected && oauthConfigured && !result.tokenConfigured) {
      result.error = 'OAuth Fleet is configured but no Tesla account is connected yet. Click Connect With Tesla OAuth first.'
    }

    return reply.status(200).send(ok(result))
  })
}
