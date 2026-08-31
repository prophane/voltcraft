import { api } from '@/lib/api-client'
import type { VehicleStateSnapshot, VehicleSummary } from '@voltcraft/shared'

type TeslaRegion = 'na' | 'eu' | 'cn'

export interface TeslaConnectionStatus {
  connected: boolean
  tokenConfigured: boolean
  accountConfigured: boolean
  oauthConfigured: boolean
  region: TeslaRegion
  dbVehicleCount: number
  apiVehicleCount?: number
  apiReachable: boolean
  partnerPublicKeyConfigured: boolean
  partnerPublicKeyUrl?: string
  partnerRegistrationRequired?: boolean
  virtualKeyInstallUrl?: string
  httpStatus?: number
  error?: string
}

export interface VehicleHistorySnapshot extends VehicleStateSnapshot {
  id: string
  vehicleState: string
  odometer: number | null
  source?: 'POLL' | 'WEBHOOK' | 'COMMAND' | 'MANUAL'
  createdAt?: string
  updatedAt?: string
}

export const vehicleApi = {
  getCurrent: () => api.get<VehicleSummary>('/vehicle/current'),
  getState: () => api.get<VehicleStateSnapshot & { isCached: boolean }>('/vehicle/state'),
  getLocation: () => api.get<{ latitude: number; longitude: number; heading: number; capturedAt: string } | null>('/vehicle/location'),
  getHistory: (page = 1, pageSize = 200, from?: string, to?: string) => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    return api.get<VehicleHistorySnapshot[]>(`/vehicle/history?${params}`)
  },
  sync: () => api.post('/vehicle/sync'),
}

export const commandsApi = {
  lock: () => api.post('/commands/lock'),
  unlock: () => api.post('/commands/unlock'),
  honk: () => api.post('/commands/honk'),
  flash: () => api.post('/commands/flash'),
  sentryOn: () => api.post('/commands/security/sentry/on'),
  sentryOff: () => api.post('/commands/security/sentry/off'),
  valetOn: (pin?: string) => api.post('/commands/security/valet/on', pin ? { pin } : {}),
  valetOff: () => api.post('/commands/security/valet/off'),
  speedLimitActivate: (pin: string) => api.post('/commands/security/speed-limit/activate', { pin }),
  speedLimitDeactivate: (pin: string) => api.post('/commands/security/speed-limit/deactivate', { pin }),
  speedLimitClearPin: (pin: string) => api.post('/commands/security/speed-limit/clear-pin', { pin }),
  speedLimitSet: (limitMph: number) => api.post('/commands/security/speed-limit/set', { limitMph }),
  homelink: () => api.post('/commands/access/homelink'),
  trunkFront: () => api.post('/commands/access/trunk/front'),
  trunkRear: () => api.post('/commands/access/trunk/rear'),
  windowsVent: () => api.post('/commands/access/windows/vent'),
  windowsClose: (lat?: number, lon?: number) => api.post('/commands/access/windows/close', { lat, lon }),
  climateStart: () => api.post('/commands/climate/start'),
  climateStop: () => api.post('/commands/climate/stop'),
  setTemperature: (driverTemp: number, passengerTemp?: number) => api.post('/commands/climate/temperature', { driverTemp, passengerTemp }),
  setSeatHeater: (seat: number, level: number) => api.post('/commands/climate/seat-heater', { seat, level }),
  setSeatCooler: (seat: number, level: number) => api.post('/commands/climate/seat-cooler', { seat, level }),
  steeringWheelHeaterOn: () => api.post('/commands/climate/steering-wheel-heater/on'),
  steeringWheelHeaterOff: () => api.post('/commands/climate/steering-wheel-heater/off'),
  cabinOverheatProtectionOn: (fanOnly = false) => api.post('/commands/climate/cabin-overheat-protection/on', { fanOnly }),
  cabinOverheatProtectionOff: () => api.post('/commands/climate/cabin-overheat-protection/off'),
  scheduleSoftwareUpdate: (offsetSec = 0) => api.post('/commands/software-update/schedule', { offsetSec }),
  cancelSoftwareUpdate: () => api.post('/commands/software-update/cancel'),
  navigationGps: (lat: number, lon: number, order?: number) => api.post('/commands/navigation/gps', { lat, lon, order }),
  chargeStart: () => api.post('/commands/charge/start'),
  chargeStop: () => api.post('/commands/charge/stop'),
  wake: () => api.post('/commands/wake'),
  setChargeLimit: (percent: number) => api.post('/commands/charge-limit', { percent }),
  getHistory: () => api.get<unknown[]>('/commands/history'),
}

