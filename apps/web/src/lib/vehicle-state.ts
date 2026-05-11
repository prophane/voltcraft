/** Vehicle composed state - single source of truth for vehicle status */

export const VEHICLE_STATES = {
  DRIVING: 'driving' as const,
  CHARGING: 'charging' as const,
  PLUGGED: 'plugged' as const,
  PARKED: 'parked' as const,
  ONLINE: 'online' as const,
  ASLEEP: 'asleep' as const,
  OFFLINE: 'offline' as const,
  UNKNOWN: 'unknown' as const,
} as const

export type VehicleComposedState = typeof VEHICLE_STATES[keyof typeof VEHICLE_STATES]

export interface VehicleStateInput {
  isDriving?: boolean | null
  isCharging?: boolean | null
  isPluggedIn?: boolean | null
  vehicleState?: string | null
}

/**
 * Derive a single, unambiguous vehicle state from Tesla state fields
 * Priority order: Driving > Charging > Plugged > Parked > Online > Asleep > Offline > Unknown
 */
export function getVehicleComposedState(input: VehicleStateInput): VehicleComposedState {
  const { isDriving, isCharging, isPluggedIn, vehicleState } = input

  // 1. If driving, always report driving (highest priority)
  if (isDriving === true) return VEHICLE_STATES.DRIVING

  // 2. If actively charging
  if (isCharging === true) return VEHICLE_STATES.CHARGING

  // 3. If plugged but not charging, report plugged before parked
  if (isPluggedIn === true && isCharging === false) return VEHICLE_STATES.PLUGGED

  // 4. If stationary and not charging, report parked
  if (isDriving === false && isCharging === false) {
    return VEHICLE_STATES.PARKED
  }

  // 5. Fall back to vehicle.state if available
  if (vehicleState === 'charging') return VEHICLE_STATES.CHARGING
  if (vehicleState === 'driving') return VEHICLE_STATES.DRIVING
  if (vehicleState === 'online') return VEHICLE_STATES.ONLINE
  if (vehicleState === 'asleep') return VEHICLE_STATES.ASLEEP
  if (vehicleState === 'offline') return VEHICLE_STATES.OFFLINE

  // 6. Default to unknown
  return VEHICLE_STATES.UNKNOWN
}

/** French labels for UI display */
export const VEHICLE_STATE_LABELS: Record<VehicleComposedState, string> = {
  driving: 'En conduite',
  charging: 'En charge',
  plugged: 'Branché',
  parked: 'Stationné',
  online: 'En ligne',
  asleep: 'En veille',
  offline: 'Hors ligne',
  unknown: 'État inconnu',
}

/** Tones for styling (tailwind classes) */
export const VEHICLE_STATE_TONES: Record<VehicleComposedState, string> = {
  driving: 'text-warning border-warning/30 bg-warning/10',
  charging: 'text-success border-success/30 bg-success/10',
  plugged: 'text-accent-500/70 border-accent-500/30 bg-accent-500/10',
  parked: 'text-text-secondary border-border-subtle bg-bg-overlay/60',
  online: 'text-text-secondary border-border-subtle bg-bg-overlay/60',
  asleep: 'text-text-muted border-border-subtle bg-bg-overlay/40',
  offline: 'text-warning border-warning/30 bg-warning/10',
  unknown: 'text-text-muted border-border-subtle bg-bg-overlay/70',
}

/** Icons mapping */
export const VEHICLE_STATE_ICONS: Record<VehicleComposedState, string> = {
  driving: 'MoveRight',
  charging: 'Zap',
  plugged: 'Plug',
  parked: 'Pause',
  online: 'Cloud',
  asleep: 'Moon',
  offline: 'AlertTriangle',
  unknown: 'HelpCircle',
}
