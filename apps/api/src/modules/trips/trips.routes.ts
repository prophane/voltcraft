import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { TripsRepository } from './trips.repository.js'
import { VehicleRepository } from '../vehicle/vehicle.repository.js'
import { AuthRepository } from '../auth/auth.repository.js'
import { AuthService } from '../auth/auth.service.js'
import { requireAuth } from '../auth/auth.routes.js'
import { AppError } from '../../common/errors/app-error.js'
import { NotFoundError } from '../../common/errors/app-error.js'
import { ok, paginated } from '../../common/http/response.js'
import { withVehicleAutoBootstrap } from '../vehicle/vehicle-auto-bootstrap.js'
import { TeslaMateReadService } from '../../providers/teslamate/teslamate-read.service.js'

const paginationSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(20),
  from: z.string().optional(),
  to: z.string().optional(),
})

export async function tripsRoutes(app: FastifyInstance) {
  const tripsRepo = new TripsRepository(app.prisma)
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

  // GET /trips
  app.get('/', { schema: { tags: ['trips'] } }, async (req) => {
    const token = await requireAuth(req)
    const session = await authService.validateSession(token)
    const query = paginationSchema.parse(req.query)
    const vehicle = await getVehicleForRead(session.userId)
    if (teslamate.isEnabled()) {
      const teslamateTrips = await teslamate.getTrips(vehicle.vin, {
        page: query.page,
        pageSize: query.pageSize,
        from: query.from ? new Date(query.from) : undefined,
        to: query.to ? new Date(query.to) : undefined,
      })
      if (teslamateTrips) {
        return paginated(teslamateTrips.trips, teslamateTrips.total, query.page, query.pageSize)
      }
      throw new AppError('TESLAMATE_UNAVAILABLE', 'TeslaMate trips query failed', 503)
    }
    const { trips, total } = await tripsRepo.findMany(vehicle.id, {
      page: query.page,
      pageSize: query.pageSize,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
    })
    return paginated(trips, total, query.page, query.pageSize)
  })

  // GET /trips/:id
  app.get('/:id', { schema: { tags: ['trips'] } }, async (req) => {
    const token = await requireAuth(req)
    const session = await authService.validateSession(token)
    const { id } = req.params as { id: string }
    const vehicle = await getVehicleForRead(session.userId)
    if (teslamate.isEnabled()) {
      const trip = await teslamate.getTripById(vehicle.vin, id)
      if (trip) return ok(trip)
    }
    const trip = await tripsRepo.findById(id, vehicle.id)
    if (!trip) throw new NotFoundError('Trip')
    return ok(trip)
  })

  // GET /trips/:id/path
  app.get('/:id/path', { schema: { tags: ['trips'] } }, async (req) => {
    const token = await requireAuth(req)
    const session = await authService.validateSession(token)
    const { id } = req.params as { id: string }
    const vehicle = await getVehicleForRead(session.userId)
    if (teslamate.isEnabled()) {
      const trip = await teslamate.getTripById(vehicle.vin, id)
      if (trip) {
        const points = await teslamate.getTripPath(vehicle.vin, id)
        return ok(points)
      }
    }

    const trip = await tripsRepo.findById(id, vehicle.id)
    if (!trip) throw new NotFoundError('Trip')
    const points = await tripsRepo.findPathPoints(vehicle.id, trip.startedAt, trip.endedAt ?? new Date())
    return ok(points)
  })
}
