import type { PrismaClient } from '@prisma/client'

export class TripsRepository {
  constructor(private readonly db: PrismaClient) {}

  async findMany(vehicleId: string, opts: { page: number; pageSize: number; from?: Date; to?: Date }) {
    const where = {
      vehicleId,
      ...(opts.from || opts.to
        ? { startedAt: { ...(opts.from ? { gte: opts.from } : {}), ...(opts.to ? { lte: opts.to } : {}) } }
        : {}),
    }
    const [trips, total] = await Promise.all([
      this.db.trip.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        skip: (opts.page - 1) * opts.pageSize,
        take: opts.pageSize,
      }),
      this.db.trip.count({ where }),
    ])
    return { trips, total }
  }

  async findById(id: string, vehicleId: string) {
    return this.db.trip.findFirst({ where: { id, vehicleId } })
  }

  async create(vehicleId: string, data: Omit<import('@prisma/client').Prisma.TripCreateInput, 'vehicle'>) {
    return this.db.trip.create({ data: { ...data, vehicle: { connect: { id: vehicleId } } } })
  }

  async update(id: string, data: import('@prisma/client').Prisma.TripUpdateInput) {
    return this.db.trip.update({ where: { id }, data })
  }
}