export const tripsApi = {
  list: (page = 1, pageSize = 20, from?: string, to?: string, includeEnergy = true) => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    params.set('includeEnergy', String(includeEnergy))
    return api.get<unknown>(`/trips?${params}`)
  },
  getById: (id: string) => api.get<unknown>(`/trips/${id}`),
  path: (id: string) => api.get<unknown>(`/trips/${id}/path`),
}

export const chargesApi = {
  list: (page = 1, pageSize = 20) =>
    api.get<unknown>(`/charges?page=${page}&pageSize=${pageSize}`),
  getById: (id: string) => api.get<unknown>(`/charges/${id}`),
  monthlySummary: (year: number, month: number) =>
    api.get<unknown>(`/charges/summary/monthly?year=${year}&month=${month}`),
}

export const statsApi = {
  summary: (days = 30) => api.get<unknown>(`/stats/summary?days=${days}`),
  battery: (days = 30) => api.get<unknown>(`/stats/battery?days=${days}`),
  batteryHealth: (days = 180) => api.get<unknown>(`/stats/battery-health?days=${days}`),
  batteryHealthMeasurements: (days = 180) => api.get<unknown>(`/stats/battery-health/measurements?days=${days}`),
  efficiency: (days = 30) => api.get<unknown>(`/stats/efficiency?days=${days}`),
  idles: (days = 7, minDurationMin = 5) => api.get<unknown>(`/stats/idles?days=${days}&minDurationMin=${minDurationMin}`),
  anomalies: (days = 30) => api.get<unknown>(`/stats/anomalies?days=${days}`),
  batteryDegradation: (days = 365) => api.get<BatteryDegradation>(`/stats/health/battery-degradation?days=${days}`),
  vampireDrain: (days = 90) => api.get<VampireDrain>(`/stats/health/vampire-drain?days=${days}`),
  chargingProfile: (days = 365) => api.get<ChargingProfile>(`/stats/health/charging-profile?days=${days}`),
  efficiencyByTemperature: (days = 365) => api.get<EfficiencyByTemperature>(`/stats/health/efficiency-by-temperature?days=${days}`),
  tirePressure: (days = 90) => api.get<TirePressureAnalysis>(`/stats/health/tire-pressure?days=${days}`),
  softwareUpdates: () => api.get<SoftwareUpdate[]>('/stats/health/software-updates'),
  healthSummary: (days = 365) => api.get<HealthSummary>(`/stats/health/summary?days=${days}`),
}

export interface HealthAlert {
  severity: 'critical' | 'warning' | 'info'
  message: string
}

export interface HealthSummary {
  periodDays: number
  score: number | null
  status: 'ok' | 'warning' | 'critical' | 'unknown'
  alerts: HealthAlert[]
}

export interface BatteryDegradation {
  periodDays: number
  chemistry: string
  ready: boolean
  samplesCount: number
  series: Array<{ day: string; fullRangeKm: number; odometerKm: number | null; capacityKwh: number | null }>
  efficiencyKwhPerKm: number | null
  bestFullRangeKm: number | null
  currentFullRangeKm: number | null
  healthPct: number | null
  degradationPct: number | null
  originalCapacityKwh: number | null
  currentCapacityKwh: number | null
  lossPer10000Km: number | null
  odometerKm: number | null
  projectedKmToWarrantyFloor: number | null
}

export interface VampireDrainSession {
  parkedFrom: string
  parkedTo: string
  hours: number
  socFrom: number
  socTo: number
  socLost: number
  pctPerDay: number
  rangeLostKm: number | null
}

export interface VampireDrain {
  periodDays: number
  ready: boolean
  sessionsCount: number
  medianPctPerDay: number | null
  avgPctPerDay: number | null
  worstPctPerDay: number | null
  worstSession: VampireDrainSession | null
  kwhPerDay: number | null
  thresholdPctPerDay: number
  status: 'ok' | 'warning' | 'critical' | 'unknown'
  sessions: VampireDrainSession[]
}

