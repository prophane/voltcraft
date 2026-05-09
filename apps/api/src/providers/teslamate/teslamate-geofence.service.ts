import { Pool } from 'pg'
import { env } from '../../config/env.js'

export interface Geofence {
  id: number
  name: string
  latitude: number
  longitude: number
  radius: number
  costPerUnit?: number
  sessionFee?: number
  billingType?: string
}

export interface CreateGeofenceInput {
  name: string
  latitude: number
  longitude: number
  radius: number
  costPerUnit?: number
  sessionFee?: number
  billingType?: 'per_kwh' | 'per_minute'
}

export class TeslaMateGeofenceService {
  private pool: Pool | null = null
  private poolConfigKey: string | null = null

  private getPool() {
    const nextKey = `${env.TESLAMATE_DB_HOST}:${env.TESLAMATE_DB_PORT}:${env.TESLAMATE_DB_NAME}:${env.TESLAMATE_DB_USER}`
    if (this.pool && this.poolConfigKey === nextKey) {
      return this.pool
    }

    this.pool = new Pool({
      host: env.TESLAMATE_DB_HOST,
      port: env.TESLAMATE_DB_PORT,
      database: env.TESLAMATE_DB_NAME,
      user: env.TESLAMATE_DB_USER,
      password: env.TESLAMATE_DB_PASSWORD,
    })
    this.poolConfigKey = nextKey
    return this.pool
  }

  private async query<T = unknown>(sql: string, params: unknown[] = []) {
    const pool = this.getPool()
    try {
      const result = await pool.query<T>(sql, params)
      return result.rows
    } catch (error) {
      console.error('TeslaMate geofence query error:', error, sql, params)
      throw error
    }
  }

  async listGeofences(): Promise<Geofence[]> {
    const rows = await this.query<Geofence>(
      'SELECT id, name, latitude, longitude, radius, cost_per_unit AS "costPerUnit", session_fee AS "sessionFee", billing_type AS "billingType" FROM geofences ORDER BY name',
    )
    return rows
  }

  async createGeofence(input: CreateGeofenceInput): Promise<Geofence> {
    const result = await this.query<Geofence>(
      `INSERT INTO geofences (name, latitude, longitude, radius, cost_per_unit, session_fee, billing_type, inserted_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
       RETURNING id, name, latitude, longitude, radius, cost_per_unit AS "costPerUnit", session_fee AS "sessionFee", billing_type AS "billingType"`,
      [input.name, input.latitude, input.longitude, input.radius, input.costPerUnit ?? 0, input.sessionFee ?? null, input.billingType ?? 'per_kwh'],
    )
    return result[0] as Geofence
  }

  async updateGeofence(id: number, input: Partial<CreateGeofenceInput>): Promise<Geofence> {
    const setClauses: string[] = []
    const params: unknown[] = []
    let paramIndex = 1

    if (input.name !== undefined) {
      setClauses.push(`name = $${paramIndex++}`)
      params.push(input.name)
    }
    if (input.latitude !== undefined) {
      setClauses.push(`latitude = $${paramIndex++}`)
      params.push(input.latitude)
    }
    if (input.longitude !== undefined) {
      setClauses.push(`longitude = $${paramIndex++}`)
      params.push(input.longitude)
    }
    if (input.radius !== undefined) {
      setClauses.push(`radius = $${paramIndex++}`)
      params.push(input.radius)
    }
    if (input.costPerUnit !== undefined) {
      setClauses.push(`cost_per_unit = $${paramIndex++}`)
      params.push(input.costPerUnit)
    }
    if (input.sessionFee !== undefined) {
      setClauses.push(`session_fee = $${paramIndex++}`)
      params.push(input.sessionFee)
    }
    if (input.billingType !== undefined) {
      setClauses.push(`billing_type = $${paramIndex++}`)
      params.push(input.billingType)
    }

    setClauses.push(`updated_at = NOW()`)
    params.push(id)

    const result = await this.query<Geofence>(
      `UPDATE geofences SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING id, name, latitude, longitude, radius, cost_per_unit AS "costPerUnit", session_fee AS "sessionFee", billing_type AS "billingType"`,
      params,
    )
    return result[0] as Geofence
  }

  async deleteGeofence(id: number): Promise<boolean> {
    const result = await this.query('DELETE FROM geofences WHERE id = $1', [id])
    return true
  }
}
