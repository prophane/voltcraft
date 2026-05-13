import type { FastifyInstance } from 'fastify'
import { AppError, NotFoundError } from '../../common/errors/app-error.js'
import { env } from '../../config/env.js'
import { bootstrapTeslaInventory } from '../../providers/tesla/tesla-bootstrap.service.js'
import { TeslaMateReadService } from '../../providers/teslamate/teslamate-read.service.js'

async function bootstrapFromActiveAccount(app: FastifyInstance): Promise<boolean> {
  const activeAccount = await app.prisma.teslaAccount.findFirst({
    where: { isActive: true },
    orderBy: { updatedAt: 'desc' },
  })

  if (!activeAccount?.accessToken) {
    return false
  }

  await bootstrapTeslaInventory(app.prisma, {
    token: activeAccount.accessToken,
    region: (activeAccount.region as 'na' | 'eu' | 'cn') ?? env.TESLA_REGION,
    refreshToken: activeAccount.refreshToken,
    tokenExpiry: activeAccount.tokenExpiry,
    accountEmail: activeAccount.email,
  })

  return true
}

async function bootstrapFromTeslaMate(app: FastifyInstance, userId: string): Promise<boolean> {
  const teslamate = new TeslaMateReadService()
  const identity = await teslamate.getPrimaryVehicleIdentity()
  if (!identity?.vin) {
    return false
  }

  const user = await app.prisma.user.findUnique({ where: { id: userId } })
  if (!user) {
    return false
  }

  const existing = await app.prisma.teslaAccount.findFirst({
    where: { userId: user.id, isActive: true },
    orderBy: { updatedAt: 'desc' },
  })

  const account = existing
    ? existing
    : await app.prisma.teslaAccount.create({
        data: {
          userId: user.id,
          email: user.email,
          region: env.TESLA_REGION,
          accessToken: 'TESLAMATE_ONLY',
          refreshToken: 'TESLAMATE_ONLY',
          tokenExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          isActive: true,
        },
      })

  await app.prisma.vehicle.upsert({
    where: { vin: identity.vin },
    create: {
      vin: identity.vin,
      displayName: identity.displayName,
      model: identity.model,
      color: identity.color,
      teslaAccountId: account.id,
      isActive: true,
    },
    update: {
      displayName: identity.displayName,
      model: identity.model,
      color: identity.color,
      teslaAccountId: account.id,
      isActive: true,
      deletedAt: null,
    },
  })

  return true
}

export async function withVehicleAutoBootstrap<T>(app: FastifyInstance, userId: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (err) {
    if (!(err instanceof NotFoundError)) {
      throw err
    }

    let bootstrapped = await bootstrapFromActiveAccount(app)
    if (!bootstrapped && env.TESLA_TOKEN) {
      try {
        await bootstrapTeslaInventory(app.prisma, {
          token: env.TESLA_TOKEN,
          region: env.TESLA_REGION,
        })
        bootstrapped = true
      } catch {
        // Ignore Fleet bootstrap errors and continue with TeslaMate fallback.
      }
    }

    if (!bootstrapped) {
      bootstrapped = await bootstrapFromTeslaMate(app, userId)
    }

    try {
      return await run()
    } catch (retryErr) {
      if (retryErr instanceof NotFoundError) {
        throw new AppError(
          'NO_VEHICLE_LINKED',
          'No Tesla vehicle detected from Tesla Fleet or TeslaMate. Configure Tesla OAuth or verify TeslaMate access, then retry.',
          404,
        )
      }
      throw retryErr
    }
  }
}
