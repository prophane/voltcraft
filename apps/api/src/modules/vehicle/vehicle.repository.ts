import type { Prisma, PrismaClient } from '@prisma/client'

export class VehicleRepository {
  constructor(private readonly db: PrismaClient) {}

  async findActive(userId: string) {
    return this.db.vehicle.findFirst({
      where: {
        isActive: true,
        deletedAt: null,
        teslaAccount: { userId, isActive: true },
      },
      include: { teslaAccount: true },
    })
  }

  async findById(id: string) {
    return this.db.vehicle.findFirst({
      where: { id, deletedAt: null },
      include: { teslaAccount: true },
    })
  }

  async findAll(userId: string) {
    return this.db.vehicle.findMany({
      where: { deletedAt: null, teslaAccount: { userId, isActive: true } },
      orderBy: { createdAt: 'asc' },
    })
  }

  async upsertVehicle(data: {
    vin: string
    displayName: string
    model?: string
    year?: number
    color?: string
    teslaAccountId: string
  }) {
    return this.db.vehicle.upsert({
      where: { vin: data.vin },
      create: data,
      update: { displayName: data.displayName, model: data.model, color: data.color },
    })
  }

  async getLatestSnapshot(vehicleId: string) {
    return this.db.vehicleStateSnapshot.findFirst({
      where: { vehicleId },
      orderBy: { capturedAt: 'desc' },
    })
  }

  async createSnapshot(
    vehicleId: string,
    data: Omit<Prisma.VehicleStateSnapshotCreateInput, 'vehicle'>,
  ) {
    return this.db.vehicleStateSnapshot.create({
      data: { ...data, vehicle: { connect: { id: vehicleId } } },
    })
  }

  async updateLastSync(accountId: string) {
    return this.db.teslaAccount.update({
      where: { id: accountId },
      data: { lastSyncAt: new Date() },
    })
  }

  async getLatestLocationSnapshot(vehicleId: string) {
    return this.db.vehicleStateSnapshot.findFirst({
      where: {
        vehicleId,
        latitude: { not: null },
        longitude: { not: null },
      },
      orderBy: { capturedAt: 'desc' },
      select: { latitude: true, longitude: true, heading: true, capturedAt: true },
    })
  }

  async getRecentSnapshots(vehicleId: string, hours = 24) {
    const since = new Date(Date.now() - hours * 3_600_000)
    return this.db.vehicleStateSnapshot.findMany({
      where: { vehicleId, capturedAt: { gte: since } },
      orderBy: { capturedAt: 'asc' },
    })
  }

  async getHistory(vehicleId: string, opts: { page: number; pageSize: number; from?: Date; to?: Date }) {
    const where = {
      vehicleId,
      ...(opts.from || opts.to
        ? { capturedAt: { ...(opts.from ? { gte: opts.from } : {}), ...(opts.to ? { lte: opts.to } : {}) } }
        : {}),
    }

    const [snapshots, total] = await Promise.all([
      this.db.vehicleStateSnapshot.findMany({
        where,
        orderBy: { capturedAt: 'desc' },
        skip: (opts.page - 1) * opts.pageSize,
        take: opts.pageSize,
      }),
      this.db.vehicleStateSnapshot.count({ where }),
    ])

    return { snapshots, total }
  }
}
