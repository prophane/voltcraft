import { useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Activity,
  AlertTriangle,
  BarChart3,
  BatteryCharging,
  BellRing,
  CarFront,
  Clock3,
  Compass,
  Cpu,
  Gauge,
  Lock,
  MapPin,
  Shield,
  Thermometer,
  Unlock,
  Zap,
} from 'lucide-react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { diagnosticsApi, settingsApi, statsApi, vehicleApi, type VehicleHistorySnapshot } from '@/features/vehicle/api'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { cn, formatDate, formatKm, formatPercent } from '@/lib/utils'

type TelemetrySource = 'TeslaMate' | 'Voltcraft' | 'Cache' | 'Unknown'
type DiagnosticsViewMode = 'essential' | 'expert'
type AlertSeverity = 'Critique' | 'A surveiller' | 'Info'

function ageMinutes(iso?: string | null) {
  if (!iso) return null
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000))
}

function formatAge(iso?: string | null) {
  const minutes = ageMinutes(iso)
  if (minutes == null) return 'non disponible'
  if (minutes < 1) return 'moins d 1 min'
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return mins > 0 ? `${hours} h ${mins} min` : `${hours} h`
}

function sourceLabel(source: TelemetrySource, cached: boolean) {
  if (source === 'TeslaMate') return cached ? 'TeslaMate (cache)' : 'TeslaMate (direct)'
  if (source === 'Voltcraft') return cached ? 'Voltcraft (cache)' : 'Voltcraft (direct)'
  if (source === 'Cache') return 'Cache local'
  return 'Source inconnue'
}

function MetricTile({ icon: Icon, label, value, detail }: { icon: typeof Activity; label: string; value: string; detail?: string }) {
  return (
    <Card className="p-4 lg:p-5">
      <div className="flex items-center gap-2 text-text-muted">
        <Icon size={14} />
        <p className="text-xs uppercase tracking-wide">{label}</p>
      </div>
      <p className="mt-3 text-2xl font-semibold text-text-primary leading-tight">{value}</p>
      {detail ? <p className="mt-1 text-xs text-text-muted">{detail}</p> : null}
    </Card>
  )
}

function CompareRow({ label, left, right, delta, tone = 'text-text-secondary' }: { label: string; left: string; right: string; delta?: string; tone?: string }) {
  return (
    <div className="grid grid-cols-12 gap-3 items-center py-3 border-b border-border-subtle last:border-b-0">
      <div className="col-span-4 lg:col-span-3 text-sm text-text-muted">{label}</div>
      <div className="col-span-4 lg:col-span-4 text-sm text-text-primary font-medium">{left}</div>
      <div className={cn('col-span-4 lg:col-span-3 text-sm text-right', tone)}>{right}</div>
      <div className="col-span-12 lg:col-span-2 text-xs text-text-muted lg:text-right">{delta ?? '—'}</div>
    </div>
  )
}

function Badge({ children, tone = 'text-text-secondary border-border-subtle bg-bg-overlay/70' }: { children: ReactNode; tone?: string }) {
  return <span className={cn('inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs', tone)}>{children}</span>
}

function InfoChip({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'neutral' | 'success' | 'warning' }) {
  const toneClass = tone === 'warning'
    ? 'border-warning/30 bg-warning/10 text-text-secondary'
    : tone === 'success'
      ? 'border-success/30 bg-success/10 text-text-secondary'
      : 'border-border-subtle bg-bg-overlay/60 text-text-secondary'

  return (
    <div className={cn('rounded-2xl border p-4', toneClass)}>
      <p className="text-xs uppercase tracking-wide text-text-muted">{label}</p>
      <p className="mt-2 text-base font-semibold text-text-primary">{value}</p>
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center px-4 text-center">
      <p className="max-w-sm text-sm text-text-muted">{message}</p>
    </div>
  )
}

