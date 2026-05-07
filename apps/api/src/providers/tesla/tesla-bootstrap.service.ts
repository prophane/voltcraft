import type { PrismaClient } from '@prisma/client'
import { AppError } from '../../common/errors/app-error.js'
import { TeslaApiError } from '../../common/errors/app-error.js'

type TeslaRegion = 'na' | 'eu' | 'cn'

const REGION_BASE: Record<TeslaRegion, string> = {
  na: 'https://fleet-api.prd.na.vn.cloud.tesla.com',
  eu: 'https://fleet-api.prd.eu.vn.cloud.tesla.com',
  cn: 'https://fleet-api.prd.cn.vn.cloud.tesla.cn',
}

interface TeslaVehicleSummary {
  vin: string
  display_name?: string
}

interface TeslaVehiclesResponse {
  response?: TeslaVehicleSummary[]
}

interface DecodedTeslaToken {
  exp?: number
  scp?: string[]
  scope?: string
  ou_code?: string
}

function decodeTeslaJwtPayload(token: string): DecodedTeslaToken {
  const parts = token.split('.')
  if (parts.length < 2) {
    throw new AppError('INVALID_TESLA_TOKEN', 'Invalid Tesla token format', 400)
  }

  try {
    const payloadB64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = payloadB64 + '='.repeat((4 - (payloadB64.length % 4)) % 4)
    const decoded = Buffer.from(padded, 'base64').toString('utf8')
    return JSON.parse(decoded) as DecodedTeslaToken
  } catch {
    throw new AppError('INVALID_TESLA_TOKEN', 'Unable to decode Tesla token payload', 400)
  }
}

function validateTeslaTokenForFleetApi(token: string, region: TeslaRegion) {
  const payload = decodeTeslaJwtPayload(token)

  if (payload.exp && payload.exp * 1000 < Date.now()) {
    throw new AppError('TESLA_TOKEN_EXPIRED', 'Tesla token is expired. Generate a new token.', 401)
  }

  const scopes = Array.isArray(payload.scp)
    ? payload.scp
    : typeof payload.scope === 'string'
      ? payload.scope.split(' ').filter(Boolean)
      : []

  const hasVehicleScope = scopes.some((s) => s.includes('vehicle'))
  if (!hasVehicleScope) {
    throw new AppError(
      'TESLA_TOKEN_SCOPE_INVALID',
      'Token does not include vehicle scopes. Generate a Fleet API token with vehicle permissions (for example vehicle_device_data).',
      400,
      { scopes },
    )
  }

  if (payload.ou_code) {
    const tokenRegion = payload.ou_code.toLowerCase() === 'eu' ? 'eu' : payload.ou_code.toLowerCase() === 'cn' ? 'cn' : 'na'
    if (tokenRegion !== region) {
      throw new AppError(
        'TESLA_REGION_MISMATCH',
        `Region mismatch: token appears to be ${tokenRegion.toUpperCase()} but selected region is ${region.toUpperCase()}.`,
        400,
      )
    }
  }
}

export async function bootstrapTeslaInventory(
  db: PrismaClient,
  input: {
    token: string
    region: TeslaRegion
    refreshToken?: string
    tokenExpiry?: Date
    accountEmail?: string
  },
): Promise<{ userId: string; accountId: string; vehiclesCount: number }> {
  const token = input.token.trim()
  const region = input.region

  validateTeslaTokenForFleetApi(token, region)

  const user = await db.user.upsert({
    where: { email: 'system@disabled' },
    create: {
      email: 'system@disabled',
      name: 'System',
      passwordHash: 'AUTH_DISABLED_NO_PASSWORD',
      role: 'ADMIN',
    },
    update: { name: 'System' },
  })

  const existing = await db.teslaAccount.findFirst({
    where: { userId: user.id, isActive: true },
    orderBy: { createdAt: 'asc' },
  })

  const account = existing
    ? await db.teslaAccount.update({
        where: { id: existing.id },
        data: {
          region,
          accessToken: token,
          refreshToken: input.refreshToken ?? token,
          tokenExpiry: input.tokenExpiry ?? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          email: input.accountEmail ?? user.email,
          isActive: true,
        },
      })
    : await db.teslaAccount.create({
        data: {
          userId: user.id,
          email: input.accountEmail ?? user.email,
          region,
          accessToken: token,
          refreshToken: input.refreshToken ?? token,
          tokenExpiry: input.tokenExpiry ?? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          isActive: true,
        },
      })

  let vehicles: TeslaVehicleSummary[] = []

  try {
    const url = `${REGION_BASE[region]}/api/1/vehicles`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    })

    if (!res.ok) {
      const details = await res.text().catch(() => '')
      throw new TeslaApiError(
        `Failed to list Tesla vehicles (${res.status}). Verify token scope and region (${region}).${details ? ` Details: ${details.slice(0, 180)}` : ''}`,
        'tesla_list_vehicles_failed',
      )
    }

    const payload = (await res.json()) as TeslaVehiclesResponse
    vehicles = Array.isArray(payload.response) ? payload.response : []
  } catch (error) {
    if (error instanceof TeslaApiError) {
      throw error
    }

    const message = error instanceof Error ? error.message : 'Unknown error'
    throw new TeslaApiError(
      `Unable to contact Tesla Fleet API. Verify outbound network access and token validity. Details: ${message}`,
      'tesla_network_error',
    )
  }

  for (const item of vehicles) {
    if (!item.vin) continue
    await db.vehicle.upsert({
      where: { vin: item.vin },
      create: {
        vin: item.vin,
        displayName: item.display_name || item.vin,
        teslaAccountId: account.id,
        isActive: true,
      },
      update: {
        displayName: item.display_name || item.vin,
        teslaAccountId: account.id,
        isActive: true,
        deletedAt: null,
      },
    })
  }

  return {
    userId: user.id,
    accountId: account.id,
    vehiclesCount: vehicles.length,
  }
}
