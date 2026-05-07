import type { FastifyInstance } from 'fastify'
import { AutomationsRepository } from './automations.repository.js'
import { VehicleRepository } from '../vehicle/vehicle.repository.js'
import { AuthRepository } from '../auth/auth.repository.js'
import { AuthService } from '../auth/auth.service.js'
import { requireAuth } from '../auth/auth.routes.js'
import { NotFoundError } from '../../common/errors/app-error.js'
import { createAutomationSchema, updateAutomationSchema } from './automations.schemas.js'
import { ok } from '../../common/http/response.js'

export async function automationsRoutes(app: FastifyInstance) {
  const repo = new AutomationsRepository(app.prisma)
  const vehicleRepo = new VehicleRepository(app.prisma)
  const authService = new AuthService(new AuthRepository(app.prisma))

  const getVehicle = async (userId: string) => {
    const v = await vehicleRepo.findActive(userId)
    if (!v) throw new NotFoundError('Vehicle')
    return v
  }

  // GET /automations
  app.get('/', { schema: { tags: ['automations'] } }, async (req) => {
    const token = await requireAuth(req)
    const session = await authService.validateSession(token)
    const vehicle = await getVehicle(session.userId)
    return ok(await repo.findAll(vehicle.id))
  })

  // POST /automations
  app.post('/', { schema: { tags: ['automations'] } }, async (req, reply) => {
    const token = await requireAuth(req)
    const session = await authService.validateSession(token)
    const input = createAutomationSchema.parse(req.body)
    const vehicle = await getVehicle(session.userId)
    const rule = await repo.create(vehicle.id, input)
    return reply.status(201).send(ok(rule))
  })

  // PATCH /automations/:id
  app.patch('/:id', { schema: { tags: ['automations'] } }, async (req) => {
    const token = await requireAuth(req)
    const session = await authService.validateSession(token)
    const { id } = req.params as { id: string }
    const input = updateAutomationSchema.parse(req.body)
    const vehicle = await getVehicle(session.userId)
    const existing = await repo.findById(id, vehicle.id)
    if (!existing) throw new NotFoundError('Automation rule')
    return ok(await repo.update(id, input))
  })

  // DELETE /automations/:id
  app.delete('/:id', { schema: { tags: ['automations'] } }, async (req, reply) => {
    const token = await requireAuth(req)
    const session = await authService.validateSession(token)
    const { id } = req.params as { id: string }
    const vehicle = await getVehicle(session.userId)
    const existing = await repo.findById(id, vehicle.id)
    if (!existing) throw new NotFoundError('Automation rule')
    await repo.softDelete(id)
    return reply.status(204).send()
  })

  // GET /automations/:id/executions
  app.get('/:id/executions', { schema: { tags: ['automations'] } }, async (req) => {
    const token = await requireAuth(req)
    const session = await authService.validateSession(token)
    const { id } = req.params as { id: string }
    const vehicle = await getVehicle(session.userId)
    const existing = await repo.findById(id, vehicle.id)
    if (!existing) throw new NotFoundError('Automation rule')
    return ok(await repo.getExecutions(id))
  })
}
