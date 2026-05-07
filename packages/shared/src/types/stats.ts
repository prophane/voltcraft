export interface StatsSummary {
  periodDays: number
  distanceKm: number
  energyAddedKwh: number
  estimatedCostEur: number
  avgConsumptionKwhPer100km: number
  phantomDrainKwh: number
  tripsCount: number
  chargeSessionsCount: number
}

export interface BatteryTrendPoint {
  date: string   // ISO date (day)
  minLevel: number
  maxLevel: number
  avgLevel: number
}

export interface DailyTripPoint {
  date: string
  distanceKm: number
  chargedKwh: number
}
