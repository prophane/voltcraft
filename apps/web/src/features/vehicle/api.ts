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

export const vehicleApi = {
  getCurrent: () => api.get<VehicleSummary>('/vehicle/current'),
  getState: () => api.get<VehicleStateSnapshot & { isCached: boolean }>('/vehicle/state'),
  getLocation: () => api.get<{ latitude: number; longitude: number; heading: number; capturedAt: string } | null>('/vehicle/location'),
  sync: () => api.post('/vehicle/sync'),
}

export const commandsApi = {
  lock: () => api.post('/commands/lock'),
  unlock: () => api.post('/commands/unlock'),
  honk: () => api.post('/commands/honk'),
  flash: () => api.post('/commands/flash'),
  climateStart: () => api.post('/commands/climate/start'),
  climateStop: () => api.post('/commands/climate/stop'),
  chargeStart: () => api.post('/commands/charge/start'),
  chargeStop: () => api.post('/commands/charge/stop'),
  wake: () => api.post('/commands/wake'),
  setChargeLimit: (percent: number) => api.post('/commands/charge-limit', { percent }),
  getHistory: () => api.get<unknown[]>('/commands/history'),
}

export const tripsApi = {
  list: (page = 1, pageSize = 20, from?: string, to?: string) => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    return api.get<unknown>(`/trips?${params}`)
  },
  getById: (id: string) => api.get<unknown>(`/trips/${id}`),
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
  efficiency: (days = 30) => api.get<unknown>(`/stats/efficiency?days=${days}`),
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

export const settingsApi = {
  get: () => api.get<unknown>('/settings'),
  update: (data: unknown) => api.patch('/settings', data),
  getTeslaOAuth: () => api.get<{ oauthConfigured: boolean; connected: boolean; region: TeslaRegion; accountEmail: string | null }>('/settings/tesla'),
  updateTeslaOAuth: (data: TeslaOAuthConfig) => api.post('/settings/tesla', data),
  registerTeslaPartner: (domain: string) => api.post('/settings/tesla/register-partner', { domain }),
}

export const diagnosticsApi = {
  status: () => api.get<unknown>('/diagnostics'),
  apiUsage: () => api.get<unknown>('/diagnostics/api-usage'),
  teslaConnection: () => api.get<TeslaConnectionStatus>('/diagnostics/tesla-connection'),
}
