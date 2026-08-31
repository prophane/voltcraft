export type DegradationPoint = {
  day: Date
  fullRangeKm: number | null
  odometerKm: number | null
  efficiencyKwhPerKm: number | null
  samples: number
}

export type VampireGap = {
  parkedFrom: Date
  parkedTo: Date
  hours: number
  socFrom: number | null
  socTo: number | null
  rangeFromKm: number | null
  rangeToKm: number | null
  efficiencyKwhPerKm: number | null
}

export type ChargeSessionRow = {
  id: string
  startedAt: Date
  endedAt: Date | null
  energyAddedKwh: number | null
  energyUsedKwh: number | null
  startBatteryLevel: number | null
  endBatteryLevel: number | null
  durationMin: number | null
  costEur: number | null
  isFastCharge: boolean
  maxPowerKw: number | null
  fastChargerBrand: string | null
}

export type TirePressureDay = {
  day: Date
  fl: number | null
  fr: number | null
  rl: number | null
  rr: number | null
  outsideTempC: number | null
  samples: number
}

const WARRANTY_RETENTION_PCT = 70
const ATMOSPHERIC_PRESSURE_BAR = 1.013
const REFERENCE_TEMP_C = 20

function round(value: number, digits = 1): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!
}

/** Ordinary least squares; returns null when the x range is too narrow to be meaningful. */
function linearRegression(points: Array<{ x: number; y: number }>) {
  if (points.length < 4) return null
  const n = points.length
  const sumX = points.reduce((acc, p) => acc + p.x, 0)
  const sumY = points.reduce((acc, p) => acc + p.y, 0)
  const meanX = sumX / n
  const meanY = sumY / n
  let num = 0
  let den = 0
  for (const p of points) {
    num += (p.x - meanX) * (p.y - meanY)
    den += (p.x - meanX) ** 2
  }
  if (den === 0) return null
  const slope = num / den
  const intercept = meanY - slope * meanX
  return { slope, intercept }
}

export function buildBatteryDegradation(
  points: DegradationPoint[],
  options: { nominalCapacityKwh?: number | null } = {},
) {
  const valid = points.filter(
    (p): p is DegradationPoint & { fullRangeKm: number } =>
      p.fullRangeKm != null && Number.isFinite(p.fullRangeKm) && p.fullRangeKm > 50 && p.fullRangeKm < 1200,
  )

  const efficiency = valid.map((p) => p.efficiencyKwhPerKm).find((v): v is number => v != null && v > 0) ?? null

  const series = valid.map((p) => ({
    day: p.day.toISOString().slice(0, 10),
    fullRangeKm: round(p.fullRangeKm, 1),
    odometerKm: p.odometerKm != null ? Math.round(p.odometerKm) : null,
    capacityKwh: efficiency != null ? round(p.fullRangeKm * efficiency, 2) : null,
  }))

  if (valid.length < 3) {
    return {
      ready: false,
      samplesCount: valid.length,
      series,
      efficiencyKwhPerKm: efficiency,
      bestFullRangeKm: null,
      currentFullRangeKm: null,
      healthPct: null,
      degradationPct: null,
      originalCapacityKwh: options.nominalCapacityKwh ?? null,
      currentCapacityKwh: null,
      lossPer10000Km: null,
      odometerKm: null,
      projectedKmToWarrantyFloor: null,
    }
  }

  const bestFullRangeKm = Math.max(...valid.map((p) => p.fullRangeKm))
  const recent = valid.slice(-7).map((p) => p.fullRangeKm)
  const currentFullRangeKm = median(recent) ?? recent[recent.length - 1]!

  const originalCapacityKwh =
    options.nominalCapacityKwh ?? (efficiency != null ? round(bestFullRangeKm * efficiency, 2) : null)
  const currentCapacityKwh = efficiency != null ? round(currentFullRangeKm * efficiency, 2) : null

  const healthPct =
    originalCapacityKwh != null && currentCapacityKwh != null
      ? round((currentCapacityKwh / originalCapacityKwh) * 100, 1)
      : round((currentFullRangeKm / bestFullRangeKm) * 100, 1)

  const regressionPoints = valid
    .filter((p) => p.odometerKm != null)
    .map((p) => ({ x: p.odometerKm as number, y: p.fullRangeKm }))
  const odometerSpread =
    regressionPoints.length >= 4
      ? Math.max(...regressionPoints.map((p) => p.x)) - Math.min(...regressionPoints.map((p) => p.x))
      : 0
  const regression = odometerSpread >= 1000 ? linearRegression(regressionPoints) : null

  // Perte d'autonomie exprimee en points de sante pour 10 000 km.
  const lossPer10000Km =
    regression != null && bestFullRangeKm > 0
      ? round((-regression.slope * 10_000 * 100) / bestFullRangeKm, 2)
      : null

  const odometerKm = regressionPoints.length > 0 ? Math.max(...regressionPoints.map((p) => p.x)) : null
  const projectedKmToWarrantyFloor =
    lossPer10000Km != null && lossPer10000Km > 0 && healthPct != null && healthPct > WARRANTY_RETENTION_PCT
      ? Math.round(((healthPct - WARRANTY_RETENTION_PCT) / lossPer10000Km) * 10_000)
      : null

  return {
    ready: true,
    samplesCount: valid.length,
    series,
    efficiencyKwhPerKm: efficiency,
    bestFullRangeKm: round(bestFullRangeKm, 1),
    currentFullRangeKm: round(currentFullRangeKm, 1),
    healthPct,
    degradationPct: healthPct != null ? round(100 - healthPct, 1) : null,
    originalCapacityKwh,
    currentCapacityKwh,
    lossPer10000Km,
    odometerKm,
    projectedKmToWarrantyFloor,
  }
}

