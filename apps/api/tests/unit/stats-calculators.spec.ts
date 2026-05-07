import { describe, it, expect } from 'vitest'
import {
  calcAvgConsumption,
  calcPhantomDrain,
  calcEstimatedCost,
} from '../../src/modules/stats/calculators/summary.calculator.js'

describe('Stats calculators', () => {
  describe('calcAvgConsumption', () => {
    it('calculates kWh/100km correctly', () => {
      expect(calcAvgConsumption(15, 100)).toBe(15)
      expect(calcAvgConsumption(20, 200)).toBe(10)
    })
    it('returns null for 0km', () => {
      expect(calcAvgConsumption(10, 0)).toBeNull()
    })
    it('rounds to 1 decimal', () => {
      expect(calcAvgConsumption(13.7, 100)).toBe(13.7)
    })
  })

  describe('calcPhantomDrain', () => {
    it('returns difference between added and used', () => {
      expect(calcPhantomDrain(50, 40)).toBe(10)
    })
    it('never returns negative', () => {
      expect(calcPhantomDrain(30, 50)).toBe(0)
    })
  })

  describe('calcEstimatedCost', () => {
    it('calculates cost correctly', () => {
      expect(calcEstimatedCost(100, 0.15)).toBe(15)
      expect(calcEstimatedCost(50, 0.22)).toBe(11)
    })
    it('rounds to 2 decimals', () => {
      expect(calcEstimatedCost(33.33, 0.15)).toBe(5)
    })
  })
})
