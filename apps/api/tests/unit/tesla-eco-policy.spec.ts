import { describe, it, expect } from 'vitest'
import { TeslaEcoPolicyService } from '../../src/providers/tesla/tesla-eco-policy.service.js'

// Mock Redis
const mockRedis = {
  get: async () => null,
  set: async () => 'OK',
  del: async () => 1,
} as unknown as import('ioredis').default

describe('TeslaEcoPolicyService', () => {
  const policy = new TeslaEcoPolicyService(mockRedis)

  describe('shouldWake', () => {
    it('allows wake for explicit commands', () => {
      expect(policy.shouldWake('command')).toBe(true)
    })
    it('blocks wake for sync', () => {
      expect(policy.shouldWake('sync')).toBe(false)
    })
    it('blocks wake for automation', () => {
      expect(policy.shouldWake('automation')).toBe(false)
    })
  })

  describe('getPollInterval', () => {
    it('returns 10min for sleeping vehicle in eco mode', () => {
      expect(policy.getPollInterval('asleep', true)).toBe(600_000)
    })
    it('returns 2min for sleeping vehicle without eco mode', () => {
      expect(policy.getPollInterval('asleep', false)).toBe(120_000)
    })
    it('returns 30s for charging in eco mode', () => {
      expect(policy.getPollInterval('charging', true)).toBe(30_000)
    })
    it('returns 60s for online in eco mode', () => {
      expect(policy.getPollInterval('online', true)).toBe(60_000)
    })
  })

  describe('acquireSyncLock', () => {
    it('acquires lock when redis returns OK', async () => {
      const redis = { set: async () => 'OK' } as unknown as import('ioredis').default
      const p = new TeslaEcoPolicyService(redis)
      expect(await p.acquireSyncLock('vehicle-1')).toBe(true)
    })
    it('fails to acquire when lock is taken', async () => {
      const redis = { set: async () => null } as unknown as import('ioredis').default
      const p = new TeslaEcoPolicyService(redis)
      expect(await p.acquireSyncLock('vehicle-1')).toBe(false)
    })
  })
})
