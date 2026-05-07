export const APP_DEFAULTS = {
  // API
  API_PORT: 3001,
  WEB_PORT: 5173,

  // Eco mode: default TTLs (seconds)
  VEHICLE_STATE_TTL: 60,
  POSITION_TTL_ASLEEP: 300,
  CHARGE_TTL_ACTIVE: 20,
  STATS_TTL: 300,

  // Polling intervals (milliseconds)
  SYNC_INTERVAL_AWAKE: 60_000,      // 1 min when online/driving
  SYNC_INTERVAL_CHARGING: 30_000,   // 30s when charging
  SYNC_INTERVAL_ASLEEP: 600_000,    // 10 min when asleep (minimal cost)

  // Command dedup window (ms)
  COMMAND_DEDUP_WINDOW: 3_000,

  // Automation
  MAX_AUTOMATION_RULES: 20,

  // Pagination
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
} as const
