import type { PrismaClient, TeslaAccount } from '@prisma/client'
import type Redis from 'ioredis'
import { decryptToken } from './tesla-auth.service.js'
import { TeslaApiError } from '../../common/errors/app-error.js'
import { env } from '../../config/env.js'
import type { TeslaVehicleData, TeslaCommandResponse } from './tesla.types.js'

const REGION_BASE: Record<string, string> = {
  na: 'https://fleet-api.prd.na.vn.cloud.tesla.com',
  eu: 'https://fleet-api.prd.eu.vn.cloud.tesla.com',
  cn: 'https://fleet-api.prd.cn.vn.cloud.tesla.cn',
}

export class TeslaClient {
  constructor(
    private readonly db: PrismaClient,
    private readonly redis: Redis,
  ) {}

  private baseUrl(region: string) {
    return REGION_BASE[region] ?? REGION_BASE['na']
  }

  private async getAccessToken(account: TeslaAccount): Promise<string> {
    const cacheKey = `tesla:token:${account.id}`
    const cached = await this.redis.get(cacheKey)
    if (cached) return cached

    // Refresh if expired
    if (account.tokenExpiry < new Date()) {
      const refreshed = await this.refreshToken(account)
      return refreshed
    }

    const plain = decryptToken(account.accessToken, env.ENCRYPTION_KEY)
    // Cache token for remainder of its validity (minus 60s buffer)
    const ttl = Math.max(0, Math.floor((account.tokenExpiry.getTime() - Date.now()) / 1000) - 60)
    if (ttl > 0) await this.redis.set(cacheKey, plain, 'EX', ttl)
    return plain
  }

  private async refreshToken(account: TeslaAccount): Promise<string> {
    // Tesla OAuth token refresh
    const refreshToken = decryptToken(account.refreshToken, env.ENCRYPTION_KEY)
    const res = await fetch('https://auth.tesla.com/oauth2/v3/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: env.TESLA_CLIENT_ID,
        refresh_token: refreshToken,
      }),
    })
    if (!res.ok) throw new TeslaApiError(`Token refresh failed: ${res.status}`)
    const data = (await res.json()) as { access_token: string; expires_in: number; refresh_token: string }

    const { encryptToken } = await import('./tesla-auth.service.js')
    const newExpiry = new Date(Date.now() + data.expires_in * 1000)
    await this.db.teslaAccount.update({
      where: { id: account.id },
      data: {
        accessToken: encryptToken(data.access_token, env.ENCRYPTION_KEY),
        refreshToken: encryptToken(data.refresh_token, env.ENCRYPTION_KEY),
        tokenExpiry: newExpiry,
      },
    })

    const cacheKey = `tesla:token:${account.id}`
    await this.redis.set(cacheKey, data.access_token, 'EX', data.expires_in - 60)
    return data.access_token
  }

  async getVehicleData(account: TeslaAccount, vin: string): Promise<TeslaVehicleData> {
    const token = await this.getAccessToken(account)
    const url = `${this.baseUrl(account.region)}/api/1/vehicles/${vin}/vehicle_data?endpoints=charge_state%3Bclimate_state%3Bdrive_state%3Bvehicle_state`

    await this.logUsage(account, url, 'GET')

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    })

    if (res.status === 408) throw new TeslaApiError('Vehicle is offline or asleep', 'vehicle_unavailable')
    if (!res.ok) throw new TeslaApiError(`Tesla API error: ${res.status}`)

    const body = (await res.json()) as { response: TeslaVehicleData }
    return body.response
  }

  async sendCommand(
    account: TeslaAccount,
    vin: string,
    endpoint: string,
    body?: Record<string, unknown>,
  ): Promise<TeslaCommandResponse> {
    const token = await this.getAccessToken(account)
    const url = `${this.baseUrl(account.region)}/api/1/vehicles/${vin}/command/${endpoint}`

    await this.logUsage(account, url, 'POST')

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30_000),
    })

    if (!res.ok) throw new TeslaApiError(`Command failed: ${res.status}`)
    const data = (await res.json()) as { response: TeslaCommandResponse }
    if (!data.response.result) throw new TeslaApiError(`Command rejected: ${data.response.reason}`)
    return data.response
  }

  async wakeVehicle(account: TeslaAccount, vin: string): Promise<void> {
    const token = await this.getAccessToken(account)
    const url = `${this.baseUrl(account.region)}/api/1/vehicles/${vin}/wake_up`

    await this.logUsage(account, url, 'POST')

    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) throw new TeslaApiError(`Wake failed: ${res.status}`)

    // Poll until online (up to 30s)
    for (let i = 0; i < 6; i++) {
      await new Promise((r) => setTimeout(r, 5000))
      const data = await this.getVehicleData(account, vin).catch(() => null)
      if (data?.state === 'online') return
    }
  }

  private async logUsage(account: TeslaAccount, endpoint: string, method: string) {
    await this.db.apiUsageLog.create({
      data: { endpoint, method, triggeredBy: 'sync' },
    }).catch(() => {/* non-blocking */})
  }
}
