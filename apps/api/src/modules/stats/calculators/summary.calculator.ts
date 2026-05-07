/** Calculate average consumption kWh/100km. Returns null if insufficient data. */
export function calcAvgConsumption(energyKwh: number, distanceKm: number): number | null {
  if (distanceKm < 1) return null
  return Math.round((energyKwh / distanceKm) * 100 * 10) / 10
}

/** Estimate phantom drain: difference between energy added and energy used for driving */
export function calcPhantomDrain(energyAddedKwh: number, energyUsedKwh: number): number {
  const phantom = energyAddedKwh - energyUsedKwh
  return Math.max(0, Math.round(phantom * 10) / 10)
}

/** Calculate estimated cost */
export function calcEstimatedCost(energyKwh: number, pricePerKwh: number): number {
  return Math.round(energyKwh * pricePerKwh * 100) / 100
}
