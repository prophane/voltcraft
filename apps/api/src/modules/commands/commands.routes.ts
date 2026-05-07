import type { FastifyInstance } from 'fastify'
import { CommandRepository } from './commands.repository.js'
import { CommandPolicyService } from './command-policy.service.js'
import { VehicleRepository } from '../vehicle/vehicle.repository.js'
import { AuthRepository } from '../auth/auth.repository.js'
import { AuthService } from '../auth/auth.service.js'
import { TeslaCommandService } from '../../providers/tesla/tesla-command.service.js'
import { TeslaClient } from '../../providers/tesla/tesla.client.js'
import { requireAuth } from '../auth/auth.routes.js'
import { chargeLimitSchema } from './commands.schemas.js'
import { ok } from '../../common/http/response.js'

export async function commandsRoutes(app: FastifyInstance) {
  const vehicleRepo = new VehicleRepository(app.prisma)
  const commandRepo = new CommandRepository(app.prisma)
  const teslaClient = new TeslaClient(app.prisma, app.redis)
  const teslaCommands = new TeslaCommandService(teslaClient, app.redis)
  const authService = new AuthService(new AuthRepository(app.prisma))
  const policy = new CommandPolicyService(app.redis, vehicleRepo, commandRepo, teslaCommands)

  // Helper to authenticate and run a command
  const run = async (req: Parameters<typeof requireAuth>[0], command: Parameters<typeof policy.execute>[1], params?: Record<string, unknown>) => {
    const token = await requireAuth(req)
    const session = await authService.validateSession(token)
    return policy.execute(session.userId, command, params)
  }

  app.post('/lock', { schema: { tags: ['commands'] } }, async (req) => ok(await run(req, 'lock')))
  app.post('/unlock', { schema: { tags: ['commands'] } }, async (req) => ok(await run(req, 'unlock')))
  app.post('/honk', { schema: { tags: ['commands'] } }, async (req) => ok(await run(req, 'honk')))
  app.post('/flash', { schema: { tags: ['commands'] } }, async (req) => ok(await run(req, 'flash')))
  app.post('/climate/start', { schema: { tags: ['commands'] } }, async (req) => ok(await run(req, 'climate_start')))
  app.post('/climate/stop', { schema: { tags: ['commands'] } }, async (req) => ok(await run(req, 'climate_stop')))
  app.post('/charge/start', { schema: { tags: ['commands'] } }, async (req) => ok(await run(req, 'charge_start')))
  app.post('/charge/stop', { schema: { tags: ['commands'] } }, async (req) => ok(await run(req, 'charge_stop')))
  app.post('/wake', { schema: { tags: ['commands'] } }, async (req) => ok(await run(req, 'wake')))

  app.post('/charge-limit', { schema: { tags: ['commands'] } }, async (req) => {
    const { percent } = chargeLimitSchema.parse(req.body)
    return ok(await run(req, 'set_charge_limit', { percent }))
  })

  // ── Command history ──────────────────────────────────────────
  app.get('/history', { schema: { tags: ['commands'] } }, async (req) => {
    const token = await requireAuth(req)
    const session = await authService.validateSession(token)
    const vehicle = await vehicleRepo.findActive(session.userId)
    if (!vehicle) return ok([])
    const logs = await commandRepo.getRecent(vehicle.id)
    return ok(logs)
  })
}