export function buildVampireDrain(
  gaps: VampireGap[],
  options: { capacityKwh?: number | null; maxDailyDrainPct?: number } = {},
) {
  const sessions = gaps
    .map((gap) => {
      if (gap.socFrom == null || gap.socTo == null || gap.hours <= 0) return null
      const socLost = gap.socFrom - gap.socTo
      // Une reprise de SoC signale une charge non tracee: on ecarte l'intervalle.
      if (socLost < 0 || socLost > 50) return null
      const days = gap.hours / 24
      if (days < 0.2) return null
      return {
        parkedFrom: gap.parkedFrom.toISOString(),
        parkedTo: gap.parkedTo.toISOString(),
        hours: round(gap.hours, 1),
        socFrom: gap.socFrom,
        socTo: gap.socTo,
        socLost: round(socLost, 1),
        pctPerDay: round(socLost / days, 2),
        rangeLostKm:
          gap.rangeFromKm != null && gap.rangeToKm != null ? round(gap.rangeFromKm - gap.rangeToKm, 1) : null,
      }
    })
    .filter((row): row is NonNullable<typeof row> => row != null)

  const perDay = sessions.map((s) => s.pctPerDay)
  const medianPctPerDay = median(perDay)
  const worst = sessions.reduce<(typeof sessions)[number] | null>(
    (acc, row) => (acc == null || row.pctPerDay > acc.pctPerDay ? row : acc),
    null,
  )

  const capacityKwh = options.capacityKwh ?? null
  const threshold = options.maxDailyDrainPct ?? 1.5

  return {
    ready: sessions.length >= 3,
    sessionsCount: sessions.length,
    medianPctPerDay,
    avgPctPerDay: perDay.length > 0 ? round(perDay.reduce((a, b) => a + b, 0) / perDay.length, 2) : null,
    worstPctPerDay: worst?.pctPerDay ?? null,
    worstSession: worst,
    kwhPerDay:
      medianPctPerDay != null && capacityKwh != null ? round((medianPctPerDay / 100) * capacityKwh, 2) : null,
    thresholdPctPerDay: threshold,
    status:
      medianPctPerDay == null ? 'unknown' : medianPctPerDay > threshold * 2 ? 'critical' : medianPctPerDay > threshold ? 'warning' : 'ok',
    sessions: sessions.slice(-30).reverse(),
  }
}

