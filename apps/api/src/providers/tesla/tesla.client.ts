import type { PrismaClient, TeslaAccount } from '@prisma/client'
import type { Redis } from 'ioredis'
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
    // Use token from env directly (no refresh needed for bearer token)
    // In production, this would be fetched from the stored Tesla account
    // For now, we use the env TESLA_TOKEN or the stored token
    const token = env.TESLA_TOKEN || account.accessToken
    if (!token) {
      throw new TeslaApiError('Tesla token not configured', 'tesla_not_configured')
    }
    return token
  }

  private async refreshToken(account: TeslaAccount): Promise<string> {
    // With bearer token auth, no refresh needed
    // Just return the current token from env
    return env.TESLA_TOKEN || account.accessToken
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
