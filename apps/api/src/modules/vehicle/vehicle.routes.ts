import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { VehicleRepository } from './vehicle.repository.js'
import { VehicleService } from './vehicle.service.js'
import { TeslaEcoPolicyService } from '../../providers/tesla/tesla-eco-policy.service.js'
import { TeslaClient } from '../../providers/tesla/tesla.client.js'
import { TeslaSyncService } from '../../providers/tesla/tesla-sync.service.js'
import { AuthService } from '../auth/auth.service.js'
import { AuthRepository } from '../auth/auth.repository.js'
import { requireAuth } from '../auth/auth.routes.js'
import { ok, paginated } from '../../common/http/response.js'
import { withVehicleAutoBootstrap } from './vehicle-auto-bootstrap.js'
import { TeslaMateReadService } from '../../providers/teslamate/teslamate-read.service.js'
import { TeslaApiError } from '../../common/errors/app-error.js'

const historyQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(500).default(100),
  from: z.string().optional(),
  to: z.string().optional(),
})

export async function vehicleRoutes(app: FastifyInstance) {
  const repo = new VehicleRepository(app.prisma)
  const authRepo = new AuthRepository(app.prisma)
  const authService = new AuthService(authRepo)
  const ecoPolicy = new TeslaEcoPolicyService(app.redis)
  const teslaClient = new TeslaClient(app.prisma, app.redis)
  const syncService = new TeslaSyncService(teslaClient, repo, ecoPolicy, app.prisma)
  const service = new VehicleService(repo, ecoPolicy, syncService)
  const teslamate = new TeslaMateReadService()

  const snapshotToState = (vehicleId: string, snapshot: Awaited<ReturnType<typeof repo.getLatestSnapshot>>) => {
    if (!snapshot) return null

    return {
      vehicleId,
      capturedAt: snapshot.capturedAt,
      batteryLevel: snapshot.batteryLevel,
      batteryRange: snapshot.batteryRange,
      chargeLimitSoc: snapshot.chargeLimitSoc,
      chargeState: snapshot.chargeState,
      isCharging: snapshot.isCharging,
      isPluggedIn: snapshot.isPluggedIn,
      chargeRate: snapshot.chargeRate,
      timeToFullCharge: snapshot.timeToFullCharge,
      climateOn: snapshot.climateOn,
      insideTemp: snapshot.insideTemp,
      outsideTemp: snapshot.outsideTemp,
      isSeatHeaterOn: false,
      cabinOverheatProtectionMode: 'off' as const,
      isLocked: snapshot.isLocked,
      isTrunkOpen: snapshot.isTrunkOpen,
      isFrunkOpen: snapshot.isFrunkOpen,
      isDriving: snapshot.isDriving,
      speed: snapshot.speed,
      power: snapshot.power,
      latitude: snapshot.latitude,
      longitude: snapshot.longitude,
      heading: snapshot.heading,
      atHome: snapshot.atHome,
      isCached: true,
    }
  }

  const getVehicleForRead = async (userId: string) => {
    if (teslamate.isEnabled()) {
      const vehicle = await repo.findActive(userId)
      if (!vehicle) throw new Error('Vehicle not found')
      return vehicle
    }

    return withVehicleAutoBootstrap(app, async () => {
      const vehicle = await repo.findActive(userId)
      if (!vehicle) throw new Error('Vehicle not found')
      return vehicle
    })
  }

  // ── GET /vehicle/current ──────────────────────────────────────
  app.get('/current', { schema: { tags: ['vehicle'] } }, async (req) => {
    const token = await requireAuth(req)
    const session = await authService.validateSession(token)
    if (teslamate.isEnabled()) {
      const vehicle = await getVehicleForRead(session.userId)
      const fallback = await repo.getLatestSnapshot(vehicle.id)
      const current = await teslamate.getCurrentVehicle(vehicle, fallback ?? undefined)
      if (current) return ok(current)
    }
    const vehicle = await withVehicleAutoBootstrap(app, () => service.getCurrentVehicle(session.userId))
    return ok(vehicle)
  })

  // ── GET /vehicle/state ────────────────────────────────────────
  app.get('/state', { schema: { tags: ['vehicle'] } }, async (req) => {
    const token = await requireAuth(req)
    const session = await authService.validateSession(token)
    if (teslamate.isEnabled()) {
      const vehicle = await getVehicleForRead(session.userId)
      const fallback = await repo.getLatestSnapshot(vehicle.id)
      const state = await teslamate.getVehicleState(vehicle, fallback ?? undefined)
      if (state) return ok(state)
      const cachedState = snapshotToState(vehicle.id, fallback)
      if (cachedState) return ok(cachedState)
    }

    try {
      const state = await withVehicleAutoBootstrap(app, () => service.getVehicleState(session.userId))
      return ok(state)
    } catch (error) {
      if (error instanceof TeslaApiError && error.teslaCode === 'vehicle_unavailable') {
        const vehicle = await repo.findActive(session.userId)
        if (vehicle) {
          const fallback = await repo.getLatestSnapshot(vehicle.id)
          const cachedState = snapshotToState(vehicle.id, fallback)
          if (cachedState) return ok(cachedState)
        }
      }
      throw error
    }
  })

  // ── GET /vehicle/location ─────────────────────────────────────
  app.get('/location', { schema: { tags: ['vehicle'] } }, async (req) => {
    const token = await requireAuth(req)
    const session = await authService.validateSession(token)
    if (teslamate.isEnabled()) {
      const vehicle = await getVehicleForRead(session.userId)
      const location = await teslamate.getVehicleLocation(vehicle.vin)
      if (location) return ok(location)
    }
    const location = await withVehicleAutoBootstrap(app, () => service.getVehicleLocation(session.userId))
    return ok(location)
  })

  // ── GET /vehicle/history ──────────────────────────────────────
  app.get('/history', { schema: { tags: ['vehicle'] } }, async (req) => {
    const token = await requireAuth(req)
    const session = await authService.validateSession(token)
    const query = historyQuerySchema.parse(req.query)
    const vehicle = await withVehicleAutoBootstrap(app, () => repo.findActive(session.userId))
    if (!vehicle) return paginated([], 0, query.page, query.pageSize)

    const { snapshots, total } = await repo.getHistory(vehicle.id, {
      page: query.page,
      pageSize: query.pageSize,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
    })

    return paginated(snapshots, total, query.page, query.pageSize)
  })

  // ── POST /vehicle/sync ────────────────────────────────────────
  app.post('/sync', { schema: { tags: ['vehicle'] } }, async (req) => {
    const token = await requireAuth(req)
    const session = await authService.validateSession(token)
    const result = await withVehicleAutoBootstrap(app, () => service.forceSync(session.userId))
    return ok(result)
  })
}
