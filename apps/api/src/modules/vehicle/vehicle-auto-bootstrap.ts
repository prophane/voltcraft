import type { FastifyInstance } from 'fastify'
import { AppError, NotFoundError } from '../../common/errors/app-error.js'
import { env } from '../../config/env.js'
import { bootstrapTeslaInventory } from '../../providers/tesla/tesla-bootstrap.service.js'

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

export async function withVehicleAutoBootstrap<T>(app: FastifyInstance, run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (err) {
    if (!(env.AUTH_DISABLED && err instanceof NotFoundError)) {
      throw err
    }

    const bootstrapped = await bootstrapFromActiveAccount(app)
    if (!bootstrapped && env.TESLA_TOKEN) {
      await bootstrapTeslaInventory(app.prisma, {
        token: env.TESLA_TOKEN,
        region: env.TESLA_REGION,
      })
    }

    try {
      return await run()
    } catch (retryErr) {
      if (retryErr instanceof NotFoundError) {
        throw new AppError(
          'NO_VEHICLE_LINKED',
          'No Tesla vehicle detected for current token/account. Reconnect Tesla OAuth, then click Sync once.',
          404,
        )
      }
      throw retryErr
    }
  }
}
