import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { StatsRepository } from './stats.repository.js'
import { VehicleRepository } from '../vehicle/vehicle.repository.js'
import { AuthRepository } from '../auth/auth.repository.js'
import { AuthService } from '../auth/auth.service.js'
import { requireAuth } from '../auth/auth.routes.js'
import { NotFoundError } from '../../common/errors/app-error.js'
import { calcAvgConsumption } from './calculators/summary.calculator.js'
import { ok } from '../../common/http/response.js'
import { withVehicleAutoBootstrap } from '../vehicle/vehicle-auto-bootstrap.js'

const periodSchema = z.object({
  days: z.coerce.number().min(1).max(365).default(30),
})

export async function statsRoutes(app: FastifyInstance) {
  const statsRepo = new StatsRepository(app.prisma)
  const vehicleRepo = new VehicleRepository(app.prisma)
  const authService = new AuthService(new AuthRepository(app.prisma))

  const getVehicle = async (userId: string) => {
    const v = await vehicleRepo.findActive(userId)
    if (!v) throw new NotFoundError('Vehicle')
    return v
  }

  // GET /stats/summary?days=30
  app.get('/summary', { schema: { tags: ['stats'] } }, async (req) => {
    const token = await requireAuth(req)
    const session = await authService.validateSession(token)
    const { days } = periodSchema.parse(req.query)
    const since = new Date(Date.now() - days * 86_400_000)
    const vehicle = await withVehicleAutoBootstrap(app, () => getVehicle(session.userId))

    const [distanceKm, energyKwh, cost, tripsCount, chargesCount] = await Promise.all([
      statsRepo.getDistanceSum(vehicle.id, since),
      statsRepo.getEnergySum(vehicle.id, since),
      statsRepo.getCostSum(vehicle.id, since),
      statsRepo.getTripsCount(vehicle.id, since),
      statsRepo.getChargesCount(vehicle.id, since),
    ])

    return ok({
      periodDays: days,
      distanceKm: Math.round(distanceKm * 10) / 10,
      energyAddedKwh: Math.round(energyKwh * 10) / 10,
      estimatedCostEur: Math.round(cost * 100) / 100,
      avgConsumptionKwhPer100km: calcAvgConsumption(energyKwh, distanceKm),
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
    const vehicle = await withVehicleAutoBootstrap(app, () => getVehicle(session.userId))
    const trend = await statsRepo.getDailyBatteryTrend(vehicle.id, since)
    return ok(trend)
  })

  // GET /stats/efficiency?days=30
  app.get('/efficiency', { schema: { tags: ['stats'] } }, async (req) => {
    const token = await requireAuth(req)
    const session = await authService.validateSession(token)
    const { days } = periodSchema.parse(req.query)
    const since = new Date(Date.now() - days * 86_400_000)
    const vehicle = await withVehicleAutoBootstrap(app, () => getVehicle(session.userId))
    const metrics = await statsRepo.getDailyTripMetrics(vehicle.id, since)
    return ok(metrics)
  })
}