export interface ChargingProfile {
  periodDays: number
  chemistry: string
  sessionsCount: number
  dcCount: number
  acCount: number
  dcEnergyKwh: number
  acEnergyKwh: number
  totalEnergyKwh: number
  dcSharePct: number | null
  equivalentCycles: number | null
  avgEndSocPct: number | null
  avgStartSocPct: number | null
  maxPowerKw: number | null
  maxRecommendedSocPct: number
  highSocSessions: number
  deepDischargeSessions: number
  monthly: Array<{ month: string; dcKwh: number; acKwh: number }>
}

export interface EfficiencyByTemperature {
  periodDays: number
  buckets: Array<{ bucketMinC: number; distanceKm: number; energyKwh: number; tripsCount: number; consumptionWhPerKm: number | null }>
  overallWhPerKm: number | null
  coldWhPerKm: number | null
  mildWhPerKm: number | null
  winterPenaltyPct: number | null
}

type TireCorner = 'fl' | 'fr' | 'rl' | 'rr'

export interface TirePressureAnalysis {
  periodDays: number
  ready: boolean
  targetBar: number
  toleranceBar: number
  latest: {
    day: string
    outsideTempC: number | null
    raw: Record<TireCorner, number | null>
    corrected: Record<TireCorner, number | null>
  } | null
  spreadBar: number | null
  spreadWarning: boolean
  alerts: Array<{ corner: TireCorner; correctedBar: number; deltaBar: number; severity: 'warning' | 'critical' }>
  leakSuspects: Array<{ corner: TireCorner; barPer30Days: number }>
  series: Array<{
    day: string
    outsideTempC: number | null
    raw: Record<TireCorner, number | null>
    corrected: Record<TireCorner, number | null>
  }>
}

export interface SoftwareUpdate {
  startedAt: string
  installedAt: string | null
  version: string | null
}

export const automationsApi = {
  list: () => api.get<unknown[]>('/automations'),
  create: (data: unknown) => api.post('/automations', data),
  update: (id: string, data: unknown) => api.patch(`/automations/${id}`, data),
  delete: (id: string) => api.delete(`/automations/${id}`),
  executions: (id: string) => api.get<unknown[]>(`/automations/${id}/executions`),
}

export interface TeslaOAuthConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  region?: 'na' | 'eu' | 'cn'
}

export interface TeslamateSettingsStatus {
  configured: boolean
  requiredMissing: string[]
  backendOnly: boolean
  dbName: string
  dbUser: string
  port: number
  grafanaUser: string
  grafanaPort: number
  hasDbPassword: boolean
  hasEncryptionKey: boolean
  hasGrafanaPassword: boolean
}

export interface TeslamateSettingsInput {
  dbName?: string
  dbUser?: string
  dbPassword?: string
  encryptionKey?: string
  grafanaUser?: string
  grafanaPassword?: string
  port?: number
  grafanaPort?: number
  backendOnly?: boolean
}

export interface TeslamateConnectionTestResult {
  connected: boolean
  code: string
  message: string
}

export const settingsApi = {
  get: () => api.get<unknown>('/settings'),
  update: (data: unknown) => api.patch('/settings', data),
  getTeslaOAuth: () => api.get<{ oauthConfigured: boolean; connected: boolean; region: TeslaRegion; accountEmail: string | null }>('/settings/tesla'),
  updateTeslaOAuth: (data: TeslaOAuthConfig) => api.post('/settings/tesla', data),
  registerTeslaPartner: (domain: string) => api.post('/settings/tesla/register-partner', { domain }),
  getTeslamate: () => api.get<TeslamateSettingsStatus>('/settings/teslamate'),
  updateTeslamate: (data: TeslamateSettingsInput) => api.patch('/settings/teslamate', data),
  testTeslamateConnection: (data: Pick<TeslamateSettingsInput, 'dbName' | 'dbUser' | 'dbPassword'>) =>
    api.post<TeslamateConnectionTestResult>('/settings/teslamate/test-connection', data),
}

export const diagnosticsApi = {
  status: () => api.get<unknown>('/diagnostics'),
  apiUsage: () => api.get<unknown>('/diagnostics/api-usage'),
  teslaConnection: () => api.get<TeslaConnectionStatus>('/diagnostics/tesla-connection'),
}
