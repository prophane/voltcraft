export type CommandName =
  | 'lock'
  | 'unlock'
  | 'honk'
  | 'flash'
  | 'sentry_on'
  | 'sentry_off'
  | 'homelink'
  | 'trunk_front'
  | 'trunk_rear'
  | 'windows_vent'
  | 'windows_close'
  | 'climate_start'
  | 'climate_stop'
  | 'set_temperature'
  | 'set_seat_heater'
  | 'set_seat_cooler'
  | 'steering_wheel_heater_on'
  | 'steering_wheel_heater_off'
  | 'cabin_overheat_protection_on'
  | 'cabin_overheat_protection_off'
  | 'valet_on'
  | 'valet_off'
  | 'speed_limit_activate'
  | 'speed_limit_deactivate'
  | 'speed_limit_clear_pin'
  | 'speed_limit_set'
  | 'software_update_schedule'
  | 'software_update_cancel'
  | 'navigation_gps'
  | 'charge_start'
  | 'charge_stop'
  | 'set_charge_limit'
  | 'wake'

export type CommandStatus = 'pending' | 'success' | 'failed' | 'rejected'

export interface CommandRequest {
  command: CommandName
  params?: Record<string, unknown>
}

export interface CommandResult {
  id: string
  command: CommandName
  status: CommandStatus
  executedAt: string // ISO
  error?: string
}
