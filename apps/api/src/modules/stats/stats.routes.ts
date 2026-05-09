import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { StatsRepository } from './stats.repository.js'
import { VehicleRepository } from '../vehicle/vehicle.repository.js'
import { AuthRepository } from '../auth/auth.repository.js'
import { AuthService } from '../auth/auth.service.js'
import { requireAuth } from '../auth/auth.routes.js'
import { AppError } from '../../common/errors/app-error.js'
import { NotFoundError } from '../../common/errors/app-error.js'
import { calcAvgConsumption } from './calculators/summary.calculator.js'
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

  const getVehicleForRead = (userId: string) =>
    teslamate.isEnabled() ? getVehicle(userId) : withVehicleAutoBootstrap(app, () => getVehicle(userId))

  // GET /stats/summary?days=30
  app.get('/summary', { schema: { tags: ['stats'] } }, async (req) => {
    const token = await requireAuth(req)
    const session = await authService.validateSession(token)
    const { days } = periodSchema.parse(req.query)
    const since = new Date(Date.now() - days * 86_400_000)
    const vehicle = await getVehicleForRead(session.userId)

    if (teslamate.isEnabled()) {
      try {
        const summary = await teslamate.getSummary(vehicle.vin, since, days)
        return ok(summary)
      } catch (error) {
        throw new AppError('TESLAMATE_UNAVAILABLE', formatTeslaMateUnavailableMessage('summary query', error), 503)
      }
    }

    const [distanceKm, energyAddedKwh, energyUsedKwh, cost, tripsCount, chargesCount] = await Promise.all([
      statsRepo.getDistanceSum(vehicle.id, since),
      statsRepo.getEnergySum(vehicle.id, since),
      statsRepo.getTripEnergySum(vehicle.id, since),
      statsRepo.getCostSum(vehicle.id, since),
      statsRepo.getTripsCount(vehicle.id, since),
      statsRepo.getChargesCount(vehicle.id, since),
    ])

    return ok({
      periodDays: days,
      distanceKm: Math.round(distanceKm * 10) / 10,
      energyAddedKwh: Math.round(energyAddedKwh * 10) / 10,
      energyUsedKwh: Math.round(energyUsedKwh * 10) / 10,
      estimatedCostEur: Math.round(cost * 100) / 100,
      avgConsumptionKwhPer100km: calcAvgConsumption(energyUsedKwh, distanceKm),
      tripsCount,
      chargeSessionsCount: chargesCount,
    })
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

    if (teslamate.isEnabled()) {
      const metrics = await teslamate.getDailyEfficiency(vehicle.vin, since)
      if (metrics) return ok(metrics)
    }

    const metrics = await statsRepo.getDailyTripMetrics(vehicle.id, since)
    return ok(metrics)
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

    const trips = await statsRepo.getTripsForAnomalyDetection(vehicle.id, since)
    const tripData = trips
      .filter((t) => t.distanceKm != null && t.distanceKm > 0.1 && t.energyUsedKwh != null && t.energyUsedKwh > 0)
      .map((t) => ({
        id: t.id,
        startedAt: t.startedAt,
        distance: t.distanceKm ?? 0,
        consumption: ((t.energyUsedKwh ?? 0) / (t.distanceKm ?? 1)) * 100, // kWh/100km
      }))
      .filter((t) => Number.isFinite(t.consumption) && t.consumption > 0)

    const result = detectConsumptionAnomalies(tripData, days)
    return ok(result)
  })
}
