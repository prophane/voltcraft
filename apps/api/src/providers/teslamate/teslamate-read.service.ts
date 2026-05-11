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
  charge_captured_at: Date | null
  charge_energy_added: number | string | null
  charger_power: number | string | null
  charger_phases: number | null
  charger_actual_current: number | null
  charger_voltage: number | null
  conn_charge_cable?: string | null
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

function isChargeSignalFresh(positionCapturedAt: unknown, chargeCapturedAt: unknown, maxSkewMinutes = 6, maxAgeMinutes = 8): boolean {
  const posAt = toDate(positionCapturedAt)
  const chargeAt = toDate(chargeCapturedAt)
  if (!posAt || !chargeAt) return false
  if (isStaleTelemetry(chargeAt, maxAgeMinutes)) return false
  return chargeAt.getTime() >= posAt.getTime() - maxSkewMinutes * 60_000
}

function resolveOdometer(teslamateOdometer: number | null, fallbackOdometer: number | null, capturedAt: Date | null) {
  if (teslamateOdometer == null) return fallbackOdometer ?? null
  if (fallbackOdometer == null) return teslamateOdometer

  const stale = isStaleTelemetry(capturedAt, 180)
  const diff = Math.abs(teslamateOdometer - fallbackOdometer)

  if (stale || diff >= 10) {
    // Prefer the higher value when sources diverge strongly; it avoids common mi/km or stale-point underestimation.
    return Math.max(teslamateOdometer, fallbackOdometer)
  }

  return teslamateOdometer
}

function coordLabel(lat: unknown, lon: unknown) {
  const la = toNumber(lat)
  const lo = toNumber(lon)
  if (la == null || lo == null) return null
  return `${la.toFixed(5)}, ${lo.toFixed(5)}`
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 6371 * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)))
}

function toVehicleState(row: TeslaMateVehicleRow, fallback?: FallbackSnapshot) {
  const stale = isStaleTelemetry(row.captured_at ?? fallback?.capturedAt)
  const chargePower = toNumber(row.charger_power)
  const chargerCurrent = toNumber(row.charger_actual_current)
  const chargeSignalFresh = isChargeSignalFresh(row.captured_at, row.charge_captured_at)
  const isCharging = row.open_charge_id != null
    ? (
      chargeSignalFresh && (
        (chargePower != null && chargePower > 0)
        || (chargerCurrent != null && chargerCurrent > 0)
      )
    )
    : fallback?.isCharging === true

  if (isCharging) return 'charging'
  if (row.open_drive_id) return 'driving'

  // TeslaMate may still report "online" while last telemetry is old.
  // In that case prefer "offline" to match what users see in TeslaMate UI.
  if (row.open_state === 'online' && stale) return 'offline'
  if (row.open_state) return row.open_state

  if (stale) return 'offline'
  return fallback?.vehicleState ?? 'unknown'
}

