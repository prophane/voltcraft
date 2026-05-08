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

  // ── GET /vehicle/current ──────────────────────────────────────
  app.get('/current', { schema: { tags: ['vehicle'] } }, async (req) => {
    const token = await requireAuth(req)
    const session = await authService.validateSession(token)
    const vehicle = await withVehicleAutoBootstrap(app, () => service.getCurrentVehicle(session.userId))
    return ok(vehicle)
  })

  // ── GET /vehicle/state ────────────────────────────────────────
  app.get('/state', { schema: { tags: ['vehicle'] } }, async (req) => {
    const token = await requireAuth(req)
    const session = await authService.validateSession(token)
    const state = await withVehicleAutoBootstrap(app, () => service.getVehicleState(session.userId))
    return ok(state)
  })

  // ── GET /vehicle/location ─────────────────────────────────────
  app.get('/location', { schema: { tags: ['vehicle'] } }, async (req) => {
    const token = await requireAuth(req)
    const session = await authService.validateSession(token)
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
