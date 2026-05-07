import type { PrismaClient } from '@prisma/client'
import type { CommandName } from '@voltcraft/shared'

export class CommandRepository {
  constructor(private readonly db: PrismaClient) {}

  async logCommand(vehicleId: string, command: CommandName, params?: Record<string, unknown>) {
    return this.db.vehicleCommandLog.create({
      data: {
        vehicleId,
        command,
        params: params ?? {},
        status: 'PENDING',
        triggeredBy: 'user',
      },
    })
  }

  async resolveCommand(id: string, success: boolean, errorMessage?: string) {
    return this.db.vehicleCommandLog.update({
      where: { id },
      data: {
        status: success ? 'SUCCESS' : 'FAILED',
        resolvedAt: new Date(),
        errorMessage,
      },
    })
  }

  async getRecent(vehicleId: string, limit = 20) {
    return this.db.vehicleCommandLog.findMany({
      where: { vehicleId },
      orderBy: { executedAt: 'desc' },
      take: limit,
    })
  }
}