function buildTripWhereClause(from?: Date, to?: Date, paramOffset = 1) {
  const clauses: string[] = []
  const params: Array<Date> = []

  if (from) {
    params.push(from)
    clauses.push(`d.start_date >= $${paramOffset + params.length}`)
  }

  if (to) {
    params.push(to)
    clauses.push(`d.start_date <= $${paramOffset + params.length}`)
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

function isTeslaMateAuthError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /password authentication failed for user|28P01/i.test(message)
}

export function formatTeslaMateUnavailableMessage(action: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (isTeslaMateAuthError(error)) {
    return [
      `TeslaMate ${action} failed: ${message}`,
      'TeslaMate DB authentication failed. If the teslamate-db volume already exists, changing .env does not update the internal PostgreSQL password; align TESLAMATE_DB_PASSWORD with the existing volume or recreate the volume.',
    ].join(' ')
  }

  return `TeslaMate ${action} failed: ${message}`
}

export class TeslaMateReadService {
  private pool: Pool | null = null
  private poolConfigKey: string | null = null
  private readonly odometerMultiplierCache = new Map<string, { value: number; at: number }>()

  private getConfigKey() {
    return [
      env.TESLAMATE_DB_HOST,
      env.TESLAMATE_DB_PORT,
      env.TESLAMATE_DB_NAME,
      env.TESLAMATE_DB_USER,
      env.TESLAMATE_DB_PASSWORD,
    ].join('|')
  }

  private getPool() {
    if (!env.TESLAMATE_DB_PASSWORD) {
      return null
    }

    const nextKey = this.getConfigKey()
    if (this.pool && this.poolConfigKey === nextKey) {
      return this.pool
    }

    this.pool = new Pool({
      host: env.TESLAMATE_DB_HOST,
      port: env.TESLAMATE_DB_PORT,
      database: env.TESLAMATE_DB_NAME,
      user: env.TESLAMATE_DB_USER,
      password: env.TESLAMATE_DB_PASSWORD,
      max: 4,
    })
    this.poolConfigKey = nextKey
    return this.pool
  }

  isEnabled() {
    return Boolean(env.TESLAMATE_DB_PASSWORD)
  }

  private async query<T>(text: string, values: unknown[]) {
    const pool = this.getPool()
    if (!pool) return [] as T[]
    try {
      const result = await pool.query<T>(text, values)
      return result.rows
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`[TeslaMateReadService] query failed: ${message}`)
      return [] as T[]
    }
  }

  private async queryOrThrow<T>(text: string, values: unknown[]) {
    const pool = this.getPool()
    if (!pool) return [] as T[]
    try {
      const result = await pool.query<T>(text, values)
      return result.rows
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`[TeslaMateReadService] queryOrThrow failed: ${message}`)
      throw error
    }
  }

  private async inferOdometerMultiplier(vin: string): Promise<number> {
    if (env.TESLAMATE_FORCE_MILES_TO_KM) {
      this.odometerMultiplierCache.set(vin, { value: 1.609344, at: Date.now() })
      return 1.609344
    }

    const cached = this.odometerMultiplierCache.get(vin)
    if (cached && Date.now() - cached.at < 5 * 60_000) {
      return cached.value
    }

    const rows = await this.query<{
      start_odometer: number | string | null
      end_odometer: number | string | null
      start_latitude: number | string | null
      start_longitude: number | string | null
      end_latitude: number | string | null
      end_longitude: number | string | null
    }>(
      `
        SELECT
          sp.odometer AS start_odometer,
          ep.odometer AS end_odometer,
          sp.latitude AS start_latitude,
          sp.longitude AS start_longitude,
          ep.latitude AS end_latitude,
          ep.longitude AS end_longitude
        FROM drives d
        INNER JOIN cars c ON c.id = d.car_id
        LEFT JOIN positions sp ON sp.id = d.start_position_id
        LEFT JOIN positions ep ON ep.id = d.end_position_id
        WHERE c.vin = $1
          AND sp.odometer IS NOT NULL
          AND ep.odometer IS NOT NULL
          AND sp.latitude IS NOT NULL
          AND sp.longitude IS NOT NULL
          AND ep.latitude IS NOT NULL
          AND ep.longitude IS NOT NULL
        ORDER BY d.start_date DESC
        LIMIT 16
      `,
      [vin],
    )

    let mileVotes = 0
    let kmVotes = 0
    for (const row of rows) {
      const start = toNumber(row.start_odometer)
      const end = toNumber(row.end_odometer)
      const startLat = toNumber(row.start_latitude)
      const startLon = toNumber(row.start_longitude)
      const endLat = toNumber(row.end_latitude)
      const endLon = toNumber(row.end_longitude)
      if (start == null || end == null || startLat == null || startLon == null || endLat == null || endLon == null) continue

      const distanceKm = haversineKm(startLat, startLon, endLat, endLon)
      if (!Number.isFinite(distanceKm) || distanceKm < 0.5) continue

      const delta = end - start
      if (!Number.isFinite(delta) || delta <= 0) continue

      const asKmError = Math.abs(delta - distanceKm)
      const asMiError = Math.abs(delta * 1.609344 - distanceKm)

      if (asMiError + 0.2 < asKmError) {
        mileVotes += 1
      } else {
        kmVotes += 1
      }
    }

    // When ambiguous, keep km to avoid inflating distance/odometer values.
    const hasStrongMilesSignal = mileVotes >= 3 && mileVotes > kmVotes
    const multiplier = hasStrongMilesSignal ? 1.609344 : 1
    this.odometerMultiplierCache.set(vin, { value: multiplier, at: Date.now() })
    return multiplier
  }

  async getCurrentVehicle(vehicle: VehicleIdentity, fallback?: FallbackSnapshot) {
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
    const row = await this.getVehicleRow(vehicle.vin)
    if (!row) return null

    const chargePower = toNumber(row.charger_power)
    const chargerCurrent = toNumber(row.charger_actual_current)
    const chargeSignalFresh = isChargeSignalFresh(row.captured_at, row.charge_captured_at)
    const cable = (row.conn_charge_cable ?? '').toLowerCase()
    const hasCableConnected = cable !== '' && cable !== 'none'
    const isPluggedIn = hasCableConnected && chargeSignalFresh
    const isCharging = row.open_charge_id != null
      ? (
        chargeSignalFresh && (
          (chargePower != null && chargePower > 0)
          || (chargerCurrent != null && chargerCurrent > 0)
        )
      )
      : fallback?.isCharging === true
    const chargeState = isPluggedIn
      ? (isCharging ? 'Charging' : 'Stopped')
      : 'Disconnected'
    const odometerMultiplier = await this.inferOdometerMultiplier(vehicle.vin)
    const speedMultiplier = odometerMultiplier
    const teslamateOdometer = toNumber(row.odometer)
    const teslamateOdometerKm = teslamateOdometer != null ? teslamateOdometer * odometerMultiplier : null
    const fallbackOdometer = toNumber(fallback?.odometer)
    const fallbackOdometerKm = fallbackOdometer != null ? fallbackOdometer * odometerMultiplier : null
    const odometer = resolveOdometer(teslamateOdometerKm, fallbackOdometerKm, toDate(row.captured_at))

    return {
      vehicleId: vehicle.id,
      capturedAt: toDate(row.captured_at) ?? fallback?.capturedAt ?? new Date(),
      odometer,
      batteryLevel: row.battery_level ?? fallback?.batteryLevel ?? 0,
      batteryRange: toNumber(row.battery_range_km) ?? fallback?.batteryRange ?? 0,
      chargeLimitSoc: fallback?.chargeLimitSoc ?? null,
      chargeState,
      isCharging,
      isPluggedIn,
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
      speed: toNumber(row.speed) != null ? (toNumber(row.speed) as number) * speedMultiplier : fallback?.speed ?? null,
      power: toNumber(row.power) ?? fallback?.power ?? null,
      latitude: toNumber(row.latitude) ?? fallback?.latitude ?? null,
      longitude: toNumber(row.longitude) ?? fallback?.longitude ?? null,
      heading: fallback?.heading ?? null,
      atHome: fallback?.atHome ?? false,
      isCached: true,
    }
  }

  async getVehicleLocation(vin: string) {
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
    const distanceMultiplier = await this.inferOdometerMultiplier(vin)
    const where = buildTripWhereClause(opts.from, opts.to, 1)
    const countRows = await this.queryOrThrow<{ total: string | number }>(
      `
        SELECT COUNT(*)::int AS total
        FROM drives d
        INNER JOIN cars c ON c.id = d.car_id
        WHERE c.vin = $1${where.sql}
      `,
      [vin, ...where.params],
    )

    const rows = await this.queryOrThrow<Array<Record<string, unknown>>[number]>(
      `
        SELECT
          d.id::text AS id,
          d.start_date AS "startedAt",
          d.end_date AS "endedAt",
          d.duration_min AS "durationMin",
          d.distance AS "distanceKm",
          CASE
            WHEN d.start_ideal_range_km IS NOT NULL AND d.end_ideal_range_km IS NOT NULL AND c.efficiency IS NOT NULL
              THEN ROUND(((d.start_ideal_range_km - d.end_ideal_range_km) * c.efficiency)::numeric, 2)
            WHEN c.efficiency IS NOT NULL AND d.distance IS NOT NULL
              THEN ROUND((d.distance * c.efficiency)::numeric, 2)
            ELSE NULL
          END AS "energyUsedKwh",
          CASE
            WHEN d.start_ideal_range_km IS NOT NULL AND d.end_ideal_range_km IS NOT NULL AND d.distance > 0 AND c.efficiency IS NOT NULL
              THEN ROUND(((d.start_ideal_range_km - d.end_ideal_range_km) * c.efficiency / d.distance * 100)::numeric, 1)
            WHEN c.efficiency IS NOT NULL
              THEN ROUND((c.efficiency * 100)::numeric, 1)
            ELSE NULL
          END AS "avgConsumptionKwh100",
          CASE
            WHEN sg.name IS NOT NULL THEN sg.name
            WHEN sa.name IS NOT NULL AND sa.road IS NOT NULL THEN sa.name || ', ' || sa.road || ', ' || COALESCE(sa.city, sa.county)
            WHEN sa.house_number IS NOT NULL AND sa.road IS NOT NULL THEN sa.house_number || ' ' || sa.road || ', ' || COALESCE(sa.city, sa.county)
            WHEN sa.road IS NOT NULL THEN sa.road || ', ' || COALESCE(sa.city, sa.county)
            ELSE COALESCE(sa.name, sa.display_name)
          END AS "startAddress",
          CASE
            WHEN eg.name IS NOT NULL THEN eg.name
            WHEN ea.name IS NOT NULL AND ea.road IS NOT NULL THEN ea.name || ', ' || ea.road || ', ' || COALESCE(ea.city, ea.county)
            WHEN ea.house_number IS NOT NULL AND ea.road IS NOT NULL THEN ea.house_number || ' ' || ea.road || ', ' || COALESCE(ea.city, ea.county)
            WHEN ea.road IS NOT NULL THEN ea.road || ', ' || COALESCE(ea.city, ea.county)
            ELSE COALESCE(ea.name, ea.display_name)
          END AS "endAddress",
          sp.latitude::float8 AS "startLatitude",
          sp.longitude::float8 AS "startLongitude",
          ep.latitude::float8 AS "endLatitude",
          ep.longitude::float8 AS "endLongitude",
          sp.battery_level AS "startBatteryLevel",
          ep.battery_level AS "endBatteryLevel"
        FROM drives d
        INNER JOIN cars c ON c.id = d.car_id
        LEFT JOIN positions sp ON sp.id = d.start_position_id
        LEFT JOIN positions ep ON ep.id = d.end_position_id
        LEFT JOIN addresses sa ON sa.id = d.start_address_id
        LEFT JOIN addresses ea ON ea.id = d.end_address_id
        LEFT JOIN geofences sg ON sg.id = d.start_geofence_id
        LEFT JOIN geofences eg ON eg.id = d.end_geofence_id
        WHERE c.vin = $1${where.sql}
        ORDER BY d.start_date DESC
        LIMIT $${where.params.length + 2}
        OFFSET $${where.params.length + 3}
      `,
      [vin, ...where.params, opts.pageSize, (opts.page - 1) * opts.pageSize],
    )

    return {
      trips: rows.map((row: MappedRecord) => this.normalizeTrip(row, distanceMultiplier)),
      total: Number(countRows[0]?.total ?? 0),
    }
  }

  async getTripById(vin: string, id: string) {
    const distanceMultiplier = await this.inferOdometerMultiplier(vin)
    try {
      const rows = await this.queryOrThrow<Array<Record<string, unknown>>[number]>(
      `
        SELECT
          d.id::text AS id,
          d.start_date AS "startedAt",
          d.end_date AS "endedAt",
          d.duration_min AS "durationMin",
          d.distance AS "distanceKm",
          CASE
            WHEN d.start_ideal_range_km IS NOT NULL AND d.end_ideal_range_km IS NOT NULL AND c.efficiency IS NOT NULL
              THEN ROUND(((d.start_ideal_range_km - d.end_ideal_range_km) * c.efficiency)::numeric, 2)
            WHEN c.efficiency IS NOT NULL AND d.distance IS NOT NULL
              THEN ROUND((d.distance * c.efficiency)::numeric, 2)
            ELSE NULL
          END AS "energyUsedKwh",
          CASE
            WHEN d.start_ideal_range_km IS NOT NULL AND d.end_ideal_range_km IS NOT NULL AND d.distance > 0 AND c.efficiency IS NOT NULL
              THEN ROUND(((d.start_ideal_range_km - d.end_ideal_range_km) * c.efficiency / d.distance * 100)::numeric, 1)
            WHEN c.efficiency IS NOT NULL
              THEN ROUND((c.efficiency * 100)::numeric, 1)
            ELSE NULL
          END AS "avgConsumptionKwh100",
          CASE
            WHEN sg.name IS NOT NULL THEN sg.name
            WHEN sa.name IS NOT NULL AND sa.road IS NOT NULL THEN sa.name || ', ' || sa.road || ', ' || COALESCE(sa.city, sa.county)
            WHEN sa.house_number IS NOT NULL AND sa.road IS NOT NULL THEN sa.house_number || ' ' || sa.road || ', ' || COALESCE(sa.city, sa.county)
            WHEN sa.road IS NOT NULL THEN sa.road || ', ' || COALESCE(sa.city, sa.county)
            ELSE COALESCE(sa.name, sa.display_name)
          END AS "startAddress",
          CASE
            WHEN eg.name IS NOT NULL THEN eg.name
            WHEN ea.name IS NOT NULL AND ea.road IS NOT NULL THEN ea.name || ', ' || ea.road || ', ' || COALESCE(ea.city, ea.county)
            WHEN ea.house_number IS NOT NULL AND ea.road IS NOT NULL THEN ea.house_number || ' ' || ea.road || ', ' || COALESCE(ea.city, ea.county)
            WHEN ea.road IS NOT NULL THEN ea.road || ', ' || COALESCE(ea.city, ea.county)
            ELSE COALESCE(ea.name, ea.display_name)
          END AS "endAddress",
          sp.latitude::float8 AS "startLatitude",
          sp.longitude::float8 AS "startLongitude",
          ep.latitude::float8 AS "endLatitude",
          ep.longitude::float8 AS "endLongitude",
          sp.battery_level AS "startBatteryLevel",
          ep.battery_level AS "endBatteryLevel"
        FROM drives d
        INNER JOIN cars c ON c.id = d.car_id
        LEFT JOIN positions sp ON sp.id = d.start_position_id
        LEFT JOIN positions ep ON ep.id = d.end_position_id
        LEFT JOIN addresses sa ON sa.id = d.start_address_id
        LEFT JOIN addresses ea ON ea.id = d.end_address_id
        LEFT JOIN geofences sg ON sg.id = d.start_geofence_id
        LEFT JOIN geofences eg ON eg.id = d.end_geofence_id
        WHERE c.vin = $1 AND d.id = $2::int
        LIMIT 1
      `,
      [vin, id],
    )

      const row = rows[0]
      return row ? this.normalizeTrip(row, distanceMultiplier) : null
    } catch {
      return null
    }
  }

  async getTripPath(vin: string, id: string) {
    const odometerMultiplier = await this.inferOdometerMultiplier(vin)
    const speedMultiplier = odometerMultiplier
    const rows = await this.query<Array<Record<string, unknown>>[number]>(
      `
        WITH target_drive AS (
          SELECT
            d.id,
            d.car_id,
            d.start_date,
            COALESCE(
              d.end_date,
              d.start_date + (COALESCE(d.duration_min, 0) * INTERVAL '1 minute')
            ) AS end_date,
            d.start_position_id,
            d.end_position_id
          FROM drives d
          INNER JOIN cars c ON c.id = d.car_id
          WHERE c.vin = $1
            AND d.id = $2::int
          LIMIT 1
        ),
        range_positions AS (
          SELECT
            p.date AS "capturedAt",
            p.latitude::float8 AS latitude,
            p.longitude::float8 AS longitude,
            p.speed AS speed,
            p.power AS power,
            p.odometer AS odometer,
            p.battery_level AS "batteryLevel"
          FROM positions p
          INNER JOIN target_drive td ON td.car_id = p.car_id
          WHERE p.latitude IS NOT NULL
            AND p.longitude IS NOT NULL
            AND p.date >= (td.start_date - INTERVAL '45 seconds')
            AND p.date <= (td.end_date + INTERVAL '45 seconds')
        ),
        edge_positions AS (
          SELECT
            p.date AS "capturedAt",
            p.latitude::float8 AS latitude,
            p.longitude::float8 AS longitude,
            p.speed AS speed,
            p.power AS power,
            p.odometer AS odometer,
            p.battery_level AS "batteryLevel"
          FROM target_drive td
          INNER JOIN positions p ON p.id = td.start_position_id

          UNION ALL

          SELECT
            p.date AS "capturedAt",
            p.latitude::float8 AS latitude,
            p.longitude::float8 AS longitude,
            p.speed AS speed,
            p.power AS power,
            p.odometer AS odometer,
            p.battery_level AS "batteryLevel"
          FROM target_drive td
          INNER JOIN positions p ON p.id = td.end_position_id
        ),
        merged AS (
          SELECT * FROM range_positions
          UNION ALL
          SELECT * FROM edge_positions
        )
        SELECT
          m."capturedAt",
          m.latitude,
          m.longitude,
          NULL::int AS heading,
          m.speed,
          m.power,
          m.odometer,
          m."batteryLevel",
          TRUE AS "isDriving"
        FROM merged m
        ORDER BY m."capturedAt" ASC
      `,
      [vin, id],
    )

    const deduped: Array<Record<string, unknown>> = []
    let lastKey: string | null = null
    for (const row of rows) {
      const lat = toNumber(row.latitude)
      const lon = toNumber(row.longitude)
      const at = toDate(row.capturedAt)?.getTime() ?? 0
      if (lat == null || lon == null) continue
      const key = `${lat.toFixed(6)}:${lon.toFixed(6)}:${at}`
      if (key === lastKey) continue
      deduped.push(row)
      lastKey = key
    }

    return deduped.map((row: MappedRecord) => ({
      capturedAt: toDate(row.capturedAt) ?? new Date(),
      latitude: toNumber(row.latitude),
      longitude: toNumber(row.longitude),
      heading: null,
      speed: toNumber(row.speed) != null ? (toNumber(row.speed) as number) * speedMultiplier : null,
      power: toNumber(row.power),
      odometer: toNumber(row.odometer) != null ? (toNumber(row.odometer) as number) * odometerMultiplier : null,
      batteryLevel: toNumber(row.batteryLevel),
      isDriving: true,
    }))
  }

  async getCharges(vin: string, opts: PaginationOpts) {
    const where = buildChargeWhereClause(opts.from, opts.to)
    const countRows = await this.queryOrThrow<{ total: string | number }>(
      `
        SELECT COUNT(*)::int AS total
        FROM charging_processes cp
        INNER JOIN cars c ON c.id = cp.car_id
        WHERE c.vin = $1${where.sql}
      `,
      [vin, ...where.params],
    )

    const rows = await this.queryOrThrow<Array<Record<string, unknown>>[number]>(
      `
        SELECT
          cp.id::text AS id,
          cp.start_date AS "startedAt",
          cp.end_date AS "endedAt",
          COALESCE(cp.charge_energy_added, lc.charge_energy_added) AS "energyAddedKwh",
          cp.start_battery_level AS "startBatteryLevel",
          cp.end_battery_level AS "endBatteryLevel",
          cp.duration_min AS "durationMin",
          cp.cost::float8 AS "estimatedCost",
          cp.start_rated_range_km,
          cp.end_rated_range_km,
          cp.position_id,
          CASE
            WHEN g.name IS NOT NULL THEN g.name
            WHEN a.name IS NOT NULL AND a.road IS NOT NULL THEN a.name || ', ' || a.road || ', ' || COALESCE(a.city, a.county)
            WHEN a.house_number IS NOT NULL AND a.road IS NOT NULL THEN a.house_number || ' ' || a.road || ', ' || COALESCE(a.city, a.county)
            WHEN a.road IS NOT NULL THEN a.road || ', ' || COALESCE(a.city, a.county)
            ELSE COALESCE(a.name, a.display_name)
          END AS address,
          p.latitude::float8 AS latitude,
          p.longitude::float8 AS longitude,
          cp_agg.max_charger_power_kw AS "maxChargeKw",
          cp_agg.avg_charger_power_kw AS "avgChargeKw",
          cp_agg.latest_charger_power_kw AS "chargerPower"
        FROM charging_processes cp
        INNER JOIN cars c ON c.id = cp.car_id
        LEFT JOIN addresses a ON a.id = cp.address_id
        LEFT JOIN geofences g ON g.id = cp.geofence_id
        LEFT JOIN positions p ON p.id = cp.position_id
        LEFT JOIN LATERAL (
          SELECT ch.charge_energy_added
          FROM charges ch
          WHERE ch.charging_process_id = cp.id
          ORDER BY ch.date DESC
          LIMIT 1
        ) lc ON TRUE
        LEFT JOIN LATERAL (
          SELECT
            MAX(ch.charger_power)::float8 AS max_charger_power_kw,
            AVG(ch.charger_power)::float8 AS avg_charger_power_kw,
            (
              SELECT ch2.charger_power
              FROM charges ch2
              WHERE ch2.charging_process_id = cp.id
              ORDER BY ch2.date DESC
              LIMIT 1
            )::float8 AS latest_charger_power_kw
          FROM charges ch
          WHERE ch.charging_process_id = cp.id
        ) cp_agg ON TRUE
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
    try {
      const rows = await this.queryOrThrow<Array<Record<string, unknown>>[number]>(
      `
        SELECT
          cp.id::text AS id,
          cp.start_date AS "startedAt",
          cp.end_date AS "endedAt",
          COALESCE(cp.charge_energy_added, lc.charge_energy_added) AS "energyAddedKwh",
          cp.start_battery_level AS "startBatteryLevel",
          cp.end_battery_level AS "endBatteryLevel",
          cp.duration_min AS "durationMin",
          cp.cost::float8 AS "estimatedCost",
          CASE
            WHEN g.name IS NOT NULL THEN g.name
            WHEN a.name IS NOT NULL AND a.road IS NOT NULL THEN a.name || ', ' || a.road || ', ' || COALESCE(a.city, a.county)
            WHEN a.house_number IS NOT NULL AND a.road IS NOT NULL THEN a.house_number || ' ' || a.road || ', ' || COALESCE(a.city, a.county)
            WHEN a.road IS NOT NULL THEN a.road || ', ' || COALESCE(a.city, a.county)
            ELSE COALESCE(a.name, a.display_name)
          END AS address,
          p.latitude::float8 AS latitude,
          p.longitude::float8 AS longitude,
          cp_agg.max_charger_power_kw AS "maxChargeKw",
          cp_agg.avg_charger_power_kw AS "avgChargeKw",
          cp_agg.latest_charger_power_kw AS "chargerPower"
        FROM charging_processes cp
        INNER JOIN cars c ON c.id = cp.car_id
        LEFT JOIN addresses a ON a.id = cp.address_id
        LEFT JOIN geofences g ON g.id = cp.geofence_id
        LEFT JOIN positions p ON p.id = cp.position_id
        LEFT JOIN LATERAL (
          SELECT ch.charge_energy_added
          FROM charges ch
          WHERE ch.charging_process_id = cp.id
          ORDER BY ch.date DESC
          LIMIT 1
        ) lc ON TRUE
        LEFT JOIN LATERAL (
          SELECT
            MAX(ch.charger_power)::float8 AS max_charger_power_kw,
            AVG(ch.charger_power)::float8 AS avg_charger_power_kw,
            (
              SELECT ch2.charger_power
              FROM charges ch2
              WHERE ch2.charging_process_id = cp.id
              ORDER BY ch2.date DESC
              LIMIT 1
            )::float8 AS latest_charger_power_kw
          FROM charges ch
          WHERE ch.charging_process_id = cp.id
        ) cp_agg ON TRUE
        WHERE c.vin = $1 AND cp.id = $2::int
        LIMIT 1
      `,
      [vin, id],
    )

      const row = rows[0]
      return row ? this.normalizeCharge(row) : null
    } catch {
      return null
    }
  }

  async getMonthlyChargeSummary(vin: string, year: number, month: number) {
    const from = new Date(year, month - 1, 1)
    const to = new Date(year, month, 1)
    const rows = await this.queryOrThrow<{
      energy_added_kwh: number | string | null
      estimated_cost: number | string | null
      duration_min: number | string | null
      total: number | string
    }>(
      `
        SELECT
          COALESCE(SUM(COALESCE(cp.charge_energy_added, lc.charge_energy_added)), 0) AS energy_added_kwh,
          COALESCE(SUM(cp.cost), 0) AS estimated_cost,
          COALESCE(SUM(cp.duration_min), 0) AS duration_min,
          COUNT(*)::int AS total
        FROM charging_processes cp
        INNER JOIN cars c ON c.id = cp.car_id
        LEFT JOIN LATERAL (
          SELECT ch.charge_energy_added
          FROM charges ch
          WHERE ch.charging_process_id = cp.id
          ORDER BY ch.date DESC
          LIMIT 1
        ) lc ON TRUE
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
    const distanceMultiplier = await this.inferOdometerMultiplier(vin)
    const rows = await this.queryOrThrow<{
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
            COALESCE(SUM(
              CASE
                WHEN d.start_ideal_range_km IS NOT NULL AND d.end_ideal_range_km IS NOT NULL AND c.efficiency IS NOT NULL
                  THEN (d.start_ideal_range_km - d.end_ideal_range_km) * c.efficiency
                ELSE d.distance * COALESCE(c.efficiency, 0)
              END
            ), 0) AS energy_used_kwh,
            COUNT(*)::int AS trips_count
          FROM drives d
          INNER JOIN cars c ON c.id = d.car_id
          WHERE c.vin = $1
            AND d.start_date >= $2
        ),
        charge_stats AS (
          SELECT
            COALESCE(SUM(COALESCE(cp.charge_energy_added, lc.charge_energy_added)), 0) AS energy_added_kwh,
            0::numeric AS estimated_cost_eur,
            COUNT(*)::int AS charge_sessions_count
          FROM charging_processes cp
          INNER JOIN cars c ON c.id = cp.car_id
          LEFT JOIN LATERAL (
            SELECT ch.charge_energy_added
            FROM charges ch
            WHERE ch.charging_process_id = cp.id
            ORDER BY ch.date DESC
            LIMIT 1
          ) lc ON TRUE
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
    const distanceKm = (toNumber(row?.distance_km) ?? 0) * distanceMultiplier
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

  async getDailyEfficiency(vin: string, since: Date) {
    const distanceMultiplier = await this.inferOdometerMultiplier(vin)

    const rows = await this.query<{
      day: Date | string
      distance_km: number | string | null
      charged_kwh: number | string | null
    }>(
      `
        WITH trip_daily AS (
          SELECT
            DATE_TRUNC('day', d.start_date) AS day,
            COALESCE(SUM(d.distance), 0) AS distance_km
          FROM drives d
          INNER JOIN cars c ON c.id = d.car_id
          WHERE c.vin = $1
            AND d.start_date >= $2
          GROUP BY 1
        ),
        charge_daily AS (
          SELECT
            DATE_TRUNC('day', cp.start_date) AS day,
            COALESCE(SUM(COALESCE(cp.charge_energy_added, lc.charge_energy_added)), 0) AS charged_kwh
          FROM charging_processes cp
          INNER JOIN cars c ON c.id = cp.car_id
          LEFT JOIN LATERAL (
            SELECT ch.charge_energy_added
            FROM charges ch
            WHERE ch.charging_process_id = cp.id
            ORDER BY ch.date DESC
            LIMIT 1
          ) lc ON TRUE
          WHERE c.vin = $1
            AND cp.start_date >= $2
          GROUP BY 1
        )
        SELECT
          COALESCE(td.day, cd.day) AS day,
          COALESCE(td.distance_km, 0) AS distance_km,
          COALESCE(cd.charged_kwh, 0) AS charged_kwh
        FROM trip_daily td
        FULL OUTER JOIN charge_daily cd ON cd.day = td.day
        ORDER BY 1 ASC
      `,
      [vin, since],
    )

    return rows.map((row) => ({
      day: toDate(row.day) ?? new Date(),
      distance_km: (toNumber(row.distance_km) ?? 0) * distanceMultiplier,
      charged_kwh: toNumber(row.charged_kwh) ?? 0,
    }))
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
          COALESCE(p.odometer, po.odometer) AS odometer,
          p.battery_level,
          p.usable_battery_level,
          COALESCE(p.rated_battery_range_km, p.est_battery_range_km, p.ideal_battery_range_km) AS battery_range_km,
          p.inside_temp,
          p.outside_temp,
          p.is_climate_on,
          st.state AS open_state,
          cp.id AS open_charge_id,
          d.id AS open_drive_id,
          ch.date AS charge_captured_at,
          ch.charge_energy_added,
          ch.charger_power,
          ch.charger_phases,
          ch.charger_actual_current,
          ch.charger_voltage,
          ch.conn_charge_cable
        FROM cars c
        LEFT JOIN LATERAL (
          SELECT *
          FROM positions p
          WHERE p.car_id = c.id
          ORDER BY p.date DESC
          LIMIT 1
        ) p ON TRUE
        LEFT JOIN LATERAL (
          SELECT p2.odometer
          FROM positions p2
          WHERE p2.car_id = c.id
            AND p2.odometer IS NOT NULL
          ORDER BY p2.date DESC
          LIMIT 1
        ) po ON TRUE
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

  private normalizeTrip(row: Record<string, unknown>, distanceMultiplier = 1) {
    const startAddress = row.startAddress ? String(row.startAddress) : coordLabel(row.startLatitude, row.startLongitude)
    const endAddress = row.endAddress ? String(row.endAddress) : coordLabel(row.endLatitude, row.endLongitude)
    const distanceKm = toNumber(row.distanceKm)
    const avgConsumptionKwh100 = toNumber(row.avgConsumptionKwh100)

    return {
      id: String(row.id),
      startedAt: toDate(row.startedAt),
      endedAt: toDate(row.endedAt),
      durationMin: toNumber(row.durationMin),
      distanceKm: distanceKm != null ? distanceKm * distanceMultiplier : null,
      energyUsedKwh: toNumber(row.energyUsedKwh),
      avgConsumptionKwh100: avgConsumptionKwh100 != null ? avgConsumptionKwh100 / distanceMultiplier : null,
      startAddress,
      endAddress,
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
    const durationMin = toNumber(row.durationMin)
    const energyAddedKwh = toNumber(row.energyAddedKwh)
    const estimatedCost = toNumber(row.estimatedCost)
    const startSoc = toNumber(row.startBatteryLevel)
    const endSoc = toNumber(row.endBatteryLevel)

    const derivedEnergyFromSoc =
      startSoc != null && endSoc != null && endSoc > startSoc
        ? ((endSoc - startSoc) / 100) * 75
        : null

    const derivedAvgChargeKwFromEnergy =
      energyAddedKwh != null && durationMin != null && durationMin > 0
        ? energyAddedKwh / (durationMin / 60)
        : null

    const derivedAvgChargeKwFromSoc =
      derivedEnergyFromSoc != null && durationMin != null && durationMin > 0
        ? derivedEnergyFromSoc / (durationMin / 60)
        : null

    const derivedAvgChargeKw = derivedAvgChargeKwFromEnergy ?? derivedAvgChargeKwFromSoc

    const avgChargeKw = toNumber(row.avgChargeKw) ?? derivedAvgChargeKw
    const chargerPower = toNumber(row.chargerPower) ?? avgChargeKw
    const maxChargeKw = toNumber(row.maxChargeKw) ?? chargerPower

    let chargeType: 'AC_LEVEL_1' | 'AC_LEVEL_2' | 'DC_FAST' | 'SUPERCHARGER' | 'UNKNOWN' = 'UNKNOWN'
    const peakKw = maxChargeKw ?? chargerPower ?? avgChargeKw ?? 0
    if (peakKw >= 120) chargeType = 'SUPERCHARGER'
    else if (peakKw >= 40) chargeType = 'DC_FAST'
    else if (peakKw >= 7) chargeType = 'AC_LEVEL_2'
    else if (peakKw > 0) chargeType = 'AC_LEVEL_1'

    return {
      id: String(row.id),
      startedAt: toDate(row.startedAt),
      endedAt: toDate(row.endedAt),
      energyAddedKwh: energyAddedKwh ?? derivedEnergyFromSoc,
      startBatteryLevel: toNumber(row.startBatteryLevel),
      endBatteryLevel: toNumber(row.endBatteryLevel),
      chargeLimitSoc: null,
      chargeType,
      maxChargeKw,
      avgChargeKw,
      chargerPower,
      durationMin,
      latitude: toNumber(row.latitude),
      longitude: toNumber(row.longitude),
      address: row.address ? String(row.address) : coordLabel(row.latitude, row.longitude),
      pricePerKwh: estimatedCost != null && energyAddedKwh != null && energyAddedKwh > 0 ? estimatedCost / energyAddedKwh : null,
      estimatedCost,
      currency: 'EUR',
      notes: null,
    }
  }
}