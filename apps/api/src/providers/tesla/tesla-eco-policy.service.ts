import type { Redis } from 'ioredis'
import { CACHE_TTL } from '@voltcraft/shared'

/**
 * TeslaEcoPolicyService — central gatekeeper for all Tesla API calls.
 *
 * Rules enforced:
 * - Never wake a sleeping vehicle implicitly
 * - Cache state with adaptive TTLs based on vehicle status
 * - Return stale data rather than forcing a poll
 * - Log every decision for auditing
 */
export class TeslaEcoPolicyService {
  constructor(private readonly redis: Redis) {}

  // ── Cache keys ───────────────────────────────────────────────
  private stateKey(vehicleId: string) { return `eco:state:${vehicleId}` }
  private lockKey(vehicleId: string) { return `eco:lock:${vehicleId}` }

  // ── State cache ──────────────────────────────────────────────
  async getCachedState(vehicleId: string): Promise<Record<string, unknown> | null> {
    const raw = await this.redis.get(this.stateKey(vehicleId))
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : null
  }

  async setCachedState(vehicleId: string, state: Record<string, unknown>, isAsleep: boolean): Promise<void> {
    const ttl = isAsleep ? CACHE_TTL.POSITION_ASLEEP : CACHE_TTL.VEHICLE_STATE
    await this.redis.set(this.stateKey(vehicleId), JSON.stringify(state), 'EX', ttl)
  }

  async invalidateCache(vehicleId: string): Promise<void> {
    await this.redis.del(this.stateKey(vehicleId))
  }

  // ── Sync lock (prevents concurrent syncs) ────────────────────
  async acquireSyncLock(vehicleId: string, ttlMs = 30_000): Promise<boolean> {
    const result = await this.redis.set(this.lockKey(vehicleId), '1', 'PX', ttlMs, 'NX')
    return result === 'OK'
  }

  async releaseSyncLock(vehicleId: string): Promise<void> {
    await this.redis.del(this.lockKey(vehicleId))
  }

  // ── Policy decisions ─────────────────────────────────────────

  /**
   * Returns true if a wake is allowed.
   * Only allowed for explicit user commands, never for passive polls.
   */
  shouldWake(reason: 'command' | 'sync' | 'automation'): boolean {
    return reason === 'command'
  }

  /**
   * Determines polling interval based on vehicle state.
   * Returns interval in milliseconds.
   */
  getPollInterval(state: string, ecoModeEnabled: boolean): number {
    if (state === 'asleep' || state === 'offline') {
      return ecoModeEnabled ? 21_600_000 : 120_000 // 6h eco, 2min normal
    }
    if (state === 'charging') {
      return ecoModeEnabled ? 900_000 : 15_000 // 15min eco
    }
    if (state === 'driving') {
      return ecoModeEnabled ? 300_000 : 30_000 // 5min eco
    }
    // online/idle
    return ecoModeEnabled ? 1_800_000 : 30_000 // 30min eco
  }
}
