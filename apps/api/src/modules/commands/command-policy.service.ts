import type { CommandName } from '@voltcraft/shared'
import type { CommandRepository } from './commands.repository.js'
import type { TeslaCommandService } from '../../providers/tesla/tesla-command.service.js'
import type { VehicleRepository } from '../vehicle/vehicle.repository.js'
import type Redis from 'ioredis'
import { NotFoundError, RateLimitError, VehicleAsleepError } from '../../common/errors/app-error.js'
import { APP_DEFAULTS } from '@voltcraft/shared'

export class CommandPolicyService {
  constructor(
    private readonly redis: Redis,
    private readonly vehicleRepo: VehicleRepository,
    private readonly commandRepo: CommandRepository,
    private readonly teslaCommands: TeslaCommandService,
  ) {}

  /**
   * Execute a command with:
   * - dedup guard (no spam on rapid clicks)
   * - vehicle sleep check (no implicit wake except "wake" command)
   * - command log
   */
  async execute(
    userId: string,
    command: CommandName,
    params?: Record<string, unknown>,
  ) {
    const vehicle = await this.vehicleRepo.findActive(userId)
    if (!vehicle) throw new NotFoundError('Vehicle')

    // ── Anti-spam dedup ──────────────────────────────────────
    const dedupKey = `cmd:dedup:${vehicle.id}:${command}`
    const alreadyRunning = await this.redis.set(dedupKey, '1', 'PX', APP_DEFAULTS.COMMAND_DEDUP_WINDOW, 'NX')
    if (!alreadyRunning) throw new RateLimitError('Command already in progress, please wait')

    // ── Sleep policy ─────────────────────────────────────────
    const snapshot = await this.vehicleRepo.getLatestSnapshot(vehicle.id)
    const isAsleep = snapshot?.vehicleState === 'asleep' || snapshot?.vehicleState === 'offline'
    if (isAsleep && command !== 'wake') {
      throw new VehicleAsleepError()
    }

    // ── Log & execute ─────────────────────────────────────────
    const log = await this.commandRepo.logCommand(vehicle.id, command, params)
    try {
      await this.teslaCommands.send(vehicle.vin, vehicle.teslaAccount, command, params)
      await this.commandRepo.resolveCommand(log.id, true)
      return { id: log.id, command, status: 'success' as const }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      await this.commandRepo.resolveCommand(log.id, false, msg)
      throw err
    }
  }
}
