import type { TeslaAccount } from '@prisma/client'
import type { TeslaClient } from './tesla.client.js'
import type Redis from 'ioredis'
import type { CommandName } from '@voltcraft/shared'
import { TeslaApiError } from '../../common/errors/app-error.js'

// Maps our command names to Tesla Fleet API endpoints
const COMMAND_MAP: Record<CommandName, { endpoint: string; body?: (params?: Record<string, unknown>) => Record<string, unknown> }> = {
  lock:              { endpoint: 'door_lock' },
  unlock:            { endpoint: 'door_unlock' },
  honk:              { endpoint: 'honk_horn' },
  flash:             { endpoint: 'flash_lights' },
  climate_start:     { endpoint: 'auto_conditioning_start' },
  climate_stop:      { endpoint: 'auto_conditioning_stop' },
  charge_start:      { endpoint: 'charge_start' },
  charge_stop:       { endpoint: 'charge_stop' },
  set_charge_limit:  { endpoint: 'set_charge_limit', body: (p) => ({ percent: p?.['percent'] }) },
  wake:              { endpoint: '__wake__' }, // special handling
}

export class TeslaCommandService {
  constructor(
    private readonly client: TeslaClient,
    private readonly redis: Redis,
  ) {}

  async send(
    vin: string,
    account: TeslaAccount,
    command: CommandName,
    params?: Record<string, unknown>,
  ): Promise<void> {
    const mapping = COMMAND_MAP[command]
    if (!mapping) throw new TeslaApiError(`Unknown command: ${command}`)

    if (mapping.endpoint === '__wake__') {
      await this.client.wakeVehicle(account, vin)
      return
    }

    const body = mapping.body ? mapping.body(params) : undefined
    await this.client.sendCommand(account, vin, mapping.endpoint, body)
  }
}
