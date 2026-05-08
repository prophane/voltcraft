import { readFile } from 'node:fs/promises'
import { request as httpsRequest } from 'node:https'
import type { PrismaClient, TeslaAccount } from '@prisma/client'
import type { Redis } from 'ioredis'
import { TeslaApiError } from '../../common/errors/app-error.js'
import { env } from '../../config/env.js'
import { getTeslaCommandProxyTlsPaths } from '../../config/tesla-config.js'
import type { TeslaVehicleData, TeslaCommandResponse } from './tesla.types.js'

const REGION_BASE: Record<string, string> = {
  na: 'https://fleet-api.prd.na.vn.cloud.tesla.com',
  eu: 'https://fleet-api.prd.eu.vn.cloud.tesla.com',
  cn: 'https://fleet-api.prd.cn.vn.cloud.tesla.cn',
}

const TESLA_FLEET_AUTH_URL = 'https://fleet-auth.prd.vn.cloud.tesla.com/oauth2/v3/token'

export class TeslaClient {
  constructor(
    private readonly db: PrismaClient,
    private readonly redis: Redis,
  ) {}

  private baseUrl(region: string) {
    return REGION_BASE[region] ?? REGION_BASE['na']
  }

  private async getAccessToken(account: TeslaAccount): Promise<string> {
    // OAuth/Fleet token from the linked Tesla account is the primary source.
    // Keep env fallback only for legacy/manual setups.
    if (account.tokenExpiry && account.tokenExpiry.getTime() <= Date.now() && account.refreshToken) {
      return this.refreshToken(account)
    }

    const token = account.accessToken || env.TESLA_TOKEN
    if (!token) {
      throw new TeslaApiError('Tesla token not configured', 'tesla_not_configured')
    }
    return token
  }

