import type { TeslaAccount } from '@prisma/client'
import type { TeslaClient } from './tesla.client.js'
import type { Redis } from 'ioredis'
import type { CommandName } from '@voltcraft/shared'
import { TeslaApiError } from '../../common/errors/app-error.js'

// Maps our command names to Tesla Fleet API endpoints
const COMMAND_MAP: Record<CommandName, { endpoint: string; body?: (params?: Record<string, unknown>) => Record<string, unknown> }> = {
  lock:              { endpoint: 'door_lock' },
  unlock:            { endpoint: 'door_unlock' },
  honk:              { endpoint: 'honk_horn' },
  flash:             { endpoint: 'flash_lights' },
  sentry_on:         { endpoint: 'set_sentry_mode', body: () => ({ on: true }) },
  sentry_off:        { endpoint: 'set_sentry_mode', body: () => ({ on: false }) },
  homelink:          { endpoint: 'trigger_homelink' },
  trunk_front:       { endpoint: 'actuate_trunk', body: () => ({ which_trunk: 'front' }) },
  trunk_rear:        { endpoint: 'actuate_trunk', body: () => ({ which_trunk: 'rear' }) },
  windows_vent:      { endpoint: 'window_control', body: () => ({ command: 'vent' }) },
  windows_close:     { endpoint: 'window_control', body: (p) => ({ command: 'close', lat: p?.['lat'], lon: p?.['lon'] }) },
  climate_start:     { endpoint: 'auto_conditioning_start' },
  climate_stop:      { endpoint: 'auto_conditioning_stop' },
  set_temperature:   { endpoint: 'set_temps', body: (p) => ({ driver_temp: p?.['driverTemp'], passenger_temp: p?.['passengerTemp'] ?? p?.['driverTemp'] }) },
  set_seat_heater:   { endpoint: 'remote_seat_heater_request', body: (p) => ({ heater: p?.['seat'], level: p?.['level'] }) },
  set_seat_cooler:   { endpoint: 'remote_seat_cooler_request', body: (p) => ({ seat_position: p?.['seat'], seat_cooler_level: p?.['level'] }) },
  steering_wheel_heater_on:  { endpoint: 'remote_steering_wheel_heater_request', body: () => ({ on: true }) },
  steering_wheel_heater_off: { endpoint: 'remote_steering_wheel_heater_request', body: () => ({ on: false }) },
  cabin_overheat_protection_on: {
    endpoint: 'set_cabin_overheat_protection',
    body: (p) => ({ on: true, fan_only: Boolean(p?.['fanOnly']) }),
  },
  cabin_overheat_protection_off: {
    endpoint: 'set_cabin_overheat_protection',
    body: () => ({ on: false }),
  },
  valet_on:          { endpoint: 'set_valet_mode', body: (p) => ({ on: true, password: p?.['pin'] }) },
  valet_off:         { endpoint: 'set_valet_mode', body: () => ({ on: false }) },
  speed_limit_activate:   { endpoint: 'speed_limit_activate', body: (p) => ({ pin: p?.['pin'] }) },
  speed_limit_deactivate: { endpoint: 'speed_limit_deactivate', body: (p) => ({ pin: p?.['pin'] }) },
  speed_limit_clear_pin:  { endpoint: 'speed_limit_clear_pin', body: (p) => ({ pin: p?.['pin'] }) },
  speed_limit_set:        { endpoint: 'speed_limit_set_limit', body: (p) => ({ limit_mph: p?.['limitMph'] }) },
  software_update_schedule: { endpoint: 'schedule_software_update', body: (p) => ({ offset_sec: p?.['offsetSec'] ?? 0 }) },
  software_update_cancel:   { endpoint: 'cancel_software_update' },
  navigation_gps:         { endpoint: 'navigation_gps_request', body: (p) => ({ lat: p?.['lat'], lon: p?.['lon'], order: p?.['order'] }) },
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
