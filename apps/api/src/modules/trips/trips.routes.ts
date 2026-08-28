import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { VehicleRepository } from '../vehicle/vehicle.repository.js'
import { AuthRepository } from '../auth/auth.repository.js'
import { AuthService } from '../auth/auth.service.js'
import { requireAuth } from '../auth/auth.routes.js'
import { AppError } from '../../common/errors/app-error.js'
import { NotFoundError } from '../../common/errors/app-error.js'
import { ok, paginated } from '../../common/http/response.js'
import { withVehicleAutoBootstrap } from '../vehicle/vehicle-auto-bootstrap.js'
import {
  TeslaMateReadService,
  formatTeslaMateUnavailableMessage,
} from '../../providers/teslamate/teslamate-read.service.js'

const paginationSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(20),
  from: z.string().optional(),
  to: z.string().optional(),
  includeEnergy: z.enum(['true', 'false']).default('true').transform((value) => value === 'true'),
})

export async function tripsRoutes(app: FastifyInstance) {
  const vehicleRepo = new VehicleRepository(app.prisma)
  const authService = new AuthService(new AuthRepository(app.prisma))
  const teslamate = new TeslaMateReadService()

  const getVehicle = async (userId: string) => {
    const v = await vehicleRepo.findActive(userId)
    if (!v) throw new NotFoundError('Vehicle')
    return v
  }

  const getVehicleForRead = (userId: string) => withVehicleAutoBootstrap(app, userId, () => getVehicle(userId))

  // GET /trips
  app.get('/', { schema: { tags: ['trips'] } }, async (req) => {
    const token = await requireAuth(req)
    const session = await authService.validateSession(token)
    const query = paginationSchema.parse(req.query)
    const vehicle = await getVehicleForRead(session.userId)
    try {
      const teslamateTrips = await teslamate.getTrips(vehicle.vin, {
        page: query.page,
        pageSize: query.pageSize,
        from: query.from ? new Date(query.from) : undefined,
        to: query.to ? new Date(query.to) : undefined,
        includeEnergy: query.includeEnergy,
      })
      return paginated(teslamateTrips.trips, teslamateTrips.total, query.page, query.pageSize)
    } catch (error) {
      throw new AppError('TESLAMATE_UNAVAILABLE', formatTeslaMateUnavailableMessage('trips query', error), 503)
    }
  })

  // GET /trips/:id
  app.get('/:id', { schema: { tags: ['trips'] } }, async (req) => {
    const token = await requireAuth(req)
    const session = await authService.validateSession(token)
    const { id } = req.params as { id: string }
    const vehicle = await getVehicleForRead(session.userId)
    try {
      const trip = await teslamate.getTripById(vehicle.vin, id)
      if (!trip) throw new NotFoundError('Trip')
      return ok(trip)
    } catch (error) {
      if (error instanceof NotFoundError) throw error
      throw new AppError('TESLAMATE_UNAVAILABLE', formatTeslaMateUnavailableMessage('trip detail query', error), 503)
    }
  })

  // GET /trips/:id/path
  app.get('/:id/path', { schema: { tags: ['trips'] } }, async (req) => {
    const token = await requireAuth(req)
    const session = await authService.validateSession(token)
    const { id } = req.params as { id: string }
    const vehicle = await getVehicleForRead(session.userId)
    try {
      const trip = await teslamate.getTripById(vehicle.vin, id)
      if (!trip) throw new NotFoundError('Trip')
      const points = await teslamate.getTripPath(vehicle.vin, id)
      return ok(points)
    } catch (error) {
      if (error instanceof NotFoundError) throw error
      throw new AppError('TESLAMATE_UNAVAILABLE', formatTeslaMateUnavailableMessage('trip path query', error), 503)
    }
  })
}
