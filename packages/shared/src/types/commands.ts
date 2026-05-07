export type CommandName =
  | 'lock'
  | 'unlock'
  | 'honk'
  | 'flash'
  | 'climate_start'
  | 'climate_stop'
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
