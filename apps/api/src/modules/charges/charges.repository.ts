import type { PrismaClient } from '@prisma/client'

export class ChargesRepository {
  constructor(private readonly db: PrismaClient) {}

  async findMany(vehicleId: string, opts: { page: number; pageSize: number; from?: Date; to?: Date }) {
    const where = {
      vehicleId,
      ...(opts.from || opts.to
        ? { startedAt: { ...(opts.from ? { gte: opts.from } : {}), ...(opts.to ? { lte: opts.to } : {}) } }
        : {}),
    }
    const [sessions, total] = await Promise.all([
      this.db.chargeSession.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        skip: (opts.page - 1) * opts.pageSize,
        take: opts.pageSize,
      }),
      this.db.chargeSession.count({ where }),
    ])
    return { sessions, total }
  }

  async findById(id: string, vehicleId: string) {
    return this.db.chargeSession.findFirst({ where: { id, vehicleId } })
  }

  async getMonthlySummary(vehicleId: string, year: number, month: number) {
    const from = new Date(year, month - 1, 1)
    const to = new Date(year, month, 1)
    return this.db.chargeSession.aggregate({
      where: { vehicleId, startedAt: { gte: from, lt: to } },
      _sum: { energyAddedKwh: true, estimatedCost: true, durationMin: true },
      _count: { id: true },
    })
  }
}
