import type { PrismaClient } from '@prisma/client'

export class StatsRepository {
  constructor(private readonly db: PrismaClient) {}

  async getDistanceSum(vehicleId: string, since: Date): Promise<number> {
    const result = await this.db.trip.aggregate({
      where: { vehicleId, startedAt: { gte: since } },
      _sum: { distanceKm: true },
    })
    return result._sum.distanceKm ?? 0
  }

  async getEnergySum(vehicleId: string, since: Date): Promise<number> {
    const result = await this.db.chargeSession.aggregate({
      where: { vehicleId, startedAt: { gte: since } },
      _sum: { energyAddedKwh: true },
    })
    return result._sum.energyAddedKwh ?? 0
  }

  async getCostSum(vehicleId: string, since: Date): Promise<number> {
    const result = await this.db.chargeSession.aggregate({
      where: { vehicleId, startedAt: { gte: since } },
      _sum: { estimatedCost: true },
    })
    return result._sum.estimatedCost ?? 0
  }

  async getTripsCount(vehicleId: string, since: Date): Promise<number> {
    return this.db.trip.count({ where: { vehicleId, startedAt: { gte: since } } })
  }

  async getChargesCount(vehicleId: string, since: Date): Promise<number> {
    return this.db.chargeSession.count({ where: { vehicleId, startedAt: { gte: since } } })
  }

  async getDailyBatteryTrend(vehicleId: string, since: Date) {
    // Raw groupBy on capturedAt day
    return this.db.$queryRaw<
      Array<{ day: string; min_level: number; max_level: number; avg_level: number }>
    >`
      SELECT
        DATE_TRUNC('day', "captured_at") AS day,
        MIN("battery_level") AS min_level,
        MAX("battery_level") AS max_level,
        AVG("battery_level")::numeric(5,1) AS avg_level
      FROM vehicle_state_snapshots
      WHERE "vehicle_id" = ${vehicleId}
        AND "captured_at" >= ${since}
      GROUP BY 1
      ORDER BY 1 ASC
    `
  }

  async getDailyTripMetrics(vehicleId: string, since: Date) {
    return this.db.$queryRaw<
      Array<{ day: string; distance_km: number; charged_kwh: number }>
    >`
      SELECT
        DATE_TRUNC('day', t."started_at") AS day,
        COALESCE(SUM(t."distance_km"), 0) AS distance_km,
        COALESCE(SUM(c."energy_added_kwh"), 0) AS charged_kwh
      FROM trips t
      FULL OUTER JOIN charge_sessions c
        ON DATE_TRUNC('day', c."started_at") = DATE_TRUNC('day', t."started_at")
        AND c."vehicle_id" = ${vehicleId}
      WHERE t."vehicle_id" = ${vehicleId}
        AND t."started_at" >= ${since}
      GROUP BY 1
      ORDER BY 1 ASC
    `
  }
}
