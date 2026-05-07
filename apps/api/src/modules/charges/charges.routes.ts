import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { ChargesRepository } from './charges.repository.js'
import { VehicleRepository } from '../vehicle/vehicle.repository.js'
import { AuthRepository } from '../auth/auth.repository.js'
import { AuthService } from '../auth/auth.service.js'
import { requireAuth } from '../auth/auth.routes.js'
import { NotFoundError } from '../../common/errors/app-error.js'
import { ok, paginated } from '../../common/http/response.js'

const paginationSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(20),
  from: z.string().optional(),
  to: z.string().optional(),
})

const monthlySummarySchema = z.object({
  year: z.coerce.number().min(2020).max(2100),
  month: z.coerce.number().min(1).max(12),
})

export async function chargesRoutes(app: FastifyInstance) {
  const chargesRepo = new ChargesRepository(app.prisma)
  const vehicleRepo = new VehicleRepository(app.prisma)
  const authService = new AuthService(new AuthRepository(app.prisma))

  const getVehicle = async (userId: string) => {
    const v = await vehicleRepo.findActive(userId)
    if (!v) throw new NotFoundError('Vehicle')
    return v
  }

  app.get('/', { schema: { tags: ['charges'] } }, async (req) => {
    const token = await requireAuth(req)
    const session = await authService.validateSession(token)
    const query = paginationSchema.parse(req.query)
    const vehicle = await getVehicle(session.userId)
    const { sessions, total } = await chargesRepo.findMany(vehicle.id, {
      page: query.page,
      pageSize: query.pageSize,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
    })
    return paginated(sessions, total, query.page, query.pageSize)
  })

  app.get('/:id', { schema: { tags: ['charges'] } }, async (req) => {
    const token = await requireAuth(req)
    const session = await authService.validateSession(token)
    const { id } = req.params as { id: string }
    const vehicle = await getVehicle(session.userId)
    const session_ = await chargesRepo.findById(id, vehicle.id)
    if (!session_) throw new NotFoundError('Charge session')
    return ok(session_)
  })

  app.get('/summary/monthly', { schema: { tags: ['charges'] } }, async (req) => {
    const token = await requireAuth(req)
    const sess = await authService.validateSession(token)
    const now = new Date()
    const { year, month } = monthlySummarySchema.parse({
      year: (req.query as Record<string, string>)['year'] ?? now.getFullYear(),
      month: (req.query as Record<string, string>)['month'] ?? now.getMonth() + 1,
    })
    const vehicle = await getVehicle(sess.userId)
    const summary = await chargesRepo.getMonthlySummary(vehicle.id, year, month)
    return ok(summary)
  })
}
