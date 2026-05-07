import type { FastifyInstance } from 'fastify'
import { VehicleRepository } from './vehicle.repository.js'
import { VehicleService } from './vehicle.service.js'
import { TeslaEcoPolicyService } from '../../providers/tesla/tesla-eco-policy.service.js'
import { TeslaClient } from '../../providers/tesla/tesla.client.js'
import { TeslaSyncService } from '../../providers/tesla/tesla-sync.service.js'
import { AuthService } from '../auth/auth.service.js'
import { AuthRepository } from '../auth/auth.repository.js'
import { requireAuth } from '../auth/auth.routes.js'
import { ok } from '../../common/http/response.js'
import { env } from '../../config/env.js'
import { bootstrapTeslaInventory } from '../../providers/tesla/tesla-bootstrap.service.js'
import { AppError, NotFoundError } from '../../common/errors/app-error.js'

export async function vehicleRoutes(app: FastifyInstance) {
  const repo = new VehicleRepository(app.prisma)
  const authRepo = new AuthRepository(app.prisma)
  const authService = new AuthService(authRepo)
  const ecoPolicy = new TeslaEcoPolicyService(app.redis)
  const teslaClient = new TeslaClient(app.prisma, app.redis)
  const syncService = new TeslaSyncService(teslaClient, repo, ecoPolicy, app.prisma)
  const service = new VehicleService(repo, ecoPolicy, syncService)

  async function bootstrapFromActiveAccount() {
    const activeAccount = await app.prisma.teslaAccount.findFirst({
      where: { isActive: true },
      orderBy: { updatedAt: 'desc' },
    })

    if (!activeAccount?.accessToken) {
      return false
    }

    await bootstrapTeslaInventory(app.prisma, {
      token: activeAccount.accessToken,
      region: (activeAccount.region as 'na' | 'eu' | 'cn') ?? env.TESLA_REGION,
      refreshToken: activeAccount.refreshToken,
      tokenExpiry: activeAccount.tokenExpiry,
      accountEmail: activeAccount.email,
    })

    return true
  }

  async function withAutoBootstrap<T>(userId: string, run: (uid: string) => Promise<T>) {
    try {
      return await run(userId)
    } catch (err) {
      if (
        env.AUTH_DISABLED
        && err instanceof NotFoundError
      ) {
        const bootstrapped = await bootstrapFromActiveAccount()
        if (!bootstrapped && env.TESLA_TOKEN) {
          await bootstrapTeslaInventory(app.prisma, {
            token: env.TESLA_TOKEN,
            region: env.TESLA_REGION,
          })
        }

        try {
          return await run(userId)
        } catch (retryErr) {
          if (retryErr instanceof NotFoundError) {
            throw new AppError(
              'NO_VEHICLE_LINKED',
              'No Tesla vehicle detected for current token. Check Tesla token permissions and selected region, then save Tesla settings again.',
              404,
            )
          }
          throw retryErr
        }
      }

      throw err
    }
  }

  // ── GET /vehicle/current ──────────────────────────────────────
  app.get('/current', { schema: { tags: ['vehicle'] } }, async (req) => {
    const token = await requireAuth(req)
    const session = await authService.validateSession(token)
    const vehicle = await withAutoBootstrap(session.userId, (uid) => service.getCurrentVehicle(uid))
    return ok(vehicle)
  })

  // ── GET /vehicle/state ────────────────────────────────────────
  app.get('/state', { schema: { tags: ['vehicle'] } }, async (req) => {
    const token = await requireAuth(req)
    const session = await authService.validateSession(token)
    const state = await withAutoBootstrap(session.userId, (uid) => service.getVehicleState(uid))
    return ok(state)
  })

  // ── GET /vehicle/location ─────────────────────────────────────
  app.get('/location', { schema: { tags: ['vehicle'] } }, async (req) => {
    const token = await requireAuth(req)
    const session = await authService.validateSession(token)
    const location = await withAutoBootstrap(session.userId, (uid) => service.getVehicleLocation(uid))
    return ok(location)
  })

  // ── POST /vehicle/sync ────────────────────────────────────────
  app.post('/sync', { schema: { tags: ['vehicle'] } }, async (req) => {
    const token = await requireAuth(req)
    const session = await authService.validateSession(token)
    const result = await withAutoBootstrap(session.userId, (uid) => service.forceSync(uid))
    return ok(result)
  })
}
