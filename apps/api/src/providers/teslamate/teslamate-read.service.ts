import { Pool } from 'pg'
import { env } from '../../config/env.js'

type FallbackSnapshot = {
  capturedAt?: Date | null
  vehicleState?: string | null
  odometer?: number | null
  batteryLevel?: number | null
  batteryRange?: number | null
  chargeLimitSoc?: number | null
  chargeState?: string | null
  isCharging?: boolean | null
  isPluggedIn?: boolean | null
  chargeRate?: number | null
  timeToFullCharge?: number | null
  climateOn?: boolean | null
  insideTemp?: number | null
  outsideTemp?: number | null
  isLocked?: boolean | null
  isTrunkOpen?: boolean | null
  isFrunkOpen?: boolean | null
  isDriving?: boolean | null
  speed?: number | null
  power?: number | null
  latitude?: number | null
  longitude?: number | null
  heading?: number | null
  atHome?: boolean | null
}

type VehicleIdentity = {
  id: string
  vin: string
  displayName: string
  model?: string | null
  year?: number | null
  color?: string | null
}

type PaginationOpts = {
  page: number
  pageSize: number
  from?: Date
  to?: Date
}

type MappedRecord = Record<string, unknown>

type TeslaMateVehicleRow = {
  name: string | null
  model: string | null
  exterior_color: string | null
  trim_badging: string | null
  efficiency: number | string | null
  captured_at: Date | null
  latitude: number | string | null
  longitude: number | string | null
  speed: number | string | null
  power: number | string | null
  odometer: number | string | null
  battery_level: number | null
  usable_battery_level: number | null
  battery_range_km: number | string | null
  inside_temp: number | string | null
  outside_temp: number | string | null
  is_climate_on: boolean | null
  open_state: 'online' | 'offline' | 'asleep' | null
  open_charge_id: number | null
  open_drive_id: number | null
  charge_energy_added: number | string | null
  charger_power: number | string | null
  charger_phases: number | null
  charger_actual_current: number | null
  charger_voltage: number | null
}

