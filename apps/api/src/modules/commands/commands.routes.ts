import type { FastifyInstance } from 'fastify'
import { CommandRepository } from './commands.repository.js'
import { CommandPolicyService } from './command-policy.service.js'
import { VehicleRepository } from '../vehicle/vehicle.repository.js'
import { AuthRepository } from '../auth/auth.repository.js'
import { AuthService } from '../auth/auth.service.js'
import { TeslaCommandService } from '../../providers/tesla/tesla-command.service.js'
import { TeslaClient } from '../../providers/tesla/tesla.client.js'
import { requireAuth } from '../auth/auth.routes.js'
import {
  cabinOverheatProtectionSchema,
  chargeLimitSchema,
  navigationGpsSchema,
  pinSchema,
  seatLevelSchema,
  setTemperatureSchema,
  softwareUpdateScheduleSchema,
  speedLimitSetSchema,
  valetSchema,
  windowCloseSchema,
} from './commands.schemas.js'
import { ok } from '../../common/http/response.js'
import { withVehicleAutoBootstrap } from '../vehicle/vehicle-auto-bootstrap.js'

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
    return withVehicleAutoBootstrap(app, () => policy.execute(session.userId, command, params))
  }

  app.post('/lock', { schema: { tags: ['commands'] } }, async (req) => ok(await run(req, 'lock')))
  app.post('/unlock', { schema: { tags: ['commands'] } }, async (req) => ok(await run(req, 'unlock')))
  app.post('/honk', { schema: { tags: ['commands'] } }, async (req) => ok(await run(req, 'honk')))
  app.post('/flash', { schema: { tags: ['commands'] } }, async (req) => ok(await run(req, 'flash')))

  // Security / access
  app.post('/security/sentry/on', { schema: { tags: ['commands'] } }, async (req) => ok(await run(req, 'sentry_on')))
  app.post('/security/sentry/off', { schema: { tags: ['commands'] } }, async (req) => ok(await run(req, 'sentry_off')))
  app.post('/security/valet/on', { schema: { tags: ['commands'] } }, async (req) => {
    const { pin } = valetSchema.parse(req.body ?? {})
    return ok(await run(req, 'valet_on', { pin }))
  })
  app.post('/security/valet/off', { schema: { tags: ['commands'] } }, async (req) => ok(await run(req, 'valet_off')))

  app.post('/security/speed-limit/activate', { schema: { tags: ['commands'] } }, async (req) => {
    const { pin } = pinSchema.parse(req.body)
    return ok(await run(req, 'speed_limit_activate', { pin }))
  })
  app.post('/security/speed-limit/deactivate', { schema: { tags: ['commands'] } }, async (req) => {
    const { pin } = pinSchema.parse(req.body)
    return ok(await run(req, 'speed_limit_deactivate', { pin }))
  })
  app.post('/security/speed-limit/clear-pin', { schema: { tags: ['commands'] } }, async (req) => {
    const { pin } = pinSchema.parse(req.body)
    return ok(await run(req, 'speed_limit_clear_pin', { pin }))
  })
  app.post('/security/speed-limit/set', { schema: { tags: ['commands'] } }, async (req) => {
    const { limitMph } = speedLimitSetSchema.parse(req.body)
    return ok(await run(req, 'speed_limit_set', { limitMph }))
  })

  app.post('/access/homelink', { schema: { tags: ['commands'] } }, async (req) => ok(await run(req, 'homelink')))
  app.post('/access/trunk/front', { schema: { tags: ['commands'] } }, async (req) => ok(await run(req, 'trunk_front')))
  app.post('/access/trunk/rear', { schema: { tags: ['commands'] } }, async (req) => ok(await run(req, 'trunk_rear')))
  app.post('/access/windows/vent', { schema: { tags: ['commands'] } }, async (req) => ok(await run(req, 'windows_vent')))
  app.post('/access/windows/close', { schema: { tags: ['commands'] } }, async (req) => {
    const payload = windowCloseSchema.parse(req.body ?? {})
    return ok(await run(req, 'windows_close', payload))
  })

  app.post('/climate/start', { schema: { tags: ['commands'] } }, async (req) => ok(await run(req, 'climate_start')))
  app.post('/climate/stop', { schema: { tags: ['commands'] } }, async (req) => ok(await run(req, 'climate_stop')))
  app.post('/climate/temperature', { schema: { tags: ['commands'] } }, async (req) => {
    const payload = setTemperatureSchema.parse(req.body)
    return ok(await run(req, 'set_temperature', payload))
  })
  app.post('/climate/seat-heater', { schema: { tags: ['commands'] } }, async (req) => {
    const payload = seatLevelSchema.parse(req.body)
    return ok(await run(req, 'set_seat_heater', payload))
  })
  app.post('/climate/seat-cooler', { schema: { tags: ['commands'] } }, async (req) => {
    const payload = seatLevelSchema.parse(req.body)
    return ok(await run(req, 'set_seat_cooler', payload))
  })
  app.post('/climate/steering-wheel-heater/on', { schema: { tags: ['commands'] } }, async (req) => ok(await run(req, 'steering_wheel_heater_on')))
  app.post('/climate/steering-wheel-heater/off', { schema: { tags: ['commands'] } }, async (req) => ok(await run(req, 'steering_wheel_heater_off')))
  app.post('/climate/cabin-overheat-protection/on', { schema: { tags: ['commands'] } }, async (req) => {
    const { fanOnly } = cabinOverheatProtectionSchema.parse({ ...(req.body as Record<string, unknown> | undefined), on: true })
    return ok(await run(req, 'cabin_overheat_protection_on', { fanOnly }))
  })
  app.post('/climate/cabin-overheat-protection/off', { schema: { tags: ['commands'] } }, async (req) => {
    cabinOverheatProtectionSchema.parse({ ...(req.body as Record<string, unknown> | undefined), on: false })
    return ok(await run(req, 'cabin_overheat_protection_off'))
  })
  app.post('/charge/start', { schema: { tags: ['commands'] } }, async (req) => ok(await run(req, 'charge_start')))
  app.post('/charge/stop', { schema: { tags: ['commands'] } }, async (req) => ok(await run(req, 'charge_stop')))
  app.post('/wake', { schema: { tags: ['commands'] } }, async (req) => ok(await run(req, 'wake')))

  app.post('/software-update/schedule', { schema: { tags: ['commands'] } }, async (req) => {
    const payload = softwareUpdateScheduleSchema.parse(req.body ?? {})
    return ok(await run(req, 'software_update_schedule', payload))
  })
  app.post('/software-update/cancel', { schema: { tags: ['commands'] } }, async (req) => ok(await run(req, 'software_update_cancel')))

  app.post('/navigation/gps', { schema: { tags: ['commands'] } }, async (req) => {
    const payload = navigationGpsSchema.parse(req.body)
    return ok(await run(req, 'navigation_gps', payload))
  })

  app.post('/charge-limit', { schema: { tags: ['commands'] } }, async (req) => {
    const { percent } = chargeLimitSchema.parse(req.body)
    return ok(await run(req, 'set_charge_limit', { percent }))
  })

  // ── Command history ──────────────────────────────────────────
  app.get('/history', { schema: { tags: ['commands'] } }, async (req) => {
    const token = await requireAuth(req)
    const session = await authService.validateSession(token)
    const vehicle = await withVehicleAutoBootstrap(app, () => vehicleRepo.findActive(session.userId))
    if (!vehicle) return ok([])
    const logs = await commandRepo.getRecent(vehicle.id)
    return ok(logs)
  })
}
