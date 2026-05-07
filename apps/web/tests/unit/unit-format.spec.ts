import { describe, it, expect } from 'vitest'
import { formatKm, formatDuration } from '../../src/lib/utils'

describe('Frontend utils', () => {
  describe('formatKm', () => {
    it('formats km with French locale', () => {
      expect(formatKm(350)).toContain('350')
    })
    it('rounds correctly', () => {
      expect(formatKm(350.6)).toContain('351')
    })
  })

  describe('formatDuration', () => {
    it('shows minutes only for <1h', () => {
      expect(formatDuration(45)).toBe('45min')
    })
    it('shows hours and minutes', () => {
      expect(formatDuration(90)).toBe('1h30')
    })
    it('pads minutes', () => {
      expect(formatDuration(65)).toBe('1h05')
    })
  })
})
