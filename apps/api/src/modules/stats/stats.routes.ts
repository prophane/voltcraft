import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { StatsRepository } from './stats.repository.js'
import { VehicleRepository } from '../vehicle/vehicle.repository.js'
import { AuthRepository } from '../auth/auth.repository.js'
import { AuthService } from '../auth/auth.service.js'
import { SettingsRepository } from '../settings/settings.repository.js'
import { requireAuth } from '../auth/auth.routes.js'
import { AppError } from '../../common/errors/app-error.js'
import { NotFoundError } from '../../common/errors/app-error.js'
import { detectConsumptionAnomalies } from './calculators/anomalies.calculator.js'
import {
  buildBatteryDegradation,
  buildChargingProfile,
  buildTirePressureAnalysis,
  buildVampireDrain,
} from './calculators/health.calculator.js'
import { ok } from '../../common/http/response.js'
import { withVehicleAutoBootstrap } from '../vehicle/vehicle-auto-bootstrap.js'
import {
  TeslaMateReadService,
  formatTeslaMateUnavailableMessage,
} from '../../providers/teslamate/teslamate-read.service.js'

const periodSchema = z.object({
  days: z.coerce.number().min(1).max(365).default(30),
})

const healthPeriodSchema = z.object({
  days: z.coerce.number().min(1).max(1825).optional(),
})

const idleQuerySchema = z.object({
  days: z.coerce.number().min(1).max(365).default(7),
  minDurationMin: z.coerce.number().min(1).max(24 * 60).default(5),
})