export function buildChargingProfile(
  rows: ChargeSessionRow[],
  options: { capacityKwh?: number | null; maxRecommendedSocPct?: number } = {},
) {
  const capacityKwh = options.capacityKwh ?? null
  const maxRecommendedSocPct = options.maxRecommendedSocPct ?? 90

  const dc = rows.filter((r) => r.isFastCharge)
  const ac = rows.filter((r) => !r.isFastCharge)
  const energy = (list: ChargeSessionRow[]) =>
    round(list.reduce((acc, r) => acc + (r.energyAddedKwh ?? 0), 0), 1)

  const dcEnergyKwh = energy(dc)
  const acEnergyKwh = energy(ac)
  const totalEnergyKwh = round(dcEnergyKwh + acEnergyKwh, 1)

  const endLevels = rows.map((r) => r.endBatteryLevel).filter((v): v is number => v != null)
  const startLevels = rows.map((r) => r.startBatteryLevel).filter((v): v is number => v != null)
  const maxPower = rows.map((r) => r.maxPowerKw).filter((v): v is number => v != null && v > 0)

  const highSocSessions = endLevels.filter((v) => v > maxRecommendedSocPct).length
  const deepDischargeSessions = startLevels.filter((v) => v < 10).length

  const byMonth = new Map<string, { dc: number; ac: number }>()
  for (const row of rows) {
    const key = row.startedAt.toISOString().slice(0, 7)
    const bucket = byMonth.get(key) ?? { dc: 0, ac: 0 }
    if (row.isFastCharge) bucket.dc += row.energyAddedKwh ?? 0
    else bucket.ac += row.energyAddedKwh ?? 0
    byMonth.set(key, bucket)
  }

  return {
    sessionsCount: rows.length,
    dcCount: dc.length,
    acCount: ac.length,
    dcEnergyKwh,
    acEnergyKwh,
    totalEnergyKwh,
    dcSharePct: totalEnergyKwh > 0 ? round((dcEnergyKwh / totalEnergyKwh) * 100, 1) : null,
    equivalentCycles: capacityKwh != null && capacityKwh > 0 ? round(totalEnergyKwh / capacityKwh, 1) : null,
    avgEndSocPct: endLevels.length > 0 ? round(endLevels.reduce((a, b) => a + b, 0) / endLevels.length, 1) : null,
    avgStartSocPct:
      startLevels.length > 0 ? round(startLevels.reduce((a, b) => a + b, 0) / startLevels.length, 1) : null,
    maxPowerKw: maxPower.length > 0 ? Math.max(...maxPower) : null,
    maxRecommendedSocPct,
    highSocSessions,
    deepDischargeSessions,
    monthly: [...byMonth.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, value]) => ({ month, dcKwh: round(value.dc, 1), acKwh: round(value.ac, 1) })),
  }
}

/** Ramene une pression relevee a sa valeur equivalente a 20 degres (loi des gaz parfaits, volume constant). */
export function compensatePressureBar(pressureBar: number, temperatureC: number | null): number {
  if (temperatureC == null || !Number.isFinite(temperatureC)) return pressureBar
  const absolute = pressureBar + ATMOSPHERIC_PRESSURE_BAR
  const corrected = (absolute * (REFERENCE_TEMP_C + 273.15)) / (temperatureC + 273.15)
  return round(corrected - ATMOSPHERIC_PRESSURE_BAR, 3)
}

export function buildTirePressureAnalysis(
  days: TirePressureDay[],
  options: { targetBar?: number; toleranceBar?: number } = {},
) {
  const targetBar = options.targetBar ?? 2.9
  const toleranceBar = options.toleranceBar ?? 0.2

  const series = days.map((row) => ({
    day: row.day.toISOString().slice(0, 10),
    outsideTempC: row.outsideTempC != null ? round(row.outsideTempC, 1) : null,
    raw: { fl: row.fl, fr: row.fr, rl: row.rl, rr: row.rr },
    corrected: {
      fl: row.fl != null ? compensatePressureBar(row.fl, row.outsideTempC) : null,
      fr: row.fr != null ? compensatePressureBar(row.fr, row.outsideTempC) : null,
      rl: row.rl != null ? compensatePressureBar(row.rl, row.outsideTempC) : null,
      rr: row.rr != null ? compensatePressureBar(row.rr, row.outsideTempC) : null,
    },
  }))

  const latest = series[series.length - 1] ?? null
  const corners = ['fl', 'fr', 'rl', 'rr'] as const

  const latestCorrected = latest
    ? corners.map((corner) => latest.corrected[corner]).filter((v): v is number => v != null)
    : []
  const spreadBar =
    latestCorrected.length >= 2 ? round(Math.max(...latestCorrected) - Math.min(...latestCorrected), 3) : null

  // Une derive negative sur la valeur compensee (et non brute) traduit une vraie fuite.
  const trendWindow = series.slice(-30)
  const leakSuspects = corners
    .map((corner) => {
      const points = trendWindow
        .map((row, index) => ({ x: index, y: row.corrected[corner] }))
        .filter((p): p is { x: number; y: number } => p.y != null)
      const regression = linearRegression(points)
      if (!regression) return null
      const barPer30Days = round(regression.slope * 30, 3)
      return barPer30Days <= -0.1 ? { corner, barPer30Days } : null
    })
    .filter((row): row is { corner: (typeof corners)[number]; barPer30Days: number } => row != null)

  const alerts = latest
    ? corners
        .map((corner) => {
          const value = latest.corrected[corner]
          if (value == null) return null
          const delta = round(value - targetBar, 3)
          if (Math.abs(delta) <= toleranceBar) return null
          return { corner, correctedBar: value, deltaBar: delta, severity: Math.abs(delta) > toleranceBar * 2 ? 'critical' : 'warning' }
        })
        .filter((row): row is NonNullable<typeof row> => row != null)
    : []

  return {
    ready: series.length > 0,
    targetBar,
    toleranceBar,
    latest,
    spreadBar,
    spreadWarning: spreadBar != null && spreadBar > toleranceBar,
    alerts,
    leakSuspects,
    series,
  }
}
