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
      WITH trip_daily AS (
        SELECT
          DATE_TRUNC('day', t."started_at") AS day,
          COALESCE(SUM(t."distance_km"), 0) AS distance_km
        FROM trips t
        WHERE t."vehicle_id" = ${vehicleId}
          AND t."started_at" >= ${since}
        GROUP BY 1
      ),
      charge_daily AS (
        SELECT
          DATE_TRUNC('day', c."started_at") AS day,
          COALESCE(SUM(c."energy_added_kwh"), 0) AS charged_kwh
        FROM charge_sessions c
        WHERE c."vehicle_id" = ${vehicleId}
          AND c."started_at" >= ${since}
        GROUP BY 1
      )
      SELECT
        COALESCE(td.day, cd.day) AS day,
        COALESCE(td.distance_km, 0) AS distance_km,
        COALESCE(cd.charged_kwh, 0) AS charged_kwh
      FROM trip_daily td
      FULL OUTER JOIN charge_daily cd ON cd.day = td.day
      ORDER BY 1 ASC
    `
  }

  async getBatteryHealthEstimate(vehicleId: string, since: Date) {
    const rows = await this.db.$queryRaw<
      Array<{
        samples_count: number
        best_full_range_km: number | null
        current_full_range_km: number | null
      }>
    >`
      WITH samples AS (
        SELECT
          "captured_at",
          ("battery_range" * 100.0 / NULLIF("battery_level", 0)) AS est_full_range_km
        FROM vehicle_state_snapshots
        WHERE "vehicle_id" = ${vehicleId}
          AND "captured_at" >= ${since}
          AND "battery_level" BETWEEN 20 AND 95
          AND "battery_range" IS NOT NULL
          AND "battery_level" IS NOT NULL
      )
      SELECT
        COUNT(*)::int AS samples_count,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY est_full_range_km) AS best_full_range_km,
        AVG(CASE WHEN "captured_at" >= NOW() - INTERVAL '14 day' THEN est_full_range_km END) AS current_full_range_km
      FROM samples
    `

    const row = rows[0]
    if (!row || row.samples_count < 10 || !row.best_full_range_km || !row.current_full_range_km) {
      return {
        ready: false,
        samplesCount: row?.samples_count ?? 0,
        estimatedHealthPct: null,
        bestFullRangeKm: null,
        currentFullRangeKm: null,
      }
    }

    const estimatedHealthPct = Math.max(0, Math.min(100, (row.current_full_range_km / row.best_full_range_km) * 100))

    return {
      ready: true,
      samplesCount: row.samples_count,
      estimatedHealthPct: Math.round(estimatedHealthPct * 10) / 10,
      bestFullRangeKm: Math.round(row.best_full_range_km * 10) / 10,
      currentFullRangeKm: Math.round(row.current_full_range_km * 10) / 10,
    }
  }

  async getBatteryHealthMeasurements(vehicleId: string, since: Date) {
    return this.db.$queryRaw<
      Array<{ day: string; est_full_range_km: number }>
    >`
      WITH samples AS (
        SELECT
          DATE_TRUNC('day', "captured_at") AS day,
          ("battery_range" * 100.0 / NULLIF("battery_level", 0)) AS est_full_range_km
        FROM vehicle_state_snapshots
        WHERE "vehicle_id" = ${vehicleId}
          AND "captured_at" >= ${since}
          AND "battery_level" BETWEEN 20 AND 95
          AND "battery_range" IS NOT NULL
          AND "battery_level" IS NOT NULL
      )
      SELECT
        day,
        AVG(est_full_range_km)::numeric(8,2) AS est_full_range_km
      FROM samples
      GROUP BY day
      ORDER BY day ASC
    `
  }

  async getIdleSessions(vehicleId: string, since: Date, minDurationMin: number) {
    const snapshots = await this.db.vehicleStateSnapshot.findMany({
      where: {
        vehicleId,
        capturedAt: { gte: since },
      },
      orderBy: { capturedAt: 'asc' },
      select: {
        capturedAt: true,
        isDriving: true,
        isCharging: true,
        batteryLevel: true,
        latitude: true,
        longitude: true,
      },
    })

    const sessions: Array<{
      startedAt: Date
      endedAt: Date
      durationMin: number
      startBatteryLevel: number
      endBatteryLevel: number
      latitude: number | null
      longitude: number | null
    }> = []

    let start: (typeof snapshots)[number] | null = null
    let last: (typeof snapshots)[number] | null = null

    const isIdle = (row: (typeof snapshots)[number]) => !row.isDriving && !row.isCharging

    for (const row of snapshots) {
      if (isIdle(row)) {
        if (!start) start = row
        last = row
        continue
      }

      if (start && last) {
        const durationMin = Math.max(1, Math.round((last.capturedAt.getTime() - start.capturedAt.getTime()) / 60_000))
        if (durationMin >= minDurationMin) {
          sessions.push({
            startedAt: start.capturedAt,
            endedAt: last.capturedAt,
            durationMin,
            startBatteryLevel: start.batteryLevel,
            endBatteryLevel: last.batteryLevel,
            latitude: start.latitude,
            longitude: start.longitude,
          })
        }
      }

      start = null
      last = null
    }

    if (start && last) {
      const durationMin = Math.max(1, Math.round((last.capturedAt.getTime() - start.capturedAt.getTime()) / 60_000))
      if (durationMin >= minDurationMin) {
        sessions.push({
          startedAt: start.capturedAt,
          endedAt: last.capturedAt,
          durationMin,
          startBatteryLevel: start.batteryLevel,
          endBatteryLevel: last.batteryLevel,
          latitude: start.latitude,
          longitude: start.longitude,
        })
      }
    }

    return sessions
  }
}
