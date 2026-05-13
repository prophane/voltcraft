import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { StatsRepository } from './stats.repository.js'
import { VehicleRepository } from '../vehicle/vehicle.repository.js'
import { AuthRepository } from '../auth/auth.repository.js'
import { AuthService } from '../auth/auth.service.js'
import { requireAuth } from '../auth/auth.routes.js'
import { AppError } from '../../common/errors/app-error.js'
import { NotFoundError } from '../../common/errors/app-error.js'
import { detectConsumptionAnomalies } from './calculators/anomalies.calculator.js'
import { ok } from '../../common/http/response.js'
import { withVehicleAutoBootstrap } from '../vehicle/vehicle-auto-bootstrap.js'
import {
  TeslaMateReadService,
  formatTeslaMateUnavailableMessage,
} from '../../providers/teslamate/teslamate-read.service.js'

const periodSchema = z.object({
  days: z.coerce.number().min(1).max(365).default(30),
})

const idleQuerySchema = z.object({
  days: z.coerce.number().min(1).max(365).default(7),
  minDurationMin: z.coerce.number().min(1).max(24 * 60).default(5),
})

export async function statsRoutes(app: FastifyInstance) {
  const statsRepo = new StatsRepository(app.prisma)
  const vehicleRepo = new VehicleRepository(app.prisma)
  const authService = new AuthService(new AuthRepository(app.prisma))
  const teslamate = new TeslaMateReadService()

  const getVehicle = async (userId: string) => {
    const v = await vehicleRepo.findActive(userId)
    if (!v) throw new NotFoundError('Vehicle')
    return v
  }

  const getVehicleForRead = (userId: string) => withVehicleAutoBootstrap(app, userId, () => getVehicle(userId))

  // GET /stats/summary?days=30
  app.get('/summary', { schema: { tags: ['stats'] } }, async (req) => {
    const token = await requireAuth(req)
    const session = await authService.validateSession(token)
    const { days } = periodSchema.parse(req.query)
    const since = new Date(Date.now() - days * 86_400_000)
    const vehicle = await getVehicleForRead(session.userId)

    try {
      const summary = await teslamate.getSummary(vehicle.vin, since, days)
      return ok(summary)
    } catch (error) {
      throw new AppError('TESLAMATE_UNAVAILABLE', formatTeslaMateUnavailableMessage('summary query', error), 503)
    }
  })

  // GET /stats/battery?days=30
  app.get('/battery', { schema: { tags: ['stats'] } }, async (req) => {
    const token = await requireAuth(req)
    const session = await authService.validateSession(token)
    const { days } = periodSchema.parse(req.query)
    const since = new Date(Date.now() - days * 86_400_000)
    const vehicle = await getVehicleForRead(session.userId)
    const trend = await statsRepo.getDailyBatteryTrend(vehicle.id, since)
    return ok(trend)
  })

  // GET /stats/battery-health?days=180
  app.get('/battery-health', { schema: { tags: ['stats'] } }, async (req) => {
    const token = await requireAuth(req)
    const session = await authService.validateSession(token)
    const { days } = periodSchema.parse(req.query)
    const since = new Date(Date.now() - days * 86_400_000)
    const vehicle = await getVehicleForRead(session.userId)
    const health = await statsRepo.getBatteryHealthEstimate(vehicle.id, since)
    return ok({ periodDays: days, ...health })
  })

  // GET /stats/battery-health/measurements?days=180
  app.get('/battery-health/measurements', { schema: { tags: ['stats'] } }, async (req) => {
    const token = await requireAuth(req)
    const session = await authService.validateSession(token)
    const { days } = periodSchema.parse(req.query)
    const since = new Date(Date.now() - days * 86_400_000)
    const vehicle = await getVehicleForRead(session.userId)
    const points = await statsRepo.getBatteryHealthMeasurements(vehicle.id, since)
    return ok(points)
  })

  // GET /stats/efficiency?days=30
  app.get('/efficiency', { schema: { tags: ['stats'] } }, async (req) => {
    const token = await requireAuth(req)
    const session = await authService.validateSession(token)
    const { days } = periodSchema.parse(req.query)
    const since = new Date(Date.now() - days * 86_400_000)
    const vehicle = await getVehicleForRead(session.userId)

    try {
      const metrics = await teslamate.getDailyEfficiency(vehicle.vin, since)
      return ok(metrics)
    } catch (error) {
      throw new AppError('TESLAMATE_UNAVAILABLE', formatTeslaMateUnavailableMessage('efficiency query', error), 503)
    }
  })

  // GET /stats/idles?days=7&minDurationMin=5
  app.get('/idles', { schema: { tags: ['stats'] } }, async (req) => {
    const token = await requireAuth(req)
    const session = await authService.validateSession(token)
    const { days, minDurationMin } = idleQuerySchema.parse(req.query)
    const since = new Date(Date.now() - days * 86_400_000)
    const vehicle = await getVehicleForRead(session.userId)
    const idles = await statsRepo.getIdleSessions(vehicle.id, since, minDurationMin)
    return ok(idles)
  })

  // GET /stats/anomalies?days=30
  app.get('/anomalies', { schema: { tags: ['stats'] } }, async (req) => {
    const token = await requireAuth(req)
    const session = await authService.validateSession(token)
    const { days } = periodSchema.parse(req.query)
    const since = new Date(Date.now() - days * 86_400_000)
    const vehicle = await getVehicleForRead(session.userId)

    try {
      const pageSize = 100
      const maxPages = 50
      const trips: Array<{ id: string; startedAt: Date | null; distanceKm: number | null; energyUsedKwh: number | null }> = []
      let page = 1

      while (page <= maxPages) {
        const chunk = await teslamate.getTrips(vehicle.vin, { page, pageSize, from: since })
        trips.push(...chunk.trips)
        if (chunk.trips.length < pageSize) break
        page += 1
      }

      const tripData = trips
        .filter((t) => t.distanceKm != null && t.distanceKm > 0.1 && t.energyUsedKwh != null && t.energyUsedKwh > 0)
        .map((t) => ({
          id: t.id,
          startedAt: t.startedAt ?? new Date(),
          distance: t.distanceKm ?? 0,
          consumption: ((t.energyUsedKwh ?? 0) / (t.distanceKm ?? 1)) * 100,
        }))
        .filter((t) => Number.isFinite(t.consumption) && t.consumption > 0)

      const result = detectConsumptionAnomalies(tripData, days)
      return ok(result)
    } catch (error) {
      throw new AppError('TESLAMATE_UNAVAILABLE', formatTeslaMateUnavailableMessage('anomalies query', error), 503)
    }
  })
}