  private async refreshToken(account: TeslaAccount): Promise<string> {
    if (!account.refreshToken) {
      throw new TeslaApiError('Tesla refresh token is missing. Reconnect with Tesla OAuth.', 'tesla_refresh_missing')
    }
    if (!env.TESLA_CLIENT_ID) {
      throw new TeslaApiError('Tesla OAuth app client ID is missing on server.', 'tesla_oauth_not_configured')
    }

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: env.TESLA_CLIENT_ID,
      refresh_token: account.refreshToken,
    })

    const res = await fetch(TESLA_FLEET_AUTH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: AbortSignal.timeout(20_000),
    })

    if (!res.ok) {
      const details = await res.text().catch(() => '')
      throw new TeslaApiError(
        `Tesla token refresh failed (${res.status})${details ? `: ${details.slice(0, 220)}` : ''}`,
        'tesla_refresh_failed',
      )
    }

    const payload = (await res.json()) as {
      access_token?: string
      refresh_token?: string
      expires_in?: number
    }

    if (!payload.access_token) {
      throw new TeslaApiError('Tesla token refresh returned no access_token', 'tesla_refresh_invalid_response')
    }

    const updated = await this.db.teslaAccount.update({
      where: { id: account.id },
      data: {
        accessToken: payload.access_token,
        refreshToken: payload.refresh_token ?? account.refreshToken,
        tokenExpiry: payload.expires_in
          ? new Date(Date.now() + payload.expires_in * 1000)
          : new Date(Date.now() + 60 * 60 * 1000),
      },
    })

    // Keep caller's in-memory account synchronized for this request lifecycle.
    account.accessToken = updated.accessToken
    account.refreshToken = updated.refreshToken
    account.tokenExpiry = updated.tokenExpiry

    return updated.accessToken
  }

  private async fetchWithAuth(
    account: TeslaAccount,
    url: string,
    init: RequestInit,
    retryOnUnauthorized: boolean = true,
  ): Promise<Response> {
    const token = await this.getAccessToken(account)
    const headers = {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${token}`,
    }

    const res = await fetch(url, {
      ...init,
      headers,
    })

    if (res.status === 401 && retryOnUnauthorized && account.refreshToken) {
      const refreshedToken = await this.refreshToken(account)
      const retryHeaders = {
        ...(init.headers ?? {}),
        Authorization: `Bearer ${refreshedToken}`,
      }
      return fetch(url, {
        ...init,
        headers: retryHeaders,
      })
    }

    return res
  }

  private async postToCommandProxy(
    account: TeslaAccount,
    url: string,
    body?: Record<string, unknown>,
  ): Promise<Response> {
    const { proxyTlsCertPath } = getTeslaCommandProxyTlsPaths()
    const ca = await readFile(proxyTlsCertPath, 'utf8').catch(() => null)

    const execute = async (token: string) => {
      const payload = body ? JSON.stringify(body) : undefined

      return new Promise<Response>((resolve, reject) => {
        const req = httpsRequest(
          url,
          {
            method: 'POST',
            ca: ca ?? undefined,
            timeout: 30_000,
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
              ...(payload ? { 'Content-Length': Buffer.byteLength(payload).toString() } : {}),
            },
          },
          (res) => {
            const chunks: Buffer[] = []
            res.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
            res.on('end', () => {
              resolve(new Response(Buffer.concat(chunks), {
                status: res.statusCode ?? 502,
                headers: res.headers as HeadersInit,
              }))
            })
          },
        )

        req.on('timeout', () => req.destroy(new Error('Tesla command proxy timeout')))
        req.on('error', reject)

        if (payload) {
          req.write(payload)
        }

        req.end()
      })
    }

    const token = await this.getAccessToken(account)
    const res = await execute(token)
    if (res.status === 401 && account.refreshToken) {
      const refreshedToken = await this.refreshToken(account)
      return execute(refreshedToken)
    }

    return res
  }

  async listVehicles(account: TeslaAccount): Promise<Array<{ vin: string }>> {
    const url = `${this.baseUrl(account.region)}/api/1/vehicles`
    await this.logUsage(account, url, 'GET')

    const res = await this.fetchWithAuth(account, url, {
      method: 'GET',
      signal: AbortSignal.timeout(15_000),
    })

    if (!res.ok) {
      const details = await res.text().catch(() => '')
      throw new TeslaApiError(
        `Tesla list vehicles failed (${res.status})${details ? `: ${details.slice(0, 220)}` : ''}`,
        'tesla_list_vehicles_failed',
      )
    }

    const payload = (await res.json()) as { response?: Array<{ vin: string }> }
    return Array.isArray(payload.response) ? payload.response : []
  }

  async getVehicleData(account: TeslaAccount, vin: string): Promise<TeslaVehicleData> {
    const url = `${this.baseUrl(account.region)}/api/1/vehicles/${vin}/vehicle_data?endpoints=charge_state%3Bclimate_state%3Bdrive_state%3Bvehicle_state`

    await this.logUsage(account, url, 'GET')

    const res = await this.fetchWithAuth(account, url, {
      method: 'GET',
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
    const proxyBaseUrl = env.TESLA_COMMAND_PROXY_URL.replace(/\/$/, '')
    const url = `${proxyBaseUrl}/api/1/vehicles/${vin}/command/${endpoint}`

    await this.logUsage(account, url, 'POST')

    let res: Response
    try {
      res = await this.postToCommandProxy(account, url, body)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown proxy error'
      throw new TeslaApiError(
        `Tesla command proxy unavailable. The server could not sign the command request.${message ? ` Details: ${message}` : ''}`,
        'tesla_command_proxy_unavailable',
      )
    }

    if (!res.ok) {
      const details = await res.text().catch(() => '')
      const lower = details.toLowerCase()

      if (res.status === 403 || lower.includes('scope') || lower.includes('forbidden')) {
        throw new TeslaApiError(
          `Tesla command rejected (${res.status}): missing permission/scope, virtual key enrollment, or signed-command authorization.${details ? ` Details: ${details.slice(0, 280)}` : ''}`,
          'tesla_command_scope_denied',
        )
      }

      if (res.status === 412 || lower.includes('must be registered in the current region')) {
        throw new TeslaApiError(
          `Tesla command rejected (${res.status}): partner account not registered in the active region (${account.region.toUpperCase()}).${details ? ` Details: ${details.slice(0, 280)}` : ''}`,
          'tesla_partner_region_missing',
        )
      }

      throw new TeslaApiError(
        `Tesla command failed (${res.status})${details ? `: ${details.slice(0, 280)}` : ''}`,
        'tesla_command_failed',
      )
    }

    const data = (await res.json()) as { response: TeslaCommandResponse }
    if (!data.response.result) throw new TeslaApiError(`Command rejected: ${data.response.reason}`)
    return data.response
  }

  async wakeVehicle(account: TeslaAccount, vin: string): Promise<void> {
    const url = `${this.baseUrl(account.region)}/api/1/vehicles/${vin}/wake_up`

    await this.logUsage(account, url, 'POST')

    const res = await this.fetchWithAuth(account, url, {
      method: 'POST',
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

  /**
   * Register this app as a Tesla Fleet API partner for the given domain and region.
   * Uses a client_credentials (application) token — NOT the user OAuth token.
   * Must be called once after the public key is published at /.well-known/...
   */
  async registerPartner(domain: string, region: string): Promise<{ registered: boolean; response: unknown }> {
    if (!env.TESLA_CLIENT_ID || !env.TESLA_CLIENT_SECRET) {
      throw new TeslaApiError('Tesla client_id and client_secret must be configured before partner registration', 'tesla_oauth_not_configured')
    }

    const audience = this.baseUrl(region)

    // Step 1: Get application (client_credentials) token
    const tokenBody = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: env.TESLA_CLIENT_ID,
      client_secret: env.TESLA_CLIENT_SECRET,
      scope: 'openid vehicle_device_data vehicle_cmds vehicle_charging_cmds',
      audience,
    })

    const tokenRes = await fetch(TESLA_FLEET_AUTH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenBody.toString(),
      signal: AbortSignal.timeout(20_000),
    })

    if (!tokenRes.ok) {
      const details = await tokenRes.text().catch(() => '')
      throw new TeslaApiError(
        `Failed to get Tesla application token (${tokenRes.status})${details ? `: ${details.slice(0, 300)}` : ''}`,
        'tesla_app_token_failed',
      )
    }

    const tokenPayload = (await tokenRes.json()) as { access_token?: string }
    if (!tokenPayload.access_token) {
      throw new TeslaApiError('Tesla client_credentials token response missing access_token', 'tesla_app_token_invalid')
    }

    // Step 2: Register partner account for the domain
    const registerUrl = `${audience}/api/1/partner_accounts`
    const registerRes = await fetch(registerUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenPayload.access_token}`,
      },
      body: JSON.stringify({ domain }),
      signal: AbortSignal.timeout(20_000),
    })

    const registerBody = await registerRes.json().catch(() => ({}))

    if (!registerRes.ok) {
      throw new TeslaApiError(
        `Tesla partner registration failed (${registerRes.status}): ${JSON.stringify(registerBody).slice(0, 300)}`,
        'tesla_partner_registration_failed',
      )
    }

    return { registered: true, response: registerBody }
  }
}