function toNumber(value: unknown): number | null {
  if (value == null) return null
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function toDate(value: unknown): Date | null {
  if (!value) return null
  return value instanceof Date ? value : new Date(String(value))
}

function isStaleTelemetry(value: unknown, maxAgeMinutes = 20): boolean {
  const date = toDate(value)
  if (!date) return false
  return Date.now() - date.getTime() > maxAgeMinutes * 60_000
}

function toVehicleState(row: TeslaMateVehicleRow, fallback?: FallbackSnapshot) {
  const stale = isStaleTelemetry(row.captured_at ?? fallback?.capturedAt)

  if (row.open_charge_id) return 'charging'
  if (row.open_drive_id) return 'driving'

  // TeslaMate may still report "online" while last telemetry is old.
  // In that case prefer "offline" to match what users see in TeslaMate UI.
  if (row.open_state === 'online' && stale) return 'offline'
  if (row.open_state) return row.open_state

  if (stale) return 'offline'
  return fallback?.vehicleState ?? 'unknown'
}

function buildTripWhereClause(from?: Date, to?: Date) {
  const clauses: string[] = []
  const params: Array<Date> = []

  if (from) {
    params.push(from)
    clauses.push(`d.start_date >= $${params.length}`)
  }

  if (to) {
    params.push(to)
    clauses.push(`d.start_date <= $${params.length}`)
  }

  return {
    sql: clauses.length > 0 ? ` AND ${clauses.join(' AND ')}` : '',
    params,
  }
}

function buildChargeWhereClause(from?: Date, to?: Date) {
  const clauses: string[] = []
  const params: Array<Date> = []

  if (from) {
    params.push(from)
    clauses.push(`cp.start_date >= $${params.length}`)
  }

  if (to) {
    params.push(to)
    clauses.push(`cp.start_date <= $${params.length}`)
  }

  return {
    sql: clauses.length > 0 ? ` AND ${clauses.join(' AND ')}` : '',
    params,
  }
}

export class TeslaMateReadService {
  private readonly enabled = Boolean(env.TESLAMATE_DB_PASSWORD)
  private readonly pool = this.enabled
    ? new Pool({
        host: env.TESLAMATE_DB_HOST,
        port: env.TESLAMATE_DB_PORT,
        database: env.TESLAMATE_DB_NAME,
        user: env.TESLAMATE_DB_USER,
        password: env.TESLAMATE_DB_PASSWORD,
        max: 4,
      })
    : null
    private failed = false

  isEnabled() {
      return this.enabled
  }

  private async query<T>(text: string, values: unknown[]) {
    if (!this.pool) return [] as T[]
      try {
        const result = await this.pool.query<T>(text, values)
        return result.rows
      } catch (error) {
        this.failed = true
        return [] as T[]
      }
  }

  async getCurrentVehicle(vehicle: VehicleIdentity, fallback?: FallbackSnapshot) {
    if (this.failed) return null
    const row = await this.getVehicleRow(vehicle.vin)
    if (!row) return null

    return {
      id: vehicle.id,
      vin: vehicle.vin,
      displayName: row.name || vehicle.displayName,
      model: row.model || row.trim_badging || vehicle.model,
      year: vehicle.year,
      color: row.exterior_color || vehicle.color,
      state: toVehicleState(row, fallback),
      lastSeenAt: toDate(row.captured_at) ?? fallback?.capturedAt ?? null,
      isCached: true,
    }
  }

  async getVehicleState(vehicle: VehicleIdentity, fallback?: FallbackSnapshot) {
    if (this.failed) return null
    const row = await this.getVehicleRow(vehicle.vin)
    if (!row) return null

    const chargePower = toNumber(row.charger_power)

    return {
      vehicleId: vehicle.id,
      capturedAt: toDate(row.captured_at) ?? fallback?.capturedAt ?? new Date(),
      odometer: toNumber(row.odometer) ?? fallback?.odometer ?? null,
      batteryLevel: row.battery_level ?? fallback?.batteryLevel ?? 0,
      batteryRange: toNumber(row.battery_range_km) ?? fallback?.batteryRange ?? 0,
      chargeLimitSoc: fallback?.chargeLimitSoc ?? null,
      chargeState:
        fallback?.chargeState
        ?? (row.open_charge_id ? (chargePower && chargePower > 0 ? 'Charging' : 'Stopped') : 'Disconnected'),
      isCharging: row.open_charge_id != null || fallback?.isCharging === true,
      isPluggedIn: row.open_charge_id != null || fallback?.isPluggedIn === true,
      chargeRate: fallback?.chargeRate ?? 0,
      timeToFullCharge: fallback?.timeToFullCharge ?? 0,
      climateOn: row.is_climate_on ?? fallback?.climateOn ?? false,
      insideTemp: toNumber(row.inside_temp) ?? fallback?.insideTemp ?? null,
      outsideTemp: toNumber(row.outside_temp) ?? fallback?.outsideTemp ?? null,
      isSeatHeaterOn: false,
      cabinOverheatProtectionMode: 'off',
      isLocked: fallback?.isLocked ?? true,
      isTrunkOpen: fallback?.isTrunkOpen ?? false,
      isFrunkOpen: fallback?.isFrunkOpen ?? false,
      isDriving: row.open_drive_id != null || fallback?.isDriving === true,
      speed: toNumber(row.speed) ?? fallback?.speed ?? null,
      power: toNumber(row.power) ?? fallback?.power ?? null,
      latitude: toNumber(row.latitude) ?? fallback?.latitude ?? null,
      longitude: toNumber(row.longitude) ?? fallback?.longitude ?? null,
      heading: fallback?.heading ?? null,
      atHome: fallback?.atHome ?? false,
      isCached: true,
    }
  }

  async getVehicleLocation(vin: string) {
    if (this.failed) return null
    const row = await this.getVehicleRow(vin)
    const latitude = toNumber(row?.latitude)
    const longitude = toNumber(row?.longitude)
    if (!row || latitude == null || longitude == null) return null

    return {
      latitude,
      longitude,
      heading: null,
      capturedAt: toDate(row.captured_at) ?? new Date(),
      isCached: true,
    }
  }

  async getTrips(vin: string, opts: PaginationOpts) {
    if (this.failed) return null
    const where = buildTripWhereClause(opts.from, opts.to)
    const countRows = await this.query<{ total: string | number }>(
      `
        SELECT COUNT(*)::int AS total
        FROM drives d
        INNER JOIN cars c ON c.id = d.car_id
        WHERE c.vin = $1${where.sql}
      `,
      [vin, ...where.params],
    )

    const rows = await this.query<Array<Record<string, unknown>>[number]>(
      `
        SELECT
          d.id::text AS id,
          d.start_date AS "startedAt",
          d.end_date AS "endedAt",
          d.duration_min AS "durationMin",
          d.distance AS "distanceKm",
          CASE
            WHEN c.efficiency IS NOT NULL AND d.distance IS NOT NULL THEN ROUND((d.distance * c.efficiency)::numeric, 2)
            ELSE NULL
          END AS "energyUsedKwh",
          CASE
            WHEN c.efficiency IS NOT NULL THEN ROUND((c.efficiency * 100)::numeric, 2)
            ELSE NULL
          END AS "avgConsumptionKwh100",
          sa.display_name AS "startAddress",
          ea.display_name AS "endAddress",
          sp.latitude::float8 AS "startLatitude",
          sp.longitude::float8 AS "startLongitude",
          ep.latitude::float8 AS "endLatitude",
          ep.longitude::float8 AS "endLongitude",
          sp.battery_level AS "startBatteryLevel",
          ep.battery_level AS "endBatteryLevel"
        FROM drives d
        INNER JOIN cars c ON c.id = d.car_id
        LEFT JOIN addresses sa ON sa.id = d.start_address_id
        LEFT JOIN addresses ea ON ea.id = d.end_address_id
        LEFT JOIN positions sp ON sp.id = d.start_position_id
        LEFT JOIN positions ep ON ep.id = d.end_position_id
        WHERE c.vin = $1${where.sql}
        ORDER BY d.start_date DESC
        LIMIT $${where.params.length + 2}
        OFFSET $${where.params.length + 3}
      `,
      [vin, ...where.params, opts.pageSize, (opts.page - 1) * opts.pageSize],
    )

    return {
      trips: rows.map((row: MappedRecord) => this.normalizeTrip(row)),
      total: Number(countRows[0]?.total ?? 0),
    }
  }

  async getTripById(vin: string, id: string) {
    if (this.failed) return null
    const rows = await this.query<Array<Record<string, unknown>>[number]>(
      `
        SELECT
          d.id::text AS id,
          d.start_date AS "startedAt",
          d.end_date AS "endedAt",
          d.duration_min AS "durationMin",
          d.distance AS "distanceKm",
          CASE
            WHEN c.efficiency IS NOT NULL AND d.distance IS NOT NULL THEN ROUND((d.distance * c.efficiency)::numeric, 2)
            ELSE NULL
          END AS "energyUsedKwh",
          CASE
            WHEN c.efficiency IS NOT NULL THEN ROUND((c.efficiency * 100)::numeric, 2)
            ELSE NULL
          END AS "avgConsumptionKwh100",
          sa.display_name AS "startAddress",
          ea.display_name AS "endAddress",
          sp.latitude::float8 AS "startLatitude",
          sp.longitude::float8 AS "startLongitude",
          ep.latitude::float8 AS "endLatitude",
          ep.longitude::float8 AS "endLongitude",
          sp.battery_level AS "startBatteryLevel",
          ep.battery_level AS "endBatteryLevel"
        FROM drives d
        INNER JOIN cars c ON c.id = d.car_id
        LEFT JOIN addresses sa ON sa.id = d.start_address_id
        LEFT JOIN addresses ea ON ea.id = d.end_address_id
        LEFT JOIN positions sp ON sp.id = d.start_position_id
        LEFT JOIN positions ep ON ep.id = d.end_position_id
        WHERE c.vin = $1 AND d.id = $2::int
        LIMIT 1
      `,
      [vin, id],
    )

    const row = rows[0]
    return row ? this.normalizeTrip(row) : null
  }

  async getTripPath(vin: string, id: string) {
    if (this.failed) return []
    const rows = await this.query<Array<Record<string, unknown>>[number]>(
      `
        SELECT
          p.date AS "capturedAt",
          p.latitude::float8 AS latitude,
          p.longitude::float8 AS longitude,
          NULL::int AS heading,
          p.speed AS speed,
          TRUE AS "isDriving"
        FROM positions p
        INNER JOIN drives d ON d.id = p.drive_id
        INNER JOIN cars c ON c.id = d.car_id
        WHERE c.vin = $1
          AND d.id = $2::int
          AND p.latitude IS NOT NULL
          AND p.longitude IS NOT NULL
        ORDER BY p.date ASC
      `,
      [vin, id],
    )

    return rows.map((row: MappedRecord) => ({
      capturedAt: toDate(row.capturedAt) ?? new Date(),
      latitude: toNumber(row.latitude),
      longitude: toNumber(row.longitude),
      heading: null,
      speed: toNumber(row.speed),
      isDriving: true,
    }))
  }

  async getCharges(vin: string, opts: PaginationOpts) {
    if (this.failed) return null
    const where = buildChargeWhereClause(opts.from, opts.to)
    const countRows = await this.query<{ total: string | number }>(
      `
        SELECT COUNT(*)::int AS total
        FROM charging_processes cp
        INNER JOIN cars c ON c.id = cp.car_id
        WHERE c.vin = $1${where.sql}
      `,
      [vin, ...where.params],
    )

    const rows = await this.query<Array<Record<string, unknown>>[number]>(
      `
        SELECT
          cp.id::text AS id,
          cp.start_date AS "startedAt",
          cp.end_date AS "endedAt",
          cp.charge_energy_added AS "energyAddedKwh",
          cp.start_battery_level AS "startBatteryLevel",
          cp.end_battery_level AS "endBatteryLevel",
          cp.duration_min AS "durationMin",
          cp.cost AS "estimatedCost",
          cp.start_rated_range_km,
          cp.end_rated_range_km,
          cp.position_id,
          a.display_name AS address,
          p.latitude::float8 AS latitude,
          p.longitude::float8 AS longitude
        FROM charging_processes cp
        INNER JOIN cars c ON c.id = cp.car_id
        LEFT JOIN addresses a ON a.id = cp.address_id
        LEFT JOIN positions p ON p.id = cp.position_id
        WHERE c.vin = $1${where.sql}
        ORDER BY cp.start_date DESC
        LIMIT $${where.params.length + 2}
        OFFSET $${where.params.length + 3}
      `,
      [vin, ...where.params, opts.pageSize, (opts.page - 1) * opts.pageSize],
    )

    return {
      sessions: rows.map((row: MappedRecord) => this.normalizeCharge(row)),
      total: Number(countRows[0]?.total ?? 0),
    }
  }

  async getChargeById(vin: string, id: string) {
    if (this.failed) return null
    const rows = await this.query<Array<Record<string, unknown>>[number]>(
      `
        SELECT
          cp.id::text AS id,
          cp.start_date AS "startedAt",
          cp.end_date AS "endedAt",
          cp.charge_energy_added AS "energyAddedKwh",
          cp.start_battery_level AS "startBatteryLevel",
          cp.end_battery_level AS "endBatteryLevel",
          cp.duration_min AS "durationMin",
          cp.cost AS "estimatedCost",
          a.display_name AS address,
          p.latitude::float8 AS latitude,
          p.longitude::float8 AS longitude
        FROM charging_processes cp
        INNER JOIN cars c ON c.id = cp.car_id
        LEFT JOIN addresses a ON a.id = cp.address_id
        LEFT JOIN positions p ON p.id = cp.position_id
        WHERE c.vin = $1 AND cp.id = $2::int
        LIMIT 1
      `,
      [vin, id],
    )

    const row = rows[0]
    return row ? this.normalizeCharge(row) : null
  }

  async getMonthlyChargeSummary(vin: string, year: number, month: number) {
    if (this.failed) return null
    const from = new Date(year, month - 1, 1)
    const to = new Date(year, month, 1)

    const rows = await this.query<{
      energy_added_kwh: number | string | null
      estimated_cost: number | string | null
      duration_min: number | string | null
      total: number | string
    }>(
      `
        SELECT
          COALESCE(SUM(cp.charge_energy_added), 0) AS energy_added_kwh,
          COALESCE(SUM(cp.cost), 0) AS estimated_cost,
          COALESCE(SUM(cp.duration_min), 0) AS duration_min,
          COUNT(*)::int AS total
        FROM charging_processes cp
        INNER JOIN cars c ON c.id = cp.car_id
        WHERE c.vin = $1
          AND cp.start_date >= $2
          AND cp.start_date < $3
      `,
      [vin, from, to],
    )

    const row = rows[0]
    return {
      _sum: {
        energyAddedKwh: toNumber(row?.energy_added_kwh) ?? 0,
        estimatedCost: toNumber(row?.estimated_cost) ?? 0,
        durationMin: toNumber(row?.duration_min) ?? 0,
      },
      _count: {
        id: Number(row?.total ?? 0),
      },
    }
  }

  async getSummary(vin: string, since: Date, days: number) {
    if (this.failed) return null
    const rows = await this.query<{
      distance_km: number | string | null
      energy_added_kwh: number | string | null
      energy_used_kwh: number | string | null
      estimated_cost_eur: number | string | null
      trips_count: number | string
      charge_sessions_count: number | string
    }>(
      `
        WITH drive_stats AS (
          SELECT
            COALESCE(SUM(d.distance), 0) AS distance_km,
            COALESCE(SUM(d.distance * COALESCE(c.efficiency, 0)), 0) AS energy_used_kwh,
            COUNT(*)::int AS trips_count
          FROM drives d
          INNER JOIN cars c ON c.id = d.car_id
          WHERE c.vin = $1
            AND d.start_date >= $2
        ),
        charge_stats AS (
          SELECT
            COALESCE(SUM(cp.charge_energy_added), 0) AS energy_added_kwh,
            COALESCE(SUM(cp.cost), 0) AS estimated_cost_eur,
            COUNT(*)::int AS charge_sessions_count
          FROM charging_processes cp
          INNER JOIN cars c ON c.id = cp.car_id
          WHERE c.vin = $1
            AND cp.start_date >= $2
        )
        SELECT
          ds.distance_km,
          cs.energy_added_kwh,
          ds.energy_used_kwh,
          cs.estimated_cost_eur,
          ds.trips_count,
          cs.charge_sessions_count
        FROM drive_stats ds
        CROSS JOIN charge_stats cs
      `,
      [vin, since],
    )

    const row = rows[0]
    const distanceKm = toNumber(row?.distance_km) ?? 0
    const energyUsedKwh = toNumber(row?.energy_used_kwh) ?? 0

    return {
      periodDays: days,
      distanceKm: Math.round(distanceKm * 10) / 10,
      energyAddedKwh: Math.round((toNumber(row?.energy_added_kwh) ?? 0) * 10) / 10,
      energyUsedKwh: Math.round(energyUsedKwh * 10) / 10,
      estimatedCostEur: Math.round((toNumber(row?.estimated_cost_eur) ?? 0) * 100) / 100,
      avgConsumptionKwhPer100km: distanceKm > 0 ? Math.round((energyUsedKwh / distanceKm) * 100 * 10) / 10 : null,
      tripsCount: Number(row?.trips_count ?? 0),
      chargeSessionsCount: Number(row?.charge_sessions_count ?? 0),
    }
  }

  private async getVehicleRow(vin: string) {
    const rows = await this.query<TeslaMateVehicleRow>(
      `
        SELECT
          c.name,
          c.model,
          c.exterior_color,
          c.trim_badging,
          c.efficiency,
          p.date AS captured_at,
          p.latitude,
          p.longitude,
          p.speed,
          p.power,
          p.odometer,
          p.battery_level,
          p.usable_battery_level,
          COALESCE(p.rated_battery_range_km, p.est_battery_range_km, p.ideal_battery_range_km) AS battery_range_km,
          p.inside_temp,
          p.outside_temp,
          p.is_climate_on,
          st.state AS open_state,
          cp.id AS open_charge_id,
          d.id AS open_drive_id,
          ch.charge_energy_added,
          ch.charger_power,
          ch.charger_phases,
          ch.charger_actual_current,
          ch.charger_voltage
        FROM cars c
        LEFT JOIN LATERAL (
          SELECT *
          FROM positions p
          WHERE p.car_id = c.id
          ORDER BY p.date DESC
          LIMIT 1
        ) p ON TRUE
        LEFT JOIN LATERAL (
          SELECT *
          FROM states s
          WHERE s.car_id = c.id
            AND s.end_date IS NULL
          ORDER BY s.start_date DESC
          LIMIT 1
        ) st ON TRUE
        LEFT JOIN LATERAL (
          SELECT *
          FROM charging_processes cp
          WHERE cp.car_id = c.id
            AND cp.end_date IS NULL
          ORDER BY cp.start_date DESC
          LIMIT 1
        ) cp ON TRUE
        LEFT JOIN LATERAL (
          SELECT *
          FROM drives d
          WHERE d.car_id = c.id
            AND d.end_date IS NULL
          ORDER BY d.start_date DESC
          LIMIT 1
        ) d ON TRUE
        LEFT JOIN LATERAL (
          SELECT *
          FROM charges ch
          WHERE ch.charging_process_id = cp.id
          ORDER BY ch.date DESC
          LIMIT 1
        ) ch ON TRUE
        WHERE c.vin = $1
        LIMIT 1
      `,
      [vin],
    )

    return rows[0] ?? null
  }

  private normalizeTrip(row: Record<string, unknown>) {
    return {
      id: String(row.id),
      startedAt: toDate(row.startedAt),
      endedAt: toDate(row.endedAt),
      durationMin: toNumber(row.durationMin),
      distanceKm: toNumber(row.distanceKm),
      energyUsedKwh: toNumber(row.energyUsedKwh),
      avgConsumptionKwh100: toNumber(row.avgConsumptionKwh100),
      startAddress: row.startAddress ? String(row.startAddress) : null,
      endAddress: row.endAddress ? String(row.endAddress) : null,
      startLatitude: toNumber(row.startLatitude),
      startLongitude: toNumber(row.startLongitude),
      endLatitude: toNumber(row.endLatitude),
      endLongitude: toNumber(row.endLongitude),
      startBatteryLevel: toNumber(row.startBatteryLevel),
      endBatteryLevel: toNumber(row.endBatteryLevel),
      notes: null,
    }
  }

  private normalizeCharge(row: Record<string, unknown>) {
    return {
      id: String(row.id),
      startedAt: toDate(row.startedAt),
      endedAt: toDate(row.endedAt),
      energyAddedKwh: toNumber(row.energyAddedKwh),
      startBatteryLevel: toNumber(row.startBatteryLevel),
      endBatteryLevel: toNumber(row.endBatteryLevel),
      chargeLimitSoc: null,
      chargeType: 'UNKNOWN',
      maxChargeKw: null,
      avgChargeKw: null,
      chargerPower: null,
      durationMin: toNumber(row.durationMin),
      latitude: toNumber(row.latitude),
      longitude: toNumber(row.longitude),
      address: row.address ? String(row.address) : null,
      pricePerKwh: null,
      estimatedCost: toNumber(row.estimatedCost),
      currency: 'EUR',
      notes: null,
    }
  }
}