/** Represent an anomaly in consumption data */
export interface ConsumptionAnomaly {
  tripId: string
  startedAt: string
  distance: number
  consumption: number
  severity: 'high' | 'moderate' | 'low'
  deviation: number // How many standard deviations away from mean
  type: 'inefficient' | 'efficient'
}

/** Detect consumption anomalies based on historical data */
export function detectConsumptionAnomalies(
  trips: Array<{ id: string; startedAt: Date; distance: number; consumption: number }>,
  periodDays: number = 30
): {
  anomalies: ConsumptionAnomaly[]
  baseline: { mean: number; stdDev: number; tripCount: number }
} {
  if (trips.length < 5) {
    return { anomalies: [], baseline: { mean: 0, stdDev: 0, tripCount: 0 } }
  }

  // Filter trips with valid consumption data
  const validTrips = trips.filter((t) => t.distance > 1 && Number.isFinite(t.consumption) && t.consumption > 0)

  if (validTrips.length < 5) {
    return { anomalies: [], baseline: { mean: 0, stdDev: 0, tripCount: validTrips.length } }
  }

  // Calculate statistics (mean and standard deviation)
  const mean = validTrips.reduce((sum, t) => sum + t.consumption, 0) / validTrips.length
  const variance =
    validTrips.reduce((sum, t) => sum + (t.consumption - mean) ** 2, 0) / validTrips.length
  const stdDev = Math.sqrt(variance)

  // Detect anomalies
  const anomalies: ConsumptionAnomaly[] = validTrips
    .map((trip) => {
      const deviation = (trip.consumption - mean) / (stdDev || 1) // z-score
      let type: 'inefficient' | 'efficient' = 'efficient'
      let severity: 'high' | 'moderate' | 'low' = 'low'

      if (deviation > 1.5) {
        // High consumption (inefficient)
        type = 'inefficient'
        if (deviation > 2.5) severity = 'high'
        else if (deviation > 1.8) severity = 'moderate'
        else severity = 'low'
      } else if (deviation < -1.0) {
        // Low consumption (efficient)
        type = 'efficient'
        if (deviation < -2.0) severity = 'high'
        else if (deviation < -1.5) severity = 'moderate'
        else severity = 'low'
      } else {
        return null // Normal consumption
      }

      return {
        tripId: trip.id,
        startedAt: trip.startedAt.toISOString(),
        distance: Math.round(trip.distance * 10) / 10,
        consumption: Math.round(trip.consumption * 10) / 10,
        severity,
        deviation: Math.round(deviation * 100) / 100,
        type,
      }
    })
    .filter((a): a is ConsumptionAnomaly => a !== null)
    .sort((a, b) => Math.abs(b.deviation) - Math.abs(a.deviation))
    .slice(0, 10) // Top 10 anomalies

  return {
    anomalies,
    baseline: {
      mean: Math.round(mean * 10) / 10,
      stdDev: Math.round(stdDev * 10) / 10,
      tripCount: validTrips.length,
    },
  }
}
