// Vehicle states
export const VEHICLE_STATE = {
  ONLINE: 'online',
  ASLEEP: 'asleep',
  OFFLINE: 'offline',
  CHARGING: 'charging',
  DRIVING: 'driving',
  UPDATING: 'updating',
} as const

export type VehicleState = (typeof VEHICLE_STATE)[keyof typeof VEHICLE_STATE]

// Charge states
export const CHARGE_STATE = {
  CHARGING: 'Charging',
  COMPLETE: 'Complete',
  STOPPED: 'Stopped',
  DISCONNECTED: 'Disconnected',
  NO_POWER: 'NoPower',
} as const

export type ChargeState = (typeof CHARGE_STATE)[keyof typeof CHARGE_STATE]

// Automation trigger types
export const AUTOMATION_TRIGGER = {
  SCHEDULE_RECURRING: 'schedule_recurring',
  SCHEDULE_ONCE: 'schedule_once',
  ARRIVE_HOME: 'arrive_home',
  BATTERY_BELOW: 'battery_below',
  BATTERY_ABOVE: 'battery_above',
  CHARGING_COMPLETE: 'charging_complete',
} as const

export type AutomationTrigger = (typeof AUTOMATION_TRIGGER)[keyof typeof AUTOMATION_TRIGGER]

// Automation action types
export const AUTOMATION_ACTION = {
  START_CLIMATE: 'start_climate',
  STOP_CLIMATE: 'stop_climate',
  SET_CHARGE_LIMIT: 'set_charge_limit',
  START_CHARGE: 'start_charge',
  STOP_CHARGE: 'stop_charge',
  NOTIFY: 'notify',
} as const

export type AutomationAction = (typeof AUTOMATION_ACTION)[keyof typeof AUTOMATION_ACTION]

// Default cache TTL values (in seconds)
export const CACHE_TTL = {
  VEHICLE_STATE: 60,
  POSITION_ASLEEP: 300,
  POSITION_AWAKE: 30,
  CHARGE_ACTIVE: 20,
  STATS: 300,
  SETTINGS: 600,
} as const

// Default units
export const UNIT_DISTANCE = {
  KM: 'km',
  MILES: 'miles',
} as const

export const UNIT_TEMPERATURE = {
  CELSIUS: 'celsius',
  FAHRENHEIT: 'fahrenheit',
} as const