export async function statsRoutes(app: FastifyInstance) {
  const statsRepo = new StatsRepository(app.prisma)
  const vehicleRepo = new VehicleRepository(app.prisma)
  const settingsRepo = new SettingsRepository(app.prisma)
  const authService = new AuthService(new AuthRepository(app.prisma))
  const teslamate = new TeslaMateReadService()

  const getVehicle = async (userId: string) => {
    const v = await vehicleRepo.findActive(userId)
    if (!v) throw new NotFoundError('Vehicle')
    return v
  }

  const getVehicleForRead = (userId: string) => withVehicleAutoBootstrap(app, userId, () => getVehicle(userId))

  const resolveHealthContext = async (req: Parameters<typeof requireAuth>[0], defaultDays: number) => {
    const token = await requireAuth(req)
    const session = await authService.validateSession(token)
    const parsed = healthPeriodSchema.parse(req.query)
    const days = parsed.days ?? defaultDays
    const [vehicle, settings] = await Promise.all([
      getVehicleForRead(session.userId),
      settingsRepo.findByUserId(session.userId),
    ])
    return { vehicle, settings, days, since: new Date(Date.now() - days * 86_400_000) }
  }

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

  // GET /stats/health/battery-degradation?days=365
  app.get('/health/battery-degradation', { schema: { tags: ['stats'] } }, async (req) => {
    const { vehicle, settings, since, days } = await resolveHealthContext(req, 365)
    try {
      const points = await teslamate.getBatteryDegradation(vehicle.vin, since)
      return ok({
        periodDays: days,
        chemistry: settings.batteryChemistry,
        ...buildBatteryDegradation(points, { nominalCapacityKwh: settings.batteryNominalKwh }),
      })
    } catch (error) {
      throw new AppError('TESLAMATE_UNAVAILABLE', formatTeslaMateUnavailableMessage('battery degradation query', error), 503)
    }
  })

  // GET /stats/health/vampire-drain?days=90
  app.get('/health/vampire-drain', { schema: { tags: ['stats'] } }, async (req) => {
    const { vehicle, settings, since, days } = await resolveHealthContext(req, 90)
    try {
      const [gaps, degradationPoints] = await Promise.all([
        teslamate.getVampireDrain(vehicle.vin, since),
        teslamate.getBatteryDegradation(vehicle.vin, since),
      ])
      const capacity = buildBatteryDegradation(degradationPoints, { nominalCapacityKwh: settings.batteryNominalKwh })
      return ok({
        periodDays: days,
        ...buildVampireDrain(gaps, {
          capacityKwh: capacity.currentCapacityKwh ?? settings.batteryNominalKwh,
          maxDailyDrainPct: settings.maxDailyDrainPct,
        }),
      })
    } catch (error) {
      throw new AppError('TESLAMATE_UNAVAILABLE', formatTeslaMateUnavailableMessage('vampire drain query', error), 503)
    }
  })

  // GET /stats/health/charging-profile?days=365
  app.get('/health/charging-profile', { schema: { tags: ['stats'] } }, async (req) => {
    const { vehicle, settings, since, days } = await resolveHealthContext(req, 365)
    try {
      const [sessions, degradationPoints] = await Promise.all([
        teslamate.getChargingProfile(vehicle.vin, since),
        teslamate.getBatteryDegradation(vehicle.vin, since),
      ])
      const capacity = buildBatteryDegradation(degradationPoints, { nominalCapacityKwh: settings.batteryNominalKwh })
      return ok({
        periodDays: days,
        chemistry: settings.batteryChemistry,
        ...buildChargingProfile(sessions, {
          capacityKwh: capacity.currentCapacityKwh ?? settings.batteryNominalKwh,
          maxRecommendedSocPct: settings.maxRecommendedSocPct,
        }),
      })
    } catch (error) {
      throw new AppError('TESLAMATE_UNAVAILABLE', formatTeslaMateUnavailableMessage('charging profile query', error), 503)
    }
  })

  // GET /stats/health/efficiency-by-temperature?days=365
  app.get('/health/efficiency-by-temperature', { schema: { tags: ['stats'] } }, async (req) => {
    const { vehicle, since, days } = await resolveHealthContext(req, 365)
    try {
      const buckets = await teslamate.getEfficiencyByTemperature(vehicle.vin, since)
      const totalDistance = buckets.reduce((acc, b) => acc + b.distanceKm, 0)
      const totalEnergy = buckets.reduce((acc, b) => acc + b.energyKwh, 0)
      const cold = buckets.filter((b) => b.bucketMinC < 5)
      const mild = buckets.filter((b) => b.bucketMinC >= 15 && b.bucketMinC < 30)
      const weighted = (list: typeof buckets) => {
        const km = list.reduce((acc, b) => acc + b.distanceKm, 0)
        const kwh = list.reduce((acc, b) => acc + b.energyKwh, 0)
        return km > 0 ? Math.round((kwh / km) * 1000) : null
      }
      const coldWhPerKm = weighted(cold)
      const mildWhPerKm = weighted(mild)

      return ok({
        periodDays: days,
        buckets,
        overallWhPerKm: totalDistance > 0 ? Math.round((totalEnergy / totalDistance) * 1000) : null,
        coldWhPerKm,
        mildWhPerKm,
        winterPenaltyPct:
          coldWhPerKm != null && mildWhPerKm != null && mildWhPerKm > 0
            ? Math.round(((coldWhPerKm - mildWhPerKm) / mildWhPerKm) * 1000) / 10
            : null,
      })
    } catch (error) {
      throw new AppError('TESLAMATE_UNAVAILABLE', formatTeslaMateUnavailableMessage('efficiency by temperature query', error), 503)
    }
  })

  // GET /stats/health/tire-pressure?days=90
  app.get('/health/tire-pressure', { schema: { tags: ['stats'] } }, async (req) => {
    const { vehicle, settings, since, days } = await resolveHealthContext(req, 90)
    try {
      const rows = await teslamate.getTirePressureHistory(vehicle.vin, since)
      return ok({
        periodDays: days,
        ...buildTirePressureAnalysis(rows, {
          targetBar: settings.tirePressureTargetBar,
          toleranceBar: settings.tirePressureToleranceBar,
        }),
      })
    } catch (error) {
      throw new AppError('TESLAMATE_UNAVAILABLE', formatTeslaMateUnavailableMessage('tire pressure query', error), 503)
    }
  })

  // GET /stats/health/software-updates
  app.get('/health/software-updates', { schema: { tags: ['stats'] } }, async (req) => {
    const token = await requireAuth(req)
    const session = await authService.validateSession(token)
    const vehicle = await getVehicleForRead(session.userId)
    try {
      return ok(await teslamate.getSoftwareUpdates(vehicle.vin))
    } catch (error) {
      throw new AppError('TESLAMATE_UNAVAILABLE', formatTeslaMateUnavailableMessage('software updates query', error), 503)
    }
  })
}