export function DiagnosticsPage() {
  const [viewMode, setViewMode] = useState<DiagnosticsViewMode>('essential')

  const { data: vehicle } = useQuery({
    queryKey: ['vehicle', 'current'],
    queryFn: vehicleApi.getCurrent,
    refetchInterval: 30_000,
  })

  const { data: state } = useQuery({
    queryKey: ['vehicle', 'state'],
    queryFn: vehicleApi.getState,
    refetchInterval: 30_000,
    enabled: !!vehicle,
  })

  const { data: history } = useQuery({
    queryKey: ['vehicle', 'history', 1, 90],
    queryFn: () => vehicleApi.getHistory(1, 90),
    refetchInterval: 60_000,
    enabled: !!vehicle,
  })

  const { data: batteryHealth } = useQuery({
    queryKey: ['stats', 'battery-health', 180],
    queryFn: () => statsApi.batteryHealth(180),
    staleTime: 5 * 60_000,
  })

  const { data: summary } = useQuery({
    queryKey: ['stats', 'summary', 30],
    queryFn: () => statsApi.summary(30),
    staleTime: 5 * 60_000,
  })

  const { data: efficiency } = useQuery({
    queryKey: ['stats', 'efficiency', 30],
    queryFn: () => statsApi.efficiency(30),
    staleTime: 5 * 60_000,
  })

  const { data: idles } = useQuery({
    queryKey: ['stats', 'idles', 7, 5],
    queryFn: () => statsApi.idles(7, 5),
    staleTime: 5 * 60_000,
  })

  const { data: batteryHealthMeasurements } = useQuery({
    queryKey: ['stats', 'battery-health', 'measurements', 180],
    queryFn: () => statsApi.batteryHealthMeasurements(180),
    staleTime: 5 * 60_000,
  })

  const { data: teslaConnection } = useQuery({
    queryKey: ['diagnostics', 'tesla-connection'],
    queryFn: diagnosticsApi.teslaConnection,
    staleTime: 60_000,
  })

  const { data: teslamateSettings } = useQuery({
    queryKey: ['settings', 'teslamate'],
    queryFn: settingsApi.getTeslamate,
    staleTime: 60_000,
  })

  const { data: userSettingsRaw } = useQuery({
    queryKey: ['settings'],
    queryFn: settingsApi.get,
    staleTime: 60_000,
  })

  const batteryHealthSummary = batteryHealth as {
    ready?: boolean
    samplesCount?: number
    estimatedHealthPct?: number | null
    bestFullRangeKm?: number | null
    currentFullRangeKm?: number | null
  } | undefined

  const summaryData = summary as {
    distanceKm?: number
    energyUsedKwh?: number
    avgConsumptionKwhPer100km?: number
    tripsCount?: number
    chargeSessionsCount?: number
  } | undefined

  const userSettings = userSettingsRaw as Record<string, unknown> | undefined
  const freshnessWarnMin = Math.max(1, Number(userSettings?.diagnosticsFreshnessWarnMin ?? 8))
  const freshnessCriticalMin = Math.max(freshnessWarnMin + 1, Number(userSettings?.diagnosticsFreshnessCriticalMin ?? 20))
  const batteryDeltaWarnPct = Math.max(0.1, Number(userSettings?.diagnosticsBatteryDeltaWarnPct ?? 2))
  const batteryDeltaCriticalPct = Math.max(batteryDeltaWarnPct + 0.1, Number(userSettings?.diagnosticsBatteryDeltaCriticalPct ?? 5))
  const idleWarnHours7d = Math.max(0, Number(userSettings?.diagnosticsIdleWarnHours7d ?? 8))
  const idleCriticalHours7d = Math.max(idleWarnHours7d + 0.1, Number(userSettings?.diagnosticsIdleCriticalHours7d ?? 12))

  const historyRows = Array.isArray(history) ? (history as VehicleHistorySnapshot[]) : []
  const latestHistory = historyRows[0]
  const recentHistory = historyRows.slice(0, 12).reverse()
  const lastStateAt = state?.capturedAt ?? vehicle?.lastSeenAt ?? latestHistory?.capturedAt ?? null
  const freshnessMinutes = ageMinutes(lastStateAt)
  const isFresh = freshnessMinutes != null && freshnessMinutes < 6
  const snapshotGapMinutes = latestHistory && state ? Math.round(Math.abs(new Date(state.capturedAt).getTime() - new Date(latestHistory.capturedAt).getTime()) / 60_000) : null
  const batteryDelta = latestHistory && state ? Math.abs((state.batteryLevel ?? 0) - (latestHistory.batteryLevel ?? 0)) : null

  const source: TelemetrySource = teslamateSettings?.configured
    ? 'TeslaMate'
    : state?.isCached
      ? 'Cache'
      : vehicle?.isCached
        ? 'Voltcraft'
        : 'Unknown'

  const sourceTone = teslaConnection?.connected
    ? 'text-success border-success/30 bg-success/10'
    : teslamateSettings?.configured
      ? 'text-warning border-warning/30 bg-warning/10'
      : 'text-text-muted border-border-subtle bg-bg-overlay/70'

  const batteryHealthData = useMemo(() => {
    if (!Array.isArray(batteryHealthMeasurements)) return []
    return batteryHealthMeasurements.map((row) => ({
      day: String((row as { day?: string }).day ?? ''),
      est_full_range_km: Number((row as { est_full_range_km?: number }).est_full_range_km ?? 0),
    }))
  }, [batteryHealthMeasurements])

  const batteryTrend = useMemo(() => {
    return historyRows.slice(0, 72).reverse().map((row) => ({
      time: new Date(row.capturedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      batteryLevel: row.batteryLevel,
      range: row.batteryRange,
    }))
  }, [historyRows])

  const driveTrend = useMemo(() => {
    const sorted = historyRows
      .slice(0, 240)
      .slice()
      .reverse()

    const activeSamples = sorted.filter((row) => {
      const speed = Number(row.speed ?? 0)
      const power = Number(row.power ?? 0)
      return row.isDriving || speed > 1 || Math.abs(power) >= 5
    })

    const sampled = activeSamples.length > 120 ? activeSamples.filter((_, index) => index % 2 === 0) : activeSamples

    return sampled.map((row) => {
      const at = new Date(row.capturedAt)
      const isToday = new Date().toDateString() === at.toDateString()
      const time = isToday
        ? at.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
        : at.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

      return {
        time,
        speed: Number(row.speed ?? 0),
        power: Number(row.power ?? 0),
      }
    })
  }, [historyRows])

  const drivePowerDomain = useMemo<[number, number]>(() => {
    if (driveTrend.length === 0) return [-25, 25]
    const maxAbs = Math.max(...driveTrend.map((row) => Math.abs(Number(row.power ?? 0))), 25)
    const rounded = Math.ceil(maxAbs / 5) * 5
    return [-rounded, rounded]
  }, [driveTrend])

  const driveSpeedMax = useMemo(() => {
    if (driveTrend.length === 0) return 60
    const maxSpeed = Math.max(...driveTrend.map((row) => Number(row.speed ?? 0)), 40)
    return Math.ceil((maxSpeed * 1.15) / 10) * 10
  }, [driveTrend])

  const thermalTrend = useMemo(() => {
    return historyRows
      .slice(0, 72)
      .reverse()
      .filter((row) => row.insideTemp != null || row.outsideTemp != null)
      .map((row) => ({
        time: new Date(row.capturedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        inside: row.insideTemp,
        outside: row.outsideTemp,
      }))
  }, [historyRows])

  const efficiencyData = Array.isArray(efficiency)
    ? efficiency.slice(-14).map((row) => ({
      day: String((row as { day?: string }).day ?? '').slice(5, 10),
      distance_km: Number((row as { distance_km?: number }).distance_km ?? 0),
      charged_kwh: Number((row as { charged_kwh?: number }).charged_kwh ?? 0),
    }))
    : []

  const idleData = Array.isArray(idles) ? idles : []
  const idleHours7d = idleData.reduce((sum, row) => sum + Number((row as { durationMin?: number }).durationMin ?? 0), 0) / 60

  const scoreBreakdown = useMemo(() => {
    const factors: Array<{ label: string; points: number; reason: string }> = []

    if (teslamateSettings?.configured && teslaConnection?.connected === false) {
      factors.push({ label: 'Connectivite TeslaMate', points: -20, reason: 'Connexion indisponible' })
    }

    if (freshnessMinutes == null) {
      factors.push({ label: 'Fraicheur telemetrie', points: -15, reason: 'Lecture indisponible' })
    } else if (freshnessMinutes > freshnessCriticalMin) {
      factors.push({ label: 'Fraicheur telemetrie', points: -30, reason: `${freshnessMinutes} min > seuil critique ${freshnessCriticalMin}` })
    } else if (freshnessMinutes > freshnessWarnMin) {
      factors.push({ label: 'Fraicheur telemetrie', points: -15, reason: `${freshnessMinutes} min > seuil warning ${freshnessWarnMin}` })
    }

    if (batteryDelta != null) {
      if (batteryDelta > batteryDeltaCriticalPct) {
        factors.push({ label: 'Ecart batterie', points: -20, reason: `${batteryDelta.toFixed(1)} pts > seuil critique ${batteryDeltaCriticalPct}` })
      } else if (batteryDelta > batteryDeltaWarnPct) {
        factors.push({ label: 'Ecart batterie', points: -10, reason: `${batteryDelta.toFixed(1)} pts > seuil warning ${batteryDeltaWarnPct}` })
      }
    }

    if (state?.isPluggedIn && !state?.isCharging) {
      factors.push({ label: 'Etat de charge', points: -5, reason: 'Branche sans charge active' })
    }

    if (idleHours7d > idleCriticalHours7d) {
      factors.push({ label: 'Idle 7 jours', points: -10, reason: `${idleHours7d.toFixed(1)} h > seuil critique ${idleCriticalHours7d}` })
    } else if (idleHours7d > idleWarnHours7d) {
      factors.push({ label: 'Idle 7 jours', points: -5, reason: `${idleHours7d.toFixed(1)} h > seuil warning ${idleWarnHours7d}` })
    }

    return factors
  }, [batteryDelta, batteryDeltaCriticalPct, batteryDeltaWarnPct, freshnessCriticalMin, freshnessMinutes, freshnessWarnMin, idleCriticalHours7d, idleHours7d, idleWarnHours7d, state?.isCharging, state?.isPluggedIn, teslaConnection?.connected, teslamateSettings?.configured])

  const healthScore = useMemo(() => {
    const malus = scoreBreakdown.reduce((sum, factor) => sum + Math.abs(Math.min(0, factor.points)), 0)
    return Math.max(0, Math.min(100, Math.round(100 - malus)))
  }, [scoreBreakdown])

  const prioritizedAlerts = useMemo(() => {
    const alerts: Array<{ severity: AlertSeverity; title: string; detail: string }> = []

    if (teslamateSettings?.configured && teslaConnection?.connected === false) {
      alerts.push({
        severity: 'Critique',
        title: 'Connecteur TeslaMate indisponible',
        detail: 'Les lectures peuvent etre degradees tant que la connexion API n est pas retablie.',
      })
    }

    if (freshnessMinutes != null && freshnessMinutes > freshnessCriticalMin) {
      alerts.push({
        severity: 'Critique',
        title: 'Telemetrie trop ancienne',
        detail: `${freshnessMinutes} min sans mise a jour exploitable.`,
      })
    } else if (freshnessMinutes != null && freshnessMinutes > freshnessWarnMin) {
      alerts.push({
        severity: 'A surveiller',
        title: 'Fraicheur moyenne',
        detail: `${freshnessMinutes} min depuis la derniere lecture.`,
      })
    }

    if (batteryDelta != null && batteryDelta > batteryDeltaCriticalPct) {
      alerts.push({
        severity: 'Critique',
        title: 'Divergence de batterie',
        detail: `Ecart de ${batteryDelta.toFixed(1)} points entre snapshots.`,
      })
    } else if (batteryDelta != null && batteryDelta > batteryDeltaWarnPct) {
      alerts.push({
        severity: 'A surveiller',
        title: 'Ecart de batterie notable',
        detail: `Ecart de ${batteryDelta.toFixed(1)} points a verifier.`,
      })
    }

    if (state?.isPluggedIn && !state?.isCharging) {
      alerts.push({
        severity: 'A surveiller',
        title: 'Vehicule branche sans charge',
        detail: 'Verifier la programmation, la limite de charge ou le courant disponible.',
      })
    }

    if (idleHours7d >= idleWarnHours7d) {
      alerts.push({
        severity: 'Info',
        title: 'Temps d arret eleve',
        detail: `${idleHours7d.toFixed(1)} h d idle sur 7 jours.`,
      })
    }

    if (alerts.length === 0) {
      alerts.push({
        severity: 'Info',
        title: 'Aucune alerte active',
        detail: 'Les indicateurs principaux sont actuellement coherents.',
      })
    }

    const rank: Record<AlertSeverity, number> = {
      Critique: 0,
      'A surveiller': 1,
      Info: 2,
    }

    return alerts.sort((a, b) => rank[a.severity] - rank[b.severity]).slice(0, 5)
  }, [batteryDelta, batteryDeltaCriticalPct, batteryDeltaWarnPct, freshnessCriticalMin, freshnessMinutes, freshnessWarnMin, idleHours7d, idleWarnHours7d, state?.isCharging, state?.isPluggedIn, teslaConnection?.connected, teslamateSettings?.configured])

  const insightHistory7d = useMemo(() => {
    return efficiencyData.slice(-7).map((row) => {
      const kwh100 = row.distance_km > 0 ? (row.charged_kwh / row.distance_km) * 100 : null
      const status = kwh100 == null
        ? 'Faible usage'
        : kwh100 > 23
          ? 'A surveiller'
          : 'Normal'

      const note = kwh100 == null
        ? 'Pas assez de distance pour evaluer la conso.'
        : `${kwh100.toFixed(1)} kWh/100 km`

      return {
        day: row.day,
        status,
        note,
      }
    }).reverse()
  }, [efficiencyData])

  const stateMix = useMemo(() => {
    const sample = historyRows.slice(0, 120)
    const moving = sample.filter((row) => row.isDriving).length
    const charging = sample.filter((row) => row.isCharging).length
    const parked = Math.max(0, sample.length - moving - charging)
    return [
      { label: 'Stationne', value: parked },
      { label: 'En conduite', value: moving },
      { label: 'En charge', value: charging },
    ]
  }, [historyRows])

  const comparisonVerdict = !state || !latestHistory
    ? 'Pas assez de donnees pour comparer'
    : snapshotGapMinutes != null && snapshotGapMinutes > 10
      ? 'La donnee locale est plus ancienne que le dernier signal exploitable'
      : batteryDelta != null && batteryDelta > 2
        ? 'La charge visible diverge entre les derniers echantillons'
        : 'Les derniers signaux sont coherents'

  const vehicleStatus = state?.isCharging
    ? 'En charge'
    : state?.isPluggedIn
      ? 'Branche'
      : state?.isDriving
        ? 'En conduite'
        : vehicle?.state === 'online'
          ? 'En ligne'
          : vehicle?.state === 'asleep'
            ? 'En veille'
            : vehicle?.state === 'offline'
              ? 'Hors ligne'
              : vehicle?.state ?? 'Inconnu'

  const lockTone = state?.isLocked === false ? 'text-warning border-warning/30 bg-warning/10' : 'text-success border-success/30 bg-success/10'

  const insights = useMemo(() => {
    const result: string[] = []

    if (freshnessMinutes != null) {
      if (freshnessMinutes <= 5) {
        result.push('Telemetrie fraiche: les donnees sont exploitables en temps reel.')
      } else {
        result.push(`Telemetrie en retard (${freshnessMinutes} min): verifier la connectivite ou relancer une sync.`)
      }
    }

    if (state?.isPluggedIn && !state?.isCharging) {
      result.push('Vehicule branche sans charge active: verifier limite de charge, amperage ou programmation.')
    }

    if (summaryData?.distanceKm != null && summaryData?.energyUsedKwh != null && summaryData.distanceKm > 0) {
      const kwhPer100 = (summaryData.energyUsedKwh / summaryData.distanceKm) * 100
      result.push(`Consommation observee 30 jours: ${kwhPer100.toFixed(1)} kWh/100 km.`)
    }

    if (batteryDelta != null && batteryDelta > batteryDeltaWarnPct) {
      result.push(`Ecart de batterie detecte (${batteryDelta.toFixed(1)} pts) entre lecture courante et historique.`)
    }

    if (idleHours7d >= idleWarnHours7d) {
      result.push(`Temps d arret eleve (${idleHours7d.toFixed(1)} h sur 7 jours): surveiller les consommations parasites.`)
    }

    if (result.length === 0) {
      result.push('Aucun signal faible majeur detecte sur les derniers echantillons.')
    }

    return result.slice(0, 4)
  }, [batteryDelta, batteryDeltaWarnPct, freshnessMinutes, idleHours7d, idleWarnHours7d, state?.isCharging, state?.isPluggedIn, summaryData?.distanceKm, summaryData?.energyUsedKwh])

  const exportDiagnosticsCsv = () => {
    const rows: Array<[string, string]> = [
      ['GeneratedAt', new Date().toISOString()],
      ['Vehicle', vehicle?.displayName ?? ''],
      ['VIN', vehicle?.vin ?? ''],
      ['VehicleStatus', vehicleStatus],
      ['HealthScore', String(healthScore)],
      ['FreshnessMinutes', freshnessMinutes == null ? '' : String(freshnessMinutes)],
      ['BatteryDeltaPoints', batteryDelta == null ? '' : batteryDelta.toFixed(2)],
      ['IdleHours7d', idleHours7d.toFixed(2)],
      ['ThresholdFreshnessWarnMin', String(freshnessWarnMin)],
      ['ThresholdFreshnessCriticalMin', String(freshnessCriticalMin)],
      ['ThresholdBatteryDeltaWarnPts', String(batteryDeltaWarnPct)],
      ['ThresholdBatteryDeltaCriticalPts', String(batteryDeltaCriticalPct)],
      ['ThresholdIdleWarnHours7d', String(idleWarnHours7d)],
      ['ThresholdIdleCriticalHours7d', String(idleCriticalHours7d)],
    ]

    scoreBreakdown.forEach((factor, index) => {
      rows.push([`ScoreFactor${index + 1}`, `${factor.label} (${factor.points}) - ${factor.reason}`])
    })

    prioritizedAlerts.forEach((alert, index) => {
      rows.push([`Alert${index + 1}`, `[${alert.severity}] ${alert.title} - ${alert.detail}`])
    })

    insights.forEach((insight, index) => {
      rows.push([`Insight${index + 1}`, insight])
    })

    const escape = (value: string) => `"${value.replace(/"/g, '""')}"`
    const csv = ['Metric,Value', ...rows.map(([k, v]) => `${escape(k)},${escape(v)}`)].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `diagnostics-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.csv`
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <section className="rounded-3xl border border-border-subtle bg-gradient-to-br from-bg-surface via-bg-surface to-bg-overlay p-5 lg:p-7 shadow-[0_18px_70px_rgba(0,0,0,0.18)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={sourceTone}>
                <Cpu size={12} />
                {sourceLabel(source, Boolean(state?.isCached || vehicle?.isCached))}
              </Badge>
              <Badge tone={isFresh ? 'text-success border-success/30 bg-success/10' : 'text-warning border-warning/30 bg-warning/10'}>
                <Clock3 size={12} />
                {lastStateAt ? `Actualise il y a ${formatAge(lastStateAt)}` : 'En attente de telemetrie'}
              </Badge>
              <Badge tone={teslaConnection?.connected ? 'text-success border-success/30 bg-success/10' : 'text-warning border-warning/30 bg-warning/10'}>
                <Shield size={12} />
                {teslaConnection?.connected ? 'Tesla API joignable' : teslaConnection?.connected === false ? 'TeslaMate / Tesla API a verifier' : 'Connexion en cours'}
              </Badge>
            </div>

            <div>
              <h1 className="text-3xl lg:text-4xl font-semibold tracking-tight text-text-primary">Infos avancées véhicule</h1>
              <p className="mt-2 text-sm lg:text-base text-text-muted max-w-3xl">
                Vue lisible de la sante du vehicule: signaux essentiels en premier, analyses expertes a la demande.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-sm text-text-secondary">
              <span className="font-medium text-text-primary">{vehicle?.displayName ?? 'Véhicule Tesla'}</span>
              <span>•</span>
              <span>VIN {vehicle?.vin ?? '—'}</span>
              <span>•</span>
              <span>{vehicleStatus}</span>
              <span>•</span>
              <span>{vehicle?.lastSeenAt ? `Vu le ${formatDate(vehicle.lastSeenAt)}` : 'Jamais vu'}</span>
            </div>

            <div className="inline-flex rounded-xl border border-border-subtle bg-bg-overlay/60 p-1">
              <button
                type="button"
                onClick={() => setViewMode('essential')}
                className={cn(
                  'px-3 py-1.5 text-xs rounded-lg transition-colors',
                  viewMode === 'essential' ? 'bg-accent-500/20 text-text-primary' : 'text-text-secondary hover:text-text-primary',
                )}
              >
                Essentiel
              </button>
              <button
                type="button"
                onClick={() => setViewMode('expert')}
                className={cn(
                  'px-3 py-1.5 text-xs rounded-lg transition-colors',
                  viewMode === 'expert' ? 'bg-accent-500/20 text-text-primary' : 'text-text-secondary hover:text-text-primary',
                )}
              >
                Expert
              </button>
            </div>

            <div>
              <button
                type="button"
                onClick={exportDiagnosticsCsv}
                className="text-xs rounded-lg border border-border-subtle bg-bg-overlay/60 px-3 py-1.5 text-text-secondary hover:text-text-primary"
              >
                Export diagnostic CSV
              </button>
            </div>
          </div>

          <div className="w-full lg:w-auto rounded-2xl border border-border-subtle bg-bg-overlay/70 px-4 py-3 text-sm text-text-secondary">
            <p className="text-text-primary font-medium">Lecture de confiance</p>
            <p className="mt-1">{comparisonVerdict}</p>
            <p className="mt-1 text-xs text-text-muted">Forte priorité donnée aux données les plus fraîches et aux états cohérents, pas aux chiffres les plus flatteurs.</p>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricTile
          icon={BatteryCharging}
          label="Charge"
          value={state?.batteryLevel != null ? formatPercent(Math.round(state.batteryLevel)) : '—'}
          detail={state?.batteryRange != null ? `${formatKm(state.batteryRange)} estimés` : 'Autonomie indisponible'}
        />
        <MetricTile
          icon={Gauge}
          label="Limite"
          value={state?.chargeLimitSoc != null ? formatPercent(Math.round(state.chargeLimitSoc)) : '—'}
          detail={state?.chargeState ?? 'Etat de charge inconnu'}
        />
        <MetricTile
          icon={Thermometer}
          label="Températures"
          value={state?.insideTemp != null ? `${state.insideTemp.toFixed(1)} °C` : '—'}
          detail={state?.outsideTemp != null ? `Extérieur ${state.outsideTemp.toFixed(1)} °C` : 'Extérieur indisponible'}
        />
        <MetricTile
          icon={Compass}
          label="Position"
          value={state?.latitude != null && state?.longitude != null ? 'GPS actif' : '—'}
          detail={state?.atHome ? 'A domicile' : state?.isDriving ? 'En mouvement' : 'Stationné'}
        />
      </section>

      <Card className="p-5 lg:p-6">
        <CardHeader>
          <div>
            <CardTitle>Insights automatiques</CardTitle>
            <h2 className="mt-2 text-xl font-semibold text-text-primary">Ce qui merite ton attention</h2>
          </div>
        </CardHeader>
        <div className="grid gap-2 text-sm text-text-secondary">
          {insights.map((insight) => (
            <div key={insight} className="rounded-xl border border-border-subtle bg-bg-overlay/50 px-3 py-2">
              {insight}
            </div>
          ))}
        </div>
      </Card>

      <div className="grid xl:grid-cols-3 gap-4">
        <Card className="p-5 lg:p-6">
          <CardHeader>
            <div>
              <CardTitle>Score santé</CardTitle>
              <h2 className="mt-2 text-xl font-semibold text-text-primary">Confiance globale</h2>
            </div>
          </CardHeader>
          <div className="space-y-3">
            <p className="text-4xl font-semibold text-text-primary">{healthScore}/100</p>
            <div className="h-2 rounded-full bg-bg-overlay/70 overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full',
                  healthScore >= 80 ? 'bg-success' : healthScore >= 60 ? 'bg-warning' : 'bg-error',
                )}
                style={{ width: `${healthScore}%` }}
              />
            </div>
            <p className="text-sm text-text-secondary">
              {healthScore >= 80
                ? 'Etat global stable.'
                : healthScore >= 60
                  ? 'Etat acceptable mais a surveiller.'
                  : 'Etat degrade: intervention recommandee.'}
            </p>

            <div className="space-y-1">
              {scoreBreakdown.length > 0 ? scoreBreakdown.map((factor) => (
                <p key={`${factor.label}-${factor.reason}`} className="text-xs text-text-muted">
                  {factor.label}: {factor.points} ({factor.reason})
                </p>
              )) : (
                <p className="text-xs text-text-muted">Aucun malus actif.</p>
              )}
            </div>
          </div>
        </Card>

        <Card className="xl:col-span-2 p-5 lg:p-6">
          <CardHeader>
            <div>
              <CardTitle>Alertes priorisées</CardTitle>
              <h2 className="mt-2 text-xl font-semibold text-text-primary">Critique, surveillance, info</h2>
            </div>
          </CardHeader>
          <div className="grid gap-2">
            {prioritizedAlerts.map((alert) => (
              <div key={`${alert.severity}-${alert.title}`} className="rounded-xl border border-border-subtle bg-bg-overlay/50 px-3 py-2">
                <p className="text-sm font-medium text-text-primary">
                  <span
                    className={cn(
                      'mr-2 inline-block rounded px-2 py-0.5 text-[11px]',
                      alert.severity === 'Critique'
                        ? 'bg-error/20 text-error'
                        : alert.severity === 'A surveiller'
                          ? 'bg-warning/20 text-warning'
                          : 'bg-success/20 text-success',
                    )}
                  >
                    {alert.severity}
                  </span>
                  {alert.title}
                </p>
                <p className="mt-1 text-xs text-text-muted">{alert.detail}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="p-5 lg:p-6">
        <CardHeader>
          <div>
            <CardTitle>Historique insights 7 jours</CardTitle>
            <h2 className="mt-2 text-xl font-semibold text-text-primary">Evolution recente</h2>
          </div>
        </CardHeader>
        <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3">
          {insightHistory7d.map((item) => (
            <div key={`${item.day}-${item.status}`} className="rounded-xl border border-border-subtle bg-bg-overlay/50 p-3">
              <p className="text-xs text-text-muted">{item.day}</p>
              <p className="mt-1 text-sm font-medium text-text-primary">{item.status}</p>
              <p className="mt-1 text-xs text-text-secondary">{item.note}</p>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid xl:grid-cols-3 gap-4 items-stretch">
        {viewMode === 'expert' && (
        <Card className="xl:col-span-2 p-0 overflow-hidden">
          <div className="p-5 lg:p-6 border-b border-border-subtle">
            <CardTitle>Deep Dive conduite</CardTitle>
            <h2 className="mt-2 text-xl font-semibold text-text-primary">Vitesse et puissance instantanées</h2>
          </div>
          <div className="h-72 px-3 pb-4 pt-2">
            {driveTrend.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={driveTrend} margin={{ left: 8, right: 12, top: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2A2A2A" vertical={false} />
                  <XAxis dataKey="time" stroke="#8D8D8D" tickLine={false} axisLine={false} />
                  <YAxis yAxisId="left" domain={[0, driveSpeedMax]} stroke="#8D8D8D" tickLine={false} axisLine={false} width={40} />
                  <YAxis yAxisId="right" domain={drivePowerDomain} orientation="right" stroke="#8D8D8D" tickLine={false} axisLine={false} width={40} />
                  <Tooltip contentStyle={{ background: '#1B1B1B', border: '1px solid #2A2A2A', borderRadius: 10, color: '#F5F5F5' }} />
                  <ReferenceLine yAxisId="right" y={0} stroke="#444" strokeDasharray="4 4" />
                  <Line yAxisId="left" type="monotone" dataKey="speed" name="Vitesse km/h" stroke="#22c55e" strokeWidth={2} dot={false} />
                  <Line yAxisId="right" type="monotone" dataKey="power" name="Puissance kW" stroke="#f59e0b" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState message="Aucune donnée de conduite récente n est disponible pour tracer cette vue." />
            )}
          </div>
        </Card>
        )}

        <Card className="p-5 lg:p-6">
          <CardHeader>
            <div>
              <CardTitle>Résumé 30 jours</CardTitle>
              <h2 className="mt-2 text-xl font-semibold text-text-primary">Usage réel du véhicule</h2>
            </div>
          </CardHeader>

          <div className="space-y-3 text-sm text-text-secondary">
            <div className="rounded-2xl border border-border-subtle bg-bg-overlay/60 p-4">
              <p className="text-xs uppercase tracking-wide text-text-muted">Distance</p>
              <p className="mt-2 text-2xl font-semibold text-text-primary">{Math.round(summaryData?.distanceKm ?? 0)} km</p>
            </div>
            <div className="rounded-2xl border border-border-subtle bg-bg-overlay/60 p-4">
              <p className="text-xs uppercase tracking-wide text-text-muted">Conso moyenne</p>
              <p className="mt-2 text-2xl font-semibold text-text-primary">{summaryData?.avgConsumptionKwhPer100km != null ? `${summaryData.avgConsumptionKwhPer100km} kWh/100` : '—'}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-border-subtle bg-bg-overlay/60 p-4">
                <p className="text-xs uppercase tracking-wide text-text-muted">Trajets</p>
                <p className="mt-2 text-2xl font-semibold text-text-primary">{summaryData?.tripsCount ?? 0}</p>
              </div>
              <div className="rounded-2xl border border-border-subtle bg-bg-overlay/60 p-4">
                <p className="text-xs uppercase tracking-wide text-text-muted">Charges</p>
                <p className="mt-2 text-2xl font-semibold text-text-primary">{summaryData?.chargeSessionsCount ?? 0}</p>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {viewMode === 'expert' && (
      <div className="grid xl:grid-cols-3 gap-4 items-stretch">
        <Card className="xl:col-span-2 p-0 overflow-hidden">
          <div className="p-5 lg:p-6 border-b border-border-subtle">
            <CardTitle>Suivi thermique</CardTitle>
            <h2 className="mt-2 text-xl font-semibold text-text-primary">Température intérieure vs extérieure</h2>
          </div>
          <div className="h-72 px-3 pb-4 pt-2">
            {thermalTrend.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={thermalTrend} margin={{ left: 8, right: 12, top: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2A2A2A" vertical={false} />
                  <XAxis dataKey="time" stroke="#8D8D8D" tickLine={false} axisLine={false} />
                  <YAxis stroke="#8D8D8D" tickLine={false} axisLine={false} width={40} />
                  <Tooltip contentStyle={{ background: '#1B1B1B', border: '1px solid #2A2A2A', borderRadius: 10, color: '#F5F5F5' }} />
                  <Line type="monotone" dataKey="inside" name="Interieur °C" stroke="#38bdf8" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="outside" name="Exterieur °C" stroke="#a78bfa" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState message="Le suivi thermique s affichera quand des températures seront remontées." />
            )}
          </div>
        </Card>

        <Card className="p-5 lg:p-6">
          <CardHeader>
            <div>
              <CardTitle>Comportement</CardTitle>
              <h2 className="mt-2 text-xl font-semibold text-text-primary">Répartition des états</h2>
            </div>
          </CardHeader>
          <div className="h-52">
            {stateMix.some((item) => item.value > 0) ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stateMix} margin={{ left: 4, right: 4, top: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2A2A2A" vertical={false} />
                  <XAxis dataKey="label" stroke="#8D8D8D" tickLine={false} axisLine={false} />
                  <YAxis stroke="#8D8D8D" tickLine={false} axisLine={false} width={30} />
                  <Tooltip contentStyle={{ background: '#1B1B1B', border: '1px solid #2A2A2A', borderRadius: 10, color: '#F5F5F5' }} />
                  <Bar dataKey="value" fill="#E8112D" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState message="Pas assez d échantillons pour établir la répartition." />
            )}
          </div>
          <div className="mt-3 space-y-2 text-sm text-text-secondary">
            <p>Idle 7 jours: <span className="text-text-primary font-medium">{idleHours7d.toFixed(1)} h</span></p>
            <p>Conso 30 jours: <span className="text-text-primary font-medium">{summaryData?.energyUsedKwh != null ? `${summaryData.energyUsedKwh.toFixed(1)} kWh` : '—'}</span></p>
          </div>
        </Card>
      </div>
      )}

      {viewMode === 'expert' && (
      <Card className="p-0 overflow-hidden">
        <div className="p-5 lg:p-6 border-b border-border-subtle">
          <CardTitle>Activité quotidienne</CardTitle>
          <h2 className="mt-2 text-xl font-semibold text-text-primary">Distance et énergie chargée sur 14 jours</h2>
        </div>
        <div className="h-72 px-3 pb-4 pt-2">
          {efficiencyData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={efficiencyData} margin={{ left: 8, right: 12, top: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2A2A2A" vertical={false} />
                <XAxis dataKey="day" stroke="#8D8D8D" tickLine={false} axisLine={false} />
                <YAxis stroke="#8D8D8D" tickLine={false} axisLine={false} width={36} />
                <Tooltip contentStyle={{ background: '#1B1B1B', border: '1px solid #2A2A2A', borderRadius: 10, color: '#F5F5F5' }} />
                <Bar dataKey="distance_km" name="km" fill="#22c55e" radius={[4, 4, 0, 0]} />
                <Bar dataKey="charged_kwh" name="kWh" fill="#38bdf8" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState message="L activité quotidienne s affichera après accumulation des trajets et recharges." />
          )}
        </div>
      </Card>
      )}

      {viewMode === 'expert' && (
      <div className="grid xl:grid-cols-3 gap-4 items-start">
        <Card className="xl:col-span-2 p-0 overflow-hidden">
          <div className="p-5 lg:p-6 border-b border-border-subtle bg-bg-overlay/30">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="text-sm">Comparaison des signaux</CardTitle>
                <h2 className="mt-2 text-xl font-semibold text-text-primary">Voltcraft vs TeslaMate</h2>
              </div>
              <div className="text-xs text-text-muted max-w-sm">
                Les lignes ci-dessous comparent la dernière vue exploitée côté backend avec le dernier snapshot local disponible et la fraîcheur du signal.
              </div>
            </div>
          </div>

          <div className="px-5 lg:px-6">
            <CompareRow
              label="Source"
              left={sourceLabel(source, Boolean(state?.isCached || vehicle?.isCached))}
              right={teslamateSettings?.configured ? 'TeslaMate configuré' : 'TeslaMate non configuré'}
              delta={teslaConnection?.connected ? 'Connexion active' : 'Connexion inactive'}
            />
            <CompareRow
              label="Fraîcheur"
              left={lastStateAt ? `${formatAge(lastStateAt)} depuis la dernière lecture` : '—'}
              right={latestHistory?.capturedAt ? `${formatAge(latestHistory.capturedAt)} sur l historique` : '—'}
              delta={snapshotGapMinutes != null ? `${snapshotGapMinutes} min d écart` : '—'}
            />
            <CompareRow
              label="Charge"
              left={state?.batteryLevel != null ? formatPercent(Math.round(state.batteryLevel)) : '—'}
              right={latestHistory?.batteryLevel != null ? formatPercent(Math.round(latestHistory.batteryLevel)) : '—'}
              delta={batteryDelta != null ? `${batteryDelta.toFixed(1)} pts d écart` : '—'}
            />
            <CompareRow
              label="Autonomie"
              left={state?.batteryRange != null ? formatKm(state.batteryRange) : '—'}
              right={latestHistory?.batteryRange != null ? formatKm(latestHistory.batteryRange) : '—'}
              delta={state?.chargeState ?? '—'}
            />
            <CompareRow
              label="Etat"
              left={vehicleStatus}
              right={state?.isCharging ? 'Charging' : state?.isDriving ? 'Driving' : 'Idle'}
              delta={state?.isCached ? 'Vue cache' : 'Vue directe'}
            />
          </div>

          <div className="px-5 lg:px-6 py-4 border-t border-border-subtle bg-bg-overlay/20">
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-border-subtle bg-bg-overlay/60 p-4">
                <div className="flex items-center gap-2 text-text-muted text-xs uppercase tracking-wide">
                  <BellRing size={12} />
                  Dernier état utile
                </div>
                <p className="mt-2 text-lg font-semibold text-text-primary">
                  {vehicleStatus === 'Inconnu' ? 'Etat inconnu' : vehicleStatus}
                </p>
                <p className="mt-1 text-sm text-text-secondary">
                  {state?.isLocked === false ? 'Vehicule deverrouille' : 'Vehicule verrouille'}
                  {' '}
                  • {state?.isCharging ? 'en charge' : 'pas en charge'}
                  {' '}
                  • {state?.climateOn ? 'clim active' : 'clim stoppee'}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge tone={lockTone}>{state?.isLocked === false ? <Unlock size={12} /> : <Lock size={12} />}{state?.isLocked === false ? 'Déverrouillé' : 'Verrouillé'}</Badge>
                  <Badge tone={state?.isDriving ? 'text-warning border-warning/30 bg-warning/10' : 'text-success border-success/30 bg-success/10'}>
                    <CarFront size={12} />
                    {state?.isDriving ? 'En mouvement' : 'À l arrêt'}
                  </Badge>
                  <Badge tone={state?.climateOn ? 'text-warning border-warning/30 bg-warning/10' : 'text-text-muted border-border-subtle bg-bg-overlay/70'}>
                    <Thermometer size={12} />
                    {state?.climateOn ? 'Climatisation active' : 'Climatisation inactive'}
                  </Badge>
                </div>
              </div>

              <div className="rounded-2xl border border-border-subtle bg-bg-overlay/60 p-4">
                <div className="flex items-center gap-2 text-text-muted text-xs uppercase tracking-wide">
                  <AlertTriangle size={12} />
                  Diagnostic de cohérence
                </div>
                <p className="mt-2 text-lg font-semibold text-text-primary">{comparisonVerdict}</p>
                <div className="mt-3 space-y-2 text-sm text-text-secondary">
                  <p>Frais de lecture: {lastStateAt ? formatAge(lastStateAt) : 'inconnu'}</p>
                  <p>Latence historique: {latestHistory?.capturedAt ? formatAge(latestHistory.capturedAt) : 'inconnue'}</p>
                  <p>Mode backend: {teslamateSettings?.backendOnly ? 'TeslaMate backend only' : 'Mixte avec fallback Voltcraft'}</p>
                </div>
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-5 lg:p-6">
          <CardHeader>
            <div>
              <CardTitle>Etat TeslaMate</CardTitle>
              <h2 className="mt-2 text-xl font-semibold text-text-primary">Connecteur et configuration</h2>
            </div>
          </CardHeader>

          <div className="space-y-3 text-sm text-text-secondary">
            <div className="rounded-2xl border border-border-subtle bg-bg-overlay/60 p-4">
              <p className="text-text-primary font-medium">Connexion</p>
              <p className="mt-1">{teslaConnection?.connected ? 'Active' : 'Inactive'}</p>
              <p className="mt-1 text-xs text-text-muted">{teslaConnection?.error ?? 'Aucune erreur rapportée'}</p>
            </div>
            <div className="rounded-2xl border border-border-subtle bg-bg-overlay/60 p-4">
              <p className="text-text-primary font-medium">Configuration backend</p>
              <p className="mt-1">{teslamateSettings?.configured ? 'Complète' : 'Partielle ou absente'}</p>
              <p className="mt-1 text-xs text-text-muted">{teslamateSettings?.backendOnly ? 'Pilotage 100% backend' : 'Fallback local autorisé'}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-border-subtle bg-bg-overlay/60 p-4">
                <p className="text-xs uppercase tracking-wide text-text-muted">Vehicules DB</p>
                <p className="mt-2 text-2xl font-semibold text-text-primary">{teslaConnection?.dbVehicleCount ?? 0}</p>
              </div>
              <div className="rounded-2xl border border-border-subtle bg-bg-overlay/60 p-4">
                <p className="text-xs uppercase tracking-wide text-text-muted">API joignable</p>
                <p className="mt-2 text-2xl font-semibold text-text-primary">{teslaConnection?.apiReachable ? 'Oui' : 'Non'}</p>
              </div>
            </div>
          </div>
        </Card>
      </div>
      )}

      <div className="grid xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-2 p-0 overflow-hidden">
          <div className="p-5 lg:p-6 border-b border-border-subtle">
            <CardTitle>Evolution récente</CardTitle>
            <h2 className="mt-2 text-xl font-semibold text-text-primary">Batterie et autonomie sur les derniers échantillons</h2>
          </div>
          <div className="h-80 px-3 pb-4 pt-2">
            {batteryTrend.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={batteryTrend} margin={{ left: 8, right: 12, top: 8, bottom: 4 }}>
                  <defs>
                    <linearGradient id="diagBatteryFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#E8112D" stopOpacity={0.34} />
                      <stop offset="100%" stopColor="#E8112D" stopOpacity={0.04} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2A2A2A" vertical={false} />
                  <XAxis dataKey="time" stroke="#8D8D8D" tickLine={false} axisLine={false} />
                  <YAxis stroke="#8D8D8D" tickLine={false} axisLine={false} width={40} />
                  <Tooltip contentStyle={{ background: '#1B1B1B', border: '1px solid #2A2A2A', borderRadius: 10, color: '#F5F5F5' }} />
                  <Area type="monotone" dataKey="batteryLevel" name="Charge" stroke="#E8112D" fill="url(#diagBatteryFill)" strokeWidth={2.25} dot={false} />
                  <Line type="monotone" dataKey="range" name="Autonomie" stroke="#22c55e" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState message="Aucun echantillon récent n est encore disponible pour dessiner la courbe." />
            )}
          </div>
        </Card>

        <Card className="p-5 lg:p-6">
          <CardHeader>
            <div>
              <CardTitle>Santé batterie</CardTitle>
              <h2 className="mt-2 text-xl font-semibold text-text-primary">Estimation basée sur TeslaMate</h2>
            </div>
          </CardHeader>

          {batteryHealth ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-border-subtle bg-bg-overlay/60 p-4">
                <p className="text-xs uppercase tracking-wide text-text-muted">Sante estimee</p>
                <p className="mt-2 text-4xl font-semibold text-text-primary">
                  {batteryHealthSummary?.estimatedHealthPct != null ? `${batteryHealthSummary.estimatedHealthPct.toFixed(1)}%` : '—'}
                </p>
                <p className="mt-2 text-xs text-text-muted">
                  {batteryHealthSummary?.ready ? `${batteryHealthSummary.samplesCount ?? 0} echantillons valides` : 'Donnees encore insuffisantes pour une estimation robuste'}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm text-text-secondary">
                <div className="rounded-2xl border border-border-subtle bg-bg-overlay/60 p-4">
                  <p className="text-xs uppercase tracking-wide text-text-muted">Autonomie max</p>
                  <p className="mt-2 text-lg font-semibold text-text-primary">{batteryHealthSummary?.bestFullRangeKm != null ? `${batteryHealthSummary.bestFullRangeKm.toFixed(1)} km` : '—'}</p>
                </div>
                <div className="rounded-2xl border border-border-subtle bg-bg-overlay/60 p-4">
                  <p className="text-xs uppercase tracking-wide text-text-muted">Autonomie actuelle</p>
                  <p className="mt-2 text-lg font-semibold text-text-primary">{batteryHealthSummary?.currentFullRangeKm != null ? `${batteryHealthSummary.currentFullRangeKm.toFixed(1)} km` : '—'}</p>
                </div>
              </div>

              <div className="rounded-2xl border border-border-subtle bg-bg-overlay/60 p-4">
                <p className="text-xs uppercase tracking-wide text-text-muted mb-3">Mesures recemment retenues</p>
                <div className="h-48">
                  {batteryHealthData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={batteryHealthData} margin={{ left: 8, right: 12, top: 8, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#2A2A2A" vertical={false} />
                        <XAxis dataKey="day" stroke="#8D8D8D" tickLine={false} axisLine={false} hide />
                        <YAxis stroke="#8D8D8D" tickLine={false} axisLine={false} width={36} />
                        <Tooltip contentStyle={{ background: '#1B1B1B', border: '1px solid #2A2A2A', borderRadius: 10, color: '#F5F5F5' }} />
                        <Line type="monotone" dataKey="est_full_range_km" stroke="#7dd3fc" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyState message="Les mesures santé apparaîtront après un volume suffisant de trajets et de charges." />
                  )}
                </div>
              </div>
            </div>
          ) : (
            <EmptyState message="La lecture santé batterie n est pas disponible pour le moment." />
          )}
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-5 lg:p-6">
          <CardHeader>
            <div>
              <CardTitle>Etat détaillé</CardTitle>
              <h2 className="mt-2 text-xl font-semibold text-text-primary">Châssis, climat et conduite</h2>
            </div>
          </CardHeader>

          <div className="grid sm:grid-cols-2 gap-3 text-sm text-text-secondary">
            <InfoChip label="Vitesse" value={state?.speed != null ? `${Math.round(state.speed)} km/h` : '—'} />
            <InfoChip label="Puissance" value={state?.power != null ? `${Math.round(state.power)} kW` : '—'} />
            <InfoChip label="Frunk" value={state?.isFrunkOpen ? 'Ouvert' : 'Ferme'} tone={state?.isFrunkOpen ? 'warning' : 'success'} />
            <InfoChip label="Trunk" value={state?.isTrunkOpen ? 'Ouvert' : 'Ferme'} tone={state?.isTrunkOpen ? 'warning' : 'success'} />
            <InfoChip label="Climatisation" value={state?.climateOn ? 'Active' : 'Inactive'} tone={state?.climateOn ? 'warning' : 'success'} />
            <InfoChip label="En charge" value={state?.isCharging ? 'Oui' : 'Non'} tone={state?.isCharging ? 'warning' : 'success'} />
          </div>
        </Card>

        {viewMode === 'expert' && (
        <Card className="p-5 lg:p-6">
          <CardHeader>
            <div>
              <CardTitle>Derniers points</CardTitle>
              <h2 className="mt-2 text-xl font-semibold text-text-primary">Historique local exploitable</h2>
            </div>
          </CardHeader>

          <div className="space-y-3">
            {recentHistory.length > 0 ? recentHistory.map((row) => (
              <div key={row.id} className="rounded-2xl border border-border-subtle bg-bg-overlay/60 p-4 text-sm text-text-secondary">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-text-primary">{formatDate(row.capturedAt)}</p>
                  <Badge tone={row.source === 'WEBHOOK' ? 'text-success border-success/30 bg-success/10' : 'text-text-muted border-border-subtle bg-bg-overlay/70'}>
                    {row.source ?? 'unknown'}
                  </Badge>
                </div>
                <p className="mt-2">
                  Charge {formatPercent(Math.round(row.batteryLevel))} • {formatKm(row.batteryRange)} • {row.chargeState}
                </p>
                <p className="mt-1 text-xs text-text-muted">
                  {row.isDriving ? 'En mouvement' : 'Stationné'} • {row.isCharging ? 'Charge active' : 'Pas de charge'} • source {sourceLabel('Voltcraft', Boolean(row.source))}
                </p>
              </div>
            )) : (
              <EmptyState message="Aucun point d historique n a encore été conservé." />
            )}
          </div>
        </Card>
        )}
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <MetricTile
          icon={Zap}
          label="Etat source"
          value={teslaConnection?.connected ? 'Stable' : 'Dégradé'}
          detail={teslaConnection?.error ?? 'Les erreurs de connexion sont affichées ici.'}
        />
        <MetricTile
          icon={Shield}
          label="Mode backend"
          value={teslamateSettings?.backendOnly ? 'Strict' : 'Fallback'}
          detail={teslamateSettings?.configured ? 'TeslaMate pilote la lecture quand il est disponible.' : 'TeslaMate n est pas configuré.'}
        />
        <MetricTile
          icon={Activity}
          label="Confiance"
          value={isFresh ? 'Haute' : 'A surveiller'}
          detail={freshnessMinutes != null ? `${formatAge(lastStateAt)} depuis la dernière lecture` : 'Fraîcheur inconnue'}
        />
      </div>
    </div>
  )
}