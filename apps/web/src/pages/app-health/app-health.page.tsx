import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useVehicleComposedState } from '@/hooks/use-vehicle-composed-state'
import { Activity, AlertTriangle, BellRing, CarFront, Clock3, Cpu, Lock, Shield, Thermometer, Unlock, Zap } from 'lucide-react'
import { diagnosticsApi, settingsApi, statsApi, vehicleApi, type VehicleHistorySnapshot } from '@/features/vehicle/api'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { cn, formatDate, formatKm, formatPercent } from '@/lib/utils'
import {
  ageMinutes,
  formatAge,
  sourceLabelText,
  DiagBadge,
  CompareRow,
  MetricTile,
  EmptyState,
  ViewModeToggle,
  type TelemetrySource,
  type DiagnosticsViewMode,
  type AlertSeverity,
} from '../diagnostics/diagnostics-shared'

export function AppHealthPage() {
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

  const userSettings = userSettingsRaw as Record<string, unknown> | undefined
  const freshnessWarnMin = Math.max(1, Number(userSettings?.diagnosticsFreshnessWarnMin ?? 8))
  const freshnessCriticalMin = Math.max(freshnessWarnMin + 1, Number(userSettings?.diagnosticsFreshnessCriticalMin ?? 20))
  const batteryDeltaWarnPct = Math.max(0.1, Number(userSettings?.diagnosticsBatteryDeltaWarnPct ?? 2))
  const batteryDeltaCriticalPct = Math.max(batteryDeltaWarnPct + 0.1, Number(userSettings?.diagnosticsBatteryDeltaCriticalPct ?? 5))
  const idleWarnHours7d = Math.max(0, Number(userSettings?.diagnosticsIdleWarnHours7d ?? 8))
  const idleCriticalHours7d = Math.max(idleWarnHours7d + 0.1, Number(userSettings?.diagnosticsIdleCriticalHours7d ?? 12))

  const summaryData = summary as {
    distanceKm?: number
    energyUsedKwh?: number
    avgConsumptionKwhPer100km?: number
    tripsCount?: number
    chargeSessionsCount?: number
  } | undefined

  const historyRows = Array.isArray(history) ? (history as VehicleHistorySnapshot[]) : []
  const latestHistory = historyRows[0]
  const lastStateAt = state?.capturedAt ?? vehicle?.lastSeenAt ?? latestHistory?.capturedAt ?? null
  const freshnessMinutes = ageMinutes(lastStateAt)
  const isFresh = freshnessMinutes != null && freshnessMinutes < 6
  const snapshotGapMinutes =
    latestHistory && state
      ? Math.round(Math.abs(new Date(state.capturedAt).getTime() - new Date(latestHistory.capturedAt).getTime()) / 60_000)
      : null
  const batteryDelta =
    latestHistory && state ? Math.abs((state.batteryLevel ?? 0) - (latestHistory.batteryLevel ?? 0)) : null

  const idleData = Array.isArray(idles) ? idles : []
  const idleHours7d = idleData.reduce((sum, row) => sum + Number((row as { durationMin?: number }).durationMin ?? 0), 0) / 60

  const efficiencyData = Array.isArray(efficiency)
    ? efficiency.slice(-14).map((row) => ({
        day: String((row as { day?: string }).day ?? '').slice(5, 10),
        distance_km: Number((row as { distance_km?: number }).distance_km ?? 0),
        consumed_kwh: Number((row as { consumed_kwh?: number }).consumed_kwh ?? 0),
        charged_kwh: Number((row as { charged_kwh?: number }).charged_kwh ?? 0),
        avg_consumption_kwh_100: Number((row as { avg_consumption_kwh_100?: number }).avg_consumption_kwh_100 ?? 0),
      }))
    : []

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

  const vehicleComposedState = useVehicleComposedState({
    isDriving: state?.isDriving,
    isCharging: state?.isCharging,
    isPluggedIn: state?.isPluggedIn,
    vehicleState: vehicle?.state,
  })
  const vehicleStatus = vehicleComposedState.label

  const lockTone =
    state?.isLocked === false ? 'text-warning border-warning/30 bg-warning/10' : 'text-success border-success/30 bg-success/10'

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
      alerts.push({ severity: 'Critique', title: 'Telemetrie trop ancienne', detail: `${freshnessMinutes} min sans mise a jour exploitable.` })
    } else if (freshnessMinutes != null && freshnessMinutes > freshnessWarnMin) {
      alerts.push({ severity: 'A surveiller', title: 'Fraicheur moyenne', detail: `${freshnessMinutes} min depuis la derniere lecture.` })
    }

    if (batteryDelta != null && batteryDelta > batteryDeltaCriticalPct) {
      alerts.push({ severity: 'Critique', title: 'Divergence de batterie', detail: `Ecart de ${batteryDelta.toFixed(1)} points entre snapshots.` })
    } else if (batteryDelta != null && batteryDelta > batteryDeltaWarnPct) {
      alerts.push({ severity: 'A surveiller', title: 'Ecart de batterie notable', detail: `Ecart de ${batteryDelta.toFixed(1)} points a verifier.` })
    }

    if (state?.isPluggedIn && !state?.isCharging) {
      alerts.push({ severity: 'A surveiller', title: 'Vehicule branche sans charge', detail: 'Verifier la programmation, la limite de charge ou le courant disponible.' })
    }

    if (idleHours7d >= idleWarnHours7d) {
      alerts.push({ severity: 'Info', title: 'Temps d arret eleve', detail: `${idleHours7d.toFixed(1)} h d idle sur 7 jours.` })
    }

    if (alerts.length === 0) {
      alerts.push({ severity: 'Info', title: 'Aucune alerte active', detail: 'Les indicateurs principaux sont actuellement coherents.' })
    }

    const rank: Record<AlertSeverity, number> = { Critique: 0, 'A surveiller': 1, Info: 2 }
    return alerts.sort((a, b) => rank[a.severity] - rank[b.severity]).slice(0, 5)
  }, [batteryDelta, batteryDeltaCriticalPct, batteryDeltaWarnPct, freshnessCriticalMin, freshnessMinutes, freshnessWarnMin, idleHours7d, idleWarnHours7d, state?.isCharging, state?.isPluggedIn, teslaConnection?.connected, teslamateSettings?.configured])

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

  const insightHistory7d = useMemo(() => {
    return efficiencyData
      .slice(-7)
      .map((row) => {
        const directAvg = row.avg_consumption_kwh_100 > 0 ? row.avg_consumption_kwh_100 : null
        const fromConsumed = row.distance_km > 0 && row.consumed_kwh > 0 ? (row.consumed_kwh / row.distance_km) * 100 : null
        const kwh100 = directAvg ?? fromConsumed
        const status = kwh100 == null ? 'Faible usage' : kwh100 > 23 ? 'A surveiller' : 'Normal'
        const note = kwh100 == null ? 'Pas assez de distance pour evaluer la conso.' : `${kwh100.toFixed(1)} kWh/100 km`
        return { day: row.day, status, note }
      })
      .reverse()
  }, [efficiencyData])

  const comparisonVerdict =
    !state || !latestHistory
      ? 'Pas assez de donnees pour comparer'
      : snapshotGapMinutes != null && snapshotGapMinutes > 10
        ? 'La donnee locale est plus ancienne que le dernier signal exploitable'
        : batteryDelta != null && batteryDelta > 2
          ? 'La charge visible diverge entre les derniers echantillons'
          : 'Les derniers signaux sont coherents'

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
      {/* Header */}
      <section className="rounded-3xl border border-border-subtle bg-gradient-to-br from-bg-surface via-bg-surface to-bg-overlay p-5 lg:p-7 shadow-[0_18px_70px_rgba(0,0,0,0.18)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <DiagBadge tone={sourceTone}>
                <Cpu size={12} />
                {sourceLabelText(source, Boolean(state?.isCached || vehicle?.isCached))}
              </DiagBadge>
              <DiagBadge tone={isFresh ? 'text-success border-success/30 bg-success/10' : 'text-warning border-warning/30 bg-warning/10'}>
                <Clock3 size={12} />
                {lastStateAt ? `Actualisé il y a ${formatAge(lastStateAt)}` : 'En attente de télémétrie'}
              </DiagBadge>
              <DiagBadge tone={teslaConnection?.connected ? 'text-success border-success/30 bg-success/10' : 'text-warning border-warning/30 bg-warning/10'}>
                <Shield size={12} />
                {teslaConnection?.connected ? 'Tesla API joignable' : teslaConnection?.connected === false ? 'TeslaMate / Tesla API à vérifier' : 'Connexion en cours'}
              </DiagBadge>
            </div>

            <div>
              <h1 className="text-3xl lg:text-4xl font-semibold tracking-tight text-text-primary">Santé App</h1>
              <p className="mt-2 text-sm lg:text-base text-text-muted max-w-3xl">
                Source de données, fraîcheur, connectivité API et score de confiance global.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-sm text-text-secondary">
              <span className="font-medium text-text-primary">{vehicle?.displayName ?? 'Véhicule Tesla'}</span>
              <span>•</span>
              <span>{vehicleStatus}</span>
              <span>•</span>
              <span>{vehicle?.lastSeenAt ? `Vu le ${formatDate(vehicle.lastSeenAt)}` : 'Jamais vu'}</span>
            </div>
          </div>

          <div className="flex flex-col items-end gap-3">
            <ViewModeToggle viewMode={viewMode} onChange={setViewMode} />
            <button
              type="button"
              onClick={exportDiagnosticsCsv}
              className="text-xs rounded-lg border border-border-subtle bg-bg-overlay/60 px-3 py-1.5 text-text-secondary hover:text-text-primary"
            >
              Export CSV
            </button>
          </div>
        </div>
      </section>

      {/* Score santé + Alertes */}
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
              {scoreBreakdown.length > 0
                ? scoreBreakdown.map((factor) => (
                    <p key={`${factor.label}-${factor.reason}`} className="text-xs text-text-muted">
                      {factor.label}: {factor.points} ({factor.reason})
                    </p>
                  ))
                : <p className="text-xs text-text-muted">Aucun malus actif.</p>}
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

      {/* Insights */}
      <Card className="p-5 lg:p-6">
        <CardHeader>
          <div>
            <CardTitle>Insights automatiques</CardTitle>
            <h2 className="mt-2 text-xl font-semibold text-text-primary">Ce qui mérite ton attention</h2>
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

      {/* Historique insights 7j */}
      <Card className="p-5 lg:p-6">
        <CardHeader>
          <div>
            <CardTitle>Historique insights 7 jours</CardTitle>
            <h2 className="mt-2 text-xl font-semibold text-text-primary">Evolution récente</h2>
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

      {/* Source + Mode + Confiance */}
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

      {/* Expert: Comparaison des signaux */}
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
                  Comparaison de la dernière vue exploitée côté backend avec le dernier snapshot local disponible.
                </div>
              </div>
            </div>

            <div className="px-5 lg:px-6">
              <CompareRow
                label="Source"
                left={sourceLabelText(source, Boolean(state?.isCached || vehicle?.isCached))}
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
                    {' '}• {state?.isCharging ? 'en charge' : 'pas en charge'}
                    {' '}• {state?.climateOn ? 'clim active' : 'clim stoppee'}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <DiagBadge tone={lockTone}>
                      {state?.isLocked === false ? <Unlock size={12} /> : <Lock size={12} />}
                      {state?.isLocked === false ? 'Déverrouillé' : 'Verrouillé'}
                    </DiagBadge>
                    <DiagBadge tone={state?.isDriving ? 'text-warning border-warning/30 bg-warning/10' : 'text-success border-success/30 bg-success/10'}>
                      <CarFront size={12} />
                      {state?.isDriving ? 'En mouvement' : 'À l arrêt'}
                    </DiagBadge>
                    <DiagBadge tone={state?.climateOn ? 'text-warning border-warning/30 bg-warning/10' : 'text-text-muted border-border-subtle bg-bg-overlay/70'}>
                      <Thermometer size={12} />
                      {state?.climateOn ? 'Climatisation active' : 'Climatisation inactive'}
                    </DiagBadge>
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

          {/* État TeslaMate */}
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
    </div>
  )
}
