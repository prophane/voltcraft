import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useVehicleComposedState } from '@/hooks/use-vehicle-composed-state'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { BatteryCharging, Compass, Gauge, Thermometer } from 'lucide-react'
import { statsApi, vehicleApi, settingsApi, type VehicleHistorySnapshot } from '@/features/vehicle/api'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { cn, formatDate, formatKm, formatPercent } from '@/lib/utils'
import {
  ageMinutes,
  formatAge,
  sourceLabelText,
  DiagBadge,
  InfoChip,
  MetricTile,
  EmptyState,
  ModuleDataHealthStrip,
  ViewModeToggle,
  type DiagnosticsViewMode,
  type TelemetrySource,
} from '../diagnostics/diagnostics-shared'

type HealthWindowDays = 90 | 365 | 1095

const HEALTH_WINDOWS: Array<{ value: HealthWindowDays; label: string }> = [
  { value: 90, label: '90j' },
  { value: 365, label: '1 an' },
  { value: 1095, label: '3 ans' },
]

const CORNER_LABELS = { fl: 'Avant gauche', fr: 'Avant droit', rl: 'Arriere gauche', rr: 'Arriere droit' } as const

function normalizeTpmsToBar(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value) || value <= 0) return null
  if (value > 15) return value * 0.0689476
  return value
}

function formatBar(value: number | null | undefined): string {
  return value != null ? `${value.toFixed(2)} bar` : '—'
}

export function VehicleHealthPage() {
  const queryClient = useQueryClient()
  const [viewMode, setViewMode] = useState<DiagnosticsViewMode>('essential')
  const [healthDays, setHealthDays] = useState<HealthWindowDays>(365)

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

  const { data: batteryHealthMeasurements } = useQuery({
    queryKey: ['stats', 'battery-health', 'measurements', 180],
    queryFn: () => statsApi.batteryHealthMeasurements(180),
    staleTime: 5 * 60_000,
  })

  const { data: settingsData } = useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsApi.get(),
    staleTime: 5 * 60_000,
  })

  const { data: degradation } = useQuery({
    queryKey: ['stats', 'health', 'degradation', healthDays],
    queryFn: () => statsApi.batteryDegradation(healthDays),
    staleTime: 10 * 60_000,
  })

  const { data: vampireDrain } = useQuery({
    queryKey: ['stats', 'health', 'vampire-drain', healthDays],
    queryFn: () => statsApi.vampireDrain(healthDays),
    staleTime: 10 * 60_000,
  })

  const { data: chargingProfile } = useQuery({
    queryKey: ['stats', 'health', 'charging-profile', healthDays],
    queryFn: () => statsApi.chargingProfile(healthDays),
    staleTime: 10 * 60_000,
  })

  const { data: efficiencyByTemp } = useQuery({
    queryKey: ['stats', 'health', 'efficiency-temp', healthDays],
    queryFn: () => statsApi.efficiencyByTemperature(healthDays),
    staleTime: 10 * 60_000,
  })

  const { data: tirePressure } = useQuery({
    queryKey: ['stats', 'health', 'tire-pressure', Math.min(healthDays, 365)],
    queryFn: () => statsApi.tirePressure(Math.min(healthDays, 365)),
    staleTime: 10 * 60_000,
  })

  const { data: softwareUpdates } = useQuery({
    queryKey: ['stats', 'health', 'software-updates'],
    queryFn: () => statsApi.softwareUpdates(),
    staleTime: 30 * 60_000,
  })

  const { data: healthSummary } = useQuery({
    queryKey: ['stats', 'health', 'summary', healthDays],
    queryFn: () => statsApi.healthSummary(healthDays),
    staleTime: 10 * 60_000,
  })

  const batteryHealthSummary = batteryHealth as {
    ready?: boolean
    samplesCount?: number
    estimatedHealthPct?: number | null
    bestFullRangeKm?: number | null
    currentFullRangeKm?: number | null
  } | undefined

  const historyRows = useMemo(
    () => (Array.isArray(history) ? (history as VehicleHistorySnapshot[]) : []),
    [history],
  )
  const recentHistory = historyRows.slice(0, 12).reverse()

  const source: TelemetrySource = state?.isCached ? 'TeslaMate' : 'Fleet'

  const forceSyncMutation = useMutation({
    mutationFn: () => vehicleApi.sync(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicle', 'current'] })
      queryClient.invalidateQueries({ queryKey: ['vehicle', 'state'] })
      queryClient.invalidateQueries({ queryKey: ['vehicle', 'history'] })
    },
  })

  const vehicleComposedState = useVehicleComposedState({
    isDriving: state?.isDriving,
    isCharging: state?.isCharging,
    isPluggedIn: state?.isPluggedIn,
    vehicleState: vehicle?.state,
  })
  const vehicleStatus = vehicleComposedState.label
  const stateLastUpdateAt = state?.capturedAt ?? vehicle?.lastSeenAt ?? null
  const stateFreshnessMinutes = ageMinutes(stateLastUpdateAt)
  const vehicleStateSyncMessage = stateFreshnessMinutes != null && stateFreshnessMinutes > 20
    ? 'Etat vehicule ancien: forcer une synchro puis verifier la connectivite TeslaMate/Fleet.'
    : null

  const batteryTrend = useMemo(() => {
    return historyRows
      .slice(0, 72)
      .reverse()
      .map((row) => ({
        time: new Date(row.capturedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        batteryLevel: row.batteryLevel,
        range: row.batteryRange,
      }))
  }, [historyRows])

  const batteryHealthData = useMemo(() => {
    if (!Array.isArray(batteryHealthMeasurements)) return []
    return batteryHealthMeasurements.map((row) => ({
      day: String((row as { day?: string }).day ?? ''),
      est_full_range_km: Number((row as { est_full_range_km?: number }).est_full_range_km ?? 0),
    }))
  }, [batteryHealthMeasurements])

  const tirePressureSeries = useMemo(() => {
    return historyRows
      .slice(0, 96)
      .reverse()
      .map((row) => ({
        at: row.capturedAt,
        fl: normalizeTpmsToBar(row.tpmsPressureFl),
        fr: normalizeTpmsToBar(row.tpmsPressureFr),
        rl: normalizeTpmsToBar(row.tpmsPressureRl),
        rr: normalizeTpmsToBar(row.tpmsPressureRr),
      }))
      .filter((row) => row.fl != null || row.fr != null || row.rl != null || row.rr != null)
  }, [historyRows])

  const tirePressureStats = useMemo(() => {
    const latest = tirePressureSeries[tirePressureSeries.length - 1] ?? null
    const allValues = tirePressureSeries.flatMap((row) => [row.fl, row.fr, row.rl, row.rr]).filter((v): v is number => v != null)
    if (!latest && allValues.length === 0) {
      return {
        latest,
        avg: null,
        min: null,
        max: null,
        spread: null,
      }
    }

    const avg = allValues.length > 0 ? allValues.reduce((sum, v) => sum + v, 0) / allValues.length : null
    const min = allValues.length > 0 ? Math.min(...allValues) : null
    const max = allValues.length > 0 ? Math.max(...allValues) : null
    const latestValues = latest ? [latest.fl, latest.fr, latest.rl, latest.rr].filter((v): v is number => v != null) : []
    const spread = latestValues.length >= 2 ? Math.max(...latestValues) - Math.min(...latestValues) : null

    return { latest, avg, min, max, spread }
  }, [tirePressureSeries])

  const tirePressureTrend = useMemo(() => {
    return tirePressureSeries.map((row) => ({
      time: new Date(row.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      fl: row.fl,
      fr: row.fr,
      rl: row.rl,
      rr: row.rr,
    }))
  }, [tirePressureSeries])

  const tpmsCorrectedTrend = useMemo(() => {
    if (!tirePressure?.series?.length) return []
    return tirePressure.series.map((row) => ({
      day: row.day.slice(5),
      fl: row.corrected.fl,
      fr: row.corrected.fr,
      rl: row.corrected.rl,
      rr: row.corrected.rr,
    }))
  }, [tirePressure])

  const degradationSeries = useMemo(() => {
    return (degradation?.series ?? []).map((point) => ({
      day: point.day,
      fullRangeKm: point.fullRangeKm,
      capacityKwh: point.capacityKwh,
    }))
  }, [degradation])

  const efficiencyTempSeries = useMemo(() => {
    return (efficiencyByTemp?.buckets ?? [])
      .filter((bucket) => bucket.consumptionWhPerKm != null && bucket.distanceKm >= 20)
      .map((bucket) => ({
        label: `${bucket.bucketMinC}°`,
        whPerKm: bucket.consumptionWhPerKm,
        distanceKm: bucket.distanceKm,
      }))
  }, [efficiencyByTemp])

  const chargingMonthly = useMemo(() => {
    return (chargingProfile?.monthly ?? []).map((row) => ({
      month: row.month.slice(2),
      dcKwh: row.dcKwh,
      acKwh: row.acKwh,
    }))
  }, [chargingProfile])

  const drainTone: 'neutral' | 'success' | 'warning' =
    vampireDrain?.status === 'critical' || vampireDrain?.status === 'warning'
      ? 'warning'
      : vampireDrain?.status === 'ok'
        ? 'success'
        : 'neutral'

  const chemistry = (settingsData as Record<string, unknown> | undefined)?.['batteryChemistry'] === 'lfp' ? 'lfp' : 'nca'

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <section className="rounded-3xl border border-border-subtle bg-gradient-to-br from-bg-surface via-bg-surface to-bg-overlay p-5 lg:p-7 shadow-[0_18px_70px_rgba(0,0,0,0.18)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <div>
              <h1 className="text-3xl lg:text-4xl font-semibold tracking-tight text-text-primary">Santé Véhicule</h1>
              <p className="mt-2 text-sm lg:text-base text-text-muted max-w-3xl">
                État de la batterie, températures, position et santé estimée du pack.
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
          </div>
          <ViewModeToggle viewMode={viewMode} onChange={setViewMode} />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="text-xs uppercase tracking-wide text-text-muted">Fenêtre d'analyse</span>
          <div className="inline-flex rounded-md border border-border-subtle overflow-hidden">
            {HEALTH_WINDOWS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setHealthDays(option.value)}
                className={cn(
                  'px-3 py-1 text-xs transition-colors',
                  healthDays === option.value ? 'bg-accent-500/20 text-accent-400' : 'text-text-muted hover:text-text-primary',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          <DiagBadge>{chemistry === 'lfp' ? 'Chimie LFP' : 'Chimie NCA/NCM'}</DiagBadge>
        </div>
      </section>

      <ModuleDataHealthStrip
        moduleLabel="Etat vehicule"
        source={source}
        cached={Boolean(state?.isCached)}
        lastUpdateAt={stateLastUpdateAt}
        warnMinutes={8}
        criticalMinutes={20}
        message={vehicleStateSyncMessage}
        actionLabel={forceSyncMutation.isPending ? 'Sync en cours...' : 'Forcer sync'}
        onAction={() => {
          if (!forceSyncMutation.isPending) {
            forceSyncMutation.mutate()
          }
        }}
      />

      {/* Synthese: score global + alertes actionnables */}
      <Card className="p-5 lg:p-6">
        <CardHeader>
          <div>
            <CardTitle>Synthèse</CardTitle>
            <h2 className="mt-2 text-xl font-semibold text-text-primary">Score de santé global et alertes actionnables</h2>
          </div>
        </CardHeader>
        <div className="flex flex-col lg:flex-row gap-6">
          <div className="flex items-center gap-4">
            <div
              className={cn(
                'flex h-24 w-24 shrink-0 items-center justify-center rounded-full border-4 text-3xl font-semibold',
                healthSummary?.status === 'critical'
                  ? 'border-error/60 text-error'
                  : healthSummary?.status === 'warning'
                    ? 'border-warning/60 text-warning'
                    : healthSummary?.status === 'ok'
                      ? 'border-success/60 text-success'
                      : 'border-border-subtle text-text-muted',
              )}
            >
              {healthSummary?.score != null ? healthSummary.score : '—'}
            </div>
            <div>
              <p className="text-sm text-text-muted">Score global (0-100)</p>
              <p className="mt-1 text-base font-medium text-text-primary">
                {healthSummary?.status === 'ok'
                  ? 'Tout est normal'
                  : healthSummary?.status === 'warning'
                    ? 'Points de vigilance à surveiller'
                    : healthSummary?.status === 'critical'
                      ? 'Action recommandée'
                      : 'Données insuffisantes pour un score fiable'}
              </p>
            </div>
          </div>

          <div className="flex-1 space-y-2">
            {healthSummary && healthSummary.alerts.length > 0 ? (
              healthSummary.alerts.map((alert, index) => (
                <div
                  key={`${alert.severity}-${index}`}
                  className={cn(
                    'rounded-xl border px-3 py-2 text-sm',
                    alert.severity === 'critical'
                      ? 'border-error/30 bg-error/10 text-error'
                      : alert.severity === 'warning'
                        ? 'border-warning/30 bg-warning/10 text-warning'
                        : 'border-border-subtle bg-bg-overlay/50 text-text-secondary',
                  )}
                >
                  {alert.message}
                </div>
              ))
            ) : (
              <EmptyState message="Aucune alerte actionnable détectée sur la période sélectionnée." />
            )}
          </div>
        </div>
      </Card>

      {/* Métriques actuelles */}
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

      {/* Évolution batterie + Santé batterie */}
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
                    <linearGradient id="vhBatteryFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#E8112D" stopOpacity={0.34} />
                      <stop offset="100%" stopColor="#E8112D" stopOpacity={0.04} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2A2A2A" vertical={false} />
                  <XAxis dataKey="time" stroke="#8D8D8D" tickLine={false} axisLine={false} />
                  <YAxis stroke="#8D8D8D" tickLine={false} axisLine={false} width={40} />
                  <Tooltip contentStyle={{ background: '#1B1B1B', border: '1px solid #2A2A2A', borderRadius: 10, color: '#F5F5F5' }} />
                  <Area type="monotone" dataKey="batteryLevel" name="Charge" stroke="#E8112D" fill="url(#vhBatteryFill)" strokeWidth={2.25} dot={false} />
                  <Line type="monotone" dataKey="range" name="Autonomie" stroke="#22c55e" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState message="Aucun échantillon récent n est encore disponible pour dessiner la courbe." />
            )}
          </div>
        </Card>

        <Card className="p-5 lg:p-6">
          <CardHeader>
            <div>
              <CardTitle>Santé batterie</CardTitle>
              <h2 className="mt-2 text-xl font-semibold text-text-primary">
                {degradation?.ready ? 'Dégradation mesurée sur les charges' : 'Estimation basée sur TeslaMate'}
              </h2>
            </div>
          </CardHeader>

          {degradation?.ready ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-border-subtle bg-bg-overlay/60 p-4">
                <p className="text-xs uppercase tracking-wide text-text-muted">Santé estimée</p>
                <p className="mt-2 text-4xl font-semibold text-text-primary">
                  {degradation.healthPct != null ? `${degradation.healthPct.toFixed(1)}%` : '—'}
                </p>
                <p className="mt-2 text-xs text-text-muted">
                  {degradation.degradationPct != null ? `${degradation.degradationPct.toFixed(1)} pts de perte` : 'Perte indisponible'}
                  {' • '}
                  {degradation.samplesCount} jours de mesure
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <InfoChip
                  label="Capacité d'origine"
                  value={degradation.originalCapacityKwh != null ? `${degradation.originalCapacityKwh.toFixed(1)} kWh` : '—'}
                />
                <InfoChip
                  label="Capacité actuelle"
                  value={degradation.currentCapacityKwh != null ? `${degradation.currentCapacityKwh.toFixed(1)} kWh` : '—'}
                />
                <InfoChip
                  label="Autonomie 100% max"
                  value={degradation.bestFullRangeKm != null ? `${degradation.bestFullRangeKm.toFixed(0)} km` : '—'}
                />
                <InfoChip
                  label="Autonomie 100% actuelle"
                  value={degradation.currentFullRangeKm != null ? `${degradation.currentFullRangeKm.toFixed(0)} km` : '—'}
                />
                <InfoChip
                  label="Perte / 10 000 km"
                  value={degradation.lossPer10000Km != null ? `${degradation.lossPer10000Km.toFixed(2)} pts` : 'Recul insuffisant'}
                  tone={degradation.lossPer10000Km != null && degradation.lossPer10000Km > 1.5 ? 'warning' : 'neutral'}
                />
                <InfoChip
                  label="Odomètre"
                  value={degradation.odometerKm != null ? `${Math.round(degradation.odometerKm).toLocaleString('fr-FR')} km` : '—'}
                />
              </div>

              {degradation.projectedKmToWarrantyFloor != null ? (
                <p className="text-xs text-text-muted">
                  Au rythme actuel, le seuil de garantie (70%) serait atteint dans environ{' '}
                  <span className="text-text-primary font-medium">
                    {Math.round(degradation.projectedKmToWarrantyFloor).toLocaleString('fr-FR')} km
                  </span>.
                </p>
              ) : null}

              <div className="rounded-2xl border border-border-subtle bg-bg-overlay/60 p-4">
                <p className="text-xs uppercase tracking-wide text-text-muted mb-3">Autonomie 100% reconstituée</p>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={degradationSeries} margin={{ left: 8, right: 12, top: 8, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2A2A2A" vertical={false} />
                      <XAxis dataKey="day" stroke="#8D8D8D" tickLine={false} axisLine={false} minTickGap={40} />
                      <YAxis stroke="#8D8D8D" tickLine={false} axisLine={false} width={40} domain={['dataMin - 5', 'dataMax + 5']} />
                      <Tooltip
                        contentStyle={{ background: '#1B1B1B', border: '1px solid #2A2A2A', borderRadius: 10, color: '#F5F5F5' }}
                        formatter={(value: unknown) => (typeof value === 'number' ? `${value.toFixed(1)} km` : '—')}
                      />
                      <Line type="monotone" dataKey="fullRangeKm" name="Autonomie 100%" stroke="#7dd3fc" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          ) : batteryHealth ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-border-subtle bg-bg-overlay/60 p-4">
                <p className="text-xs uppercase tracking-wide text-text-muted">Santé estimée</p>
                <p className="mt-2 text-4xl font-semibold text-text-primary">
                  {batteryHealthSummary?.estimatedHealthPct != null ? `${batteryHealthSummary.estimatedHealthPct.toFixed(1)}%` : '—'}
                </p>
                <p className="mt-2 text-xs text-text-muted">
                  {batteryHealthSummary?.ready ? `${batteryHealthSummary.samplesCount ?? 0} échantillons valides` : 'Données encore insuffisantes pour une estimation robuste'}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm text-text-secondary">
                <div className="rounded-2xl border border-border-subtle bg-bg-overlay/60 p-4">
                  <p className="text-xs uppercase tracking-wide text-text-muted">Autonomie max</p>
                  <p className="mt-2 text-lg font-semibold text-text-primary">
                    {batteryHealthSummary?.bestFullRangeKm != null ? `${batteryHealthSummary.bestFullRangeKm.toFixed(1)} km` : '—'}
                  </p>
                </div>
                <div className="rounded-2xl border border-border-subtle bg-bg-overlay/60 p-4">
                  <p className="text-xs uppercase tracking-wide text-text-muted">Autonomie actuelle</p>
                  <p className="mt-2 text-lg font-semibold text-text-primary">
                    {batteryHealthSummary?.currentFullRangeKm != null ? `${batteryHealthSummary.currentFullRangeKm.toFixed(1)} km` : '—'}
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-border-subtle bg-bg-overlay/60 p-4">
                <p className="text-xs uppercase tracking-wide text-text-muted mb-3">Mesures récemment retenues</p>
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

      {/* Perte a l'arret + stress batterie */}
      <div className="grid xl:grid-cols-2 gap-4">
        <Card className="p-5 lg:p-6">
          <CardHeader>
            <div>
              <CardTitle>Perte à l'arrêt (vampire drain)</CardTitle>
              <h2 className="mt-2 text-xl font-semibold text-text-primary">Consommation batterie véhicule stationné</h2>
            </div>
          </CardHeader>

          {vampireDrain?.ready ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <InfoChip
                  label="Médiane"
                  value={vampireDrain.medianPctPerDay != null ? `${vampireDrain.medianPctPerDay.toFixed(2)} %/jour` : '—'}
                  tone={drainTone}
                />
                <InfoChip
                  label="Équivalent énergie"
                  value={vampireDrain.kwhPerDay != null ? `${vampireDrain.kwhPerDay.toFixed(2)} kWh/jour` : '—'}
                />
                <InfoChip
                  label="Pire période"
                  value={vampireDrain.worstPctPerDay != null ? `${vampireDrain.worstPctPerDay.toFixed(2)} %/jour` : '—'}
                />
                <InfoChip label="Périodes analysées" value={String(vampireDrain.sessionsCount)} />
              </div>

              <p className="text-xs text-text-muted">
                Seuil d'alerte configuré : {vampireDrain.thresholdPctPerDay} %/jour.{' '}
                {vampireDrain.status === 'ok'
                  ? 'Comportement normal (veille profonde correcte).'
                  : 'Vérifier Sentry Mode, la précond. programmée et les applications tierces qui réveillent le véhicule.'}
              </p>

              <div className="space-y-2">
                {vampireDrain.sessions.slice(0, 5).map((session) => (
                  <div key={session.parkedFrom} className="rounded-xl border border-border-subtle bg-bg-overlay/50 px-3 py-2 text-xs text-text-secondary">
                    <div className="flex items-center justify-between gap-2">
                      <span>{formatDate(session.parkedFrom)}</span>
                      <span className="text-text-primary font-medium">{session.pctPerDay.toFixed(2)} %/j</span>
                    </div>
                    <p className="mt-1 text-text-muted">
                      {session.hours.toFixed(0)} h à l'arrêt • {session.socFrom}% → {session.socTo}%
                      {session.rangeLostKm != null ? ` • ${session.rangeLostKm.toFixed(0)} km perdus` : ''}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <EmptyState message="Pas encore assez de périodes de stationnement longues sans charge pour estimer la perte à l'arrêt." />
          )}
        </Card>

        <Card className="p-5 lg:p-6">
          <CardHeader>
            <div>
              <CardTitle>Usage et stress batterie</CardTitle>
              <h2 className="mt-2 text-xl font-semibold text-text-primary">Profil de charge sur la période</h2>
            </div>
          </CardHeader>

          {chargingProfile && chargingProfile.sessionsCount > 0 ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <InfoChip
                  label="Part de charge rapide"
                  value={chargingProfile.dcSharePct != null ? `${chargingProfile.dcSharePct.toFixed(1)}%` : '—'}
                  tone={chargingProfile.dcSharePct != null && chargingProfile.dcSharePct > 40 ? 'warning' : 'neutral'}
                />
                <InfoChip
                  label="Cycles équivalents"
                  value={chargingProfile.equivalentCycles != null ? chargingProfile.equivalentCycles.toFixed(1) : '—'}
                />
                <InfoChip label="Sessions DC / AC" value={`${chargingProfile.dcCount} / ${chargingProfile.acCount}`} />
                <InfoChip
                  label="Puissance max vue"
                  value={chargingProfile.maxPowerKw != null ? `${chargingProfile.maxPowerKw} kW` : '—'}
                />
                <InfoChip
                  label={`Charges > ${chargingProfile.maxRecommendedSocPct}%`}
                  value={String(chargingProfile.highSocSessions)}
                  tone={chemistry === 'nca' && chargingProfile.highSocSessions > 0 ? 'warning' : 'neutral'}
                />
                <InfoChip
                  label="Départs sous 10%"
                  value={String(chargingProfile.deepDischargeSessions)}
                  tone={chargingProfile.deepDischargeSessions > 0 ? 'warning' : 'neutral'}
                />
              </div>

              <p className="text-xs text-text-muted">
                {chemistry === 'lfp'
                  ? 'Chimie LFP : une charge à 100% par semaine est recommandée pour recalibrer la jauge.'
                  : `Chimie NCA/NCM : viser ${chargingProfile.maxRecommendedSocPct}% au quotidien et éviter les stationnements prolongés à pleine charge.`}
              </p>

              {chargingMonthly.length > 1 ? (
                <div className="rounded-2xl border border-border-subtle bg-bg-overlay/50 p-3">
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chargingMonthly} margin={{ left: 8, right: 12, top: 8, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#2A2A2A" vertical={false} />
                        <XAxis dataKey="month" stroke="#8D8D8D" tickLine={false} axisLine={false} minTickGap={20} />
                        <YAxis stroke="#8D8D8D" tickLine={false} axisLine={false} width={40} />
                        <Tooltip
                          contentStyle={{ background: '#1B1B1B', border: '1px solid #2A2A2A', borderRadius: 10, color: '#F5F5F5' }}
                          formatter={(value: unknown) => (typeof value === 'number' ? `${value.toFixed(1)} kWh` : '—')}
                        />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="acKwh" name="AC" stackId="energy" fill="#34D399" />
                        <Bar dataKey="dcKwh" name="DC rapide" stackId="energy" fill="#F59E0B" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <EmptyState message="Aucune session de charge sur la période sélectionnée." />
          )}
        </Card>
      </div>

      {/* Efficience vs temperature */}
      <Card className="p-5 lg:p-6">
        <CardHeader>
          <div>
            <CardTitle>Efficience et température</CardTitle>
            <h2 className="mt-2 text-xl font-semibold text-text-primary">Consommation réelle par tranche de température extérieure</h2>
          </div>
        </CardHeader>

        {efficiencyTempSeries.length > 1 ? (
          <div className="space-y-4">
            <div className="grid sm:grid-cols-3 gap-3">
              <InfoChip
                label="Moyenne globale"
                value={efficiencyByTemp?.overallWhPerKm != null ? `${efficiencyByTemp.overallWhPerKm} Wh/km` : '—'}
              />
              <InfoChip
                label="Par temps doux (15-30 °C)"
                value={efficiencyByTemp?.mildWhPerKm != null ? `${efficiencyByTemp.mildWhPerKm} Wh/km` : '—'}
              />
              <InfoChip
                label="Surcoût hivernal (< 5 °C)"
                value={efficiencyByTemp?.winterPenaltyPct != null ? `+${efficiencyByTemp.winterPenaltyPct.toFixed(1)}%` : '—'}
                tone={efficiencyByTemp?.winterPenaltyPct != null && efficiencyByTemp.winterPenaltyPct > 35 ? 'warning' : 'neutral'}
              />
            </div>

            <div className="h-64 rounded-2xl border border-border-subtle bg-bg-overlay/50 p-3">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={efficiencyTempSeries} margin={{ left: 8, right: 12, top: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2A2A2A" vertical={false} />
                  <XAxis dataKey="label" stroke="#8D8D8D" tickLine={false} axisLine={false} />
                  <YAxis stroke="#8D8D8D" tickLine={false} axisLine={false} width={44} />
                  <Tooltip
                    contentStyle={{ background: '#1B1B1B', border: '1px solid #2A2A2A', borderRadius: 10, color: '#F5F5F5' }}
                    formatter={(value: unknown, name: unknown) =>
                      typeof value === 'number' ? (name === 'Distance' ? `${value.toFixed(0)} km` : `${value.toFixed(0)} Wh/km`) : '—'
                    }
                  />
                  <Bar dataKey="whPerKm" name="Consommation" fill="#60A5FA" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs text-text-muted">
              Tranches de 5 °C, trajets de plus de 3 km uniquement. La consommation est reconstruite depuis la perte d'autonomie idéale TeslaMate.
            </p>
          </div>
        ) : (
          <EmptyState message="Pas encore assez de trajets répartis sur différentes températures." />
        )}
      </Card>

      {/* État détaillé */}
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
            <InfoChip label="Frunk" value={state?.isFrunkOpen ? 'Ouvert' : 'Fermé'} tone={state?.isFrunkOpen ? 'warning' : 'success'} />
            <InfoChip label="Trunk" value={state?.isTrunkOpen ? 'Ouvert' : 'Fermé'} tone={state?.isTrunkOpen ? 'warning' : 'success'} />
            <InfoChip label="Climatisation" value={state?.climateOn ? 'Active' : 'Inactive'} tone={state?.climateOn ? 'warning' : 'success'} />
            <InfoChip label="En charge" value={state?.isCharging ? 'Oui' : 'Non'} tone={state?.isCharging ? 'warning' : 'success'} />
          </div>
        </Card>

        {/* Expert: Derniers points */}
        {viewMode === 'expert' && (
          <Card className="p-5 lg:p-6">
            <CardHeader>
              <div>
                <CardTitle>Derniers points</CardTitle>
                <h2 className="mt-2 text-xl font-semibold text-text-primary">Historique local exploitable</h2>
              </div>
            </CardHeader>
            <div className="space-y-3">
              {recentHistory.length > 0 ? (
                recentHistory.map((row) => (
                  <div key={row.id} className="rounded-2xl border border-border-subtle bg-bg-overlay/60 p-4 text-sm text-text-secondary">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium text-text-primary">{formatDate(row.capturedAt)}</p>
                      <DiagBadge tone={row.source === 'WEBHOOK' ? 'text-success border-success/30 bg-success/10' : 'text-text-muted border-border-subtle bg-bg-overlay/70'}>
                        {row.source ?? 'unknown'}
                      </DiagBadge>
                    </div>
                    <p className="mt-2">
                      Charge {formatPercent(Math.round(row.batteryLevel))} • {formatKm(row.batteryRange)} • {row.chargeState}
                    </p>
                    <p className="mt-1 text-xs text-text-muted">
                      {row.isDriving ? 'En mouvement' : 'Stationné'} • {row.isCharging ? 'Charge active' : 'Pas de charge'} • source {sourceLabelText('Voltcraft', Boolean(row.source))}
                    </p>
                  </div>
                ))
              ) : (
                <EmptyState message="Aucun point d historique n a encore été conservé." />
              )}
            </div>
          </Card>
        )}
      </div>

      <Card className="p-5 lg:p-6">
        <CardHeader>
          <div>
            <CardTitle>Suivi pression pneus</CardTitle>
            <h2 className="mt-2 text-xl font-semibold text-text-primary">
              {tirePressure?.latest ? 'Valeurs compensées en température' : 'Derniere mesure et tendance recente'}
            </h2>
          </div>
        </CardHeader>

        {tirePressure?.latest ? (
          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm text-text-secondary">
              {(['fl', 'fr', 'rl', 'rr'] as const).map((corner) => {
                const alert = tirePressure.alerts.find((row) => row.corner === corner)
                const corrected = tirePressure.latest?.corrected[corner] ?? null
                const raw = tirePressure.latest?.raw[corner] ?? null
                return (
                  <InfoChip
                    key={corner}
                    label={CORNER_LABELS[corner]}
                    value={`${formatBar(corrected)}${raw != null ? ` (brut ${raw.toFixed(2)})` : ''}`}
                    tone={alert ? 'warning' : 'success'}
                  />
                )
              })}
            </div>

            <div className="grid sm:grid-cols-3 gap-3 text-sm text-text-secondary">
              <InfoChip label="Cible" value={formatBar(tirePressure.targetBar)} />
              <InfoChip
                label="Ecart entre roues"
                value={tirePressure.spreadBar != null ? `${tirePressure.spreadBar.toFixed(2)} bar` : '—'}
                tone={tirePressure.spreadWarning ? 'warning' : 'success'}
              />
              <InfoChip
                label="Température au relevé"
                value={tirePressure.latest.outsideTempC != null ? `${tirePressure.latest.outsideTempC.toFixed(1)} °C` : '—'}
              />
            </div>

            {tirePressure.leakSuspects.length > 0 ? (
              <div className="rounded-2xl border border-warning/30 bg-warning/10 p-4 text-sm text-text-secondary">
                <p className="font-medium text-text-primary">Perte de pression suspecte</p>
                <ul className="mt-2 space-y-1 text-xs">
                  {tirePressure.leakSuspects.map((row) => (
                    <li key={row.corner}>
                      {CORNER_LABELS[row.corner]} : {row.barPer30Days.toFixed(2)} bar / 30 jours à température constante
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {tpmsCorrectedTrend.length > 1 ? (
              <div className="rounded-2xl border border-border-subtle bg-bg-overlay/50 p-3">
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={tpmsCorrectedTrend} margin={{ left: 8, right: 12, top: 8, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2A2A2A" vertical={false} />
                      <XAxis dataKey="day" stroke="#8D8D8D" tickLine={false} axisLine={false} minTickGap={28} />
                      <YAxis stroke="#8D8D8D" tickLine={false} axisLine={false} width={40} domain={['dataMin - 0.05', 'dataMax + 0.05']} />
                      <Tooltip
                        contentStyle={{ background: '#1B1B1B', border: '1px solid #2A2A2A', borderRadius: 10, color: '#F5F5F5' }}
                        formatter={(value: unknown) => (typeof value === 'number' ? `${value.toFixed(2)} bar` : '—')}
                      />
                      <Line type="monotone" dataKey="fl" name="Avant gauche" stroke="#60A5FA" strokeWidth={2} dot={false} connectNulls />
                      <Line type="monotone" dataKey="fr" name="Avant droit" stroke="#34D399" strokeWidth={2} dot={false} connectNulls />
                      <Line type="monotone" dataKey="rl" name="Arriere gauche" stroke="#F59E0B" strokeWidth={2} dot={false} connectNulls />
                      <Line type="monotone" dataKey="rr" name="Arriere droit" stroke="#F472B6" strokeWidth={2} dot={false} connectNulls />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ) : null}

            <p className="text-xs text-text-muted">
              Relevés ramenés à 20 °C pour neutraliser l'effet thermique (≈ 0,1 bar tous les 10 °C). Dernier jour agrégé : {tirePressure.latest.day}.
            </p>
          </div>
        ) : tirePressureStats.latest ? (
          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm text-text-secondary">
              <InfoChip label="Avant gauche" value={formatBar(tirePressureStats.latest.fl)} />
              <InfoChip label="Avant droit" value={formatBar(tirePressureStats.latest.fr)} />
              <InfoChip label="Arriere gauche" value={formatBar(tirePressureStats.latest.rl)} />
              <InfoChip label="Arriere droit" value={formatBar(tirePressureStats.latest.rr)} />
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm text-text-secondary">
              <InfoChip label="Moyenne 96 pts" value={formatBar(tirePressureStats.avg)} />
              <InfoChip label="Minimum" value={formatBar(tirePressureStats.min)} />
              <InfoChip label="Maximum" value={formatBar(tirePressureStats.max)} />
              <InfoChip label="Ecart actuel" value={tirePressureStats.spread != null ? `${tirePressureStats.spread.toFixed(2)} bar` : '—'} tone={tirePressureStats.spread != null && tirePressureStats.spread > 0.20 ? 'warning' : 'neutral'} />
            </div>

            {tirePressureTrend.length > 1 ? (
              <div className="rounded-2xl border border-border-subtle bg-bg-overlay/50 p-3">
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={tirePressureTrend} margin={{ left: 8, right: 12, top: 8, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2A2A2A" vertical={false} />
                      <XAxis dataKey="time" stroke="#8D8D8D" tickLine={false} axisLine={false} minTickGap={28} />
                      <YAxis stroke="#8D8D8D" tickLine={false} axisLine={false} width={40} domain={["dataMin - 0.05", "dataMax + 0.05"]} />
                      <Tooltip
                        contentStyle={{ background: '#1B1B1B', border: '1px solid #2A2A2A', borderRadius: 10, color: '#F5F5F5' }}
                        formatter={(value: unknown) => (typeof value === 'number' ? `${value.toFixed(2)} bar` : '—')}
                      />
                      <Line type="monotone" dataKey="fl" name="Avant gauche" stroke="#60A5FA" strokeWidth={2} dot={false} connectNulls />
                      <Line type="monotone" dataKey="fr" name="Avant droit" stroke="#34D399" strokeWidth={2} dot={false} connectNulls />
                      <Line type="monotone" dataKey="rl" name="Arriere gauche" stroke="#F59E0B" strokeWidth={2} dot={false} connectNulls />
                      <Line type="monotone" dataKey="rr" name="Arriere droit" stroke="#F472B6" strokeWidth={2} dot={false} connectNulls />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ) : null}

            <p className="text-xs text-text-muted">
              {tirePressureStats.latest.at ? `Dernier echantillon: ${formatDate(tirePressureStats.latest.at)}` : 'Date du dernier echantillon indisponible'}
            </p>
          </div>
        ) : (
          <EmptyState message="Aucune pression pneus disponible pour le moment dans la telemetrie." />
        )}
      </Card>

      <Card className="p-5 lg:p-6">
        <CardHeader>
          <div>
            <CardTitle>Logiciel embarqué</CardTitle>
            <h2 className="mt-2 text-xl font-semibold text-text-primary">Version courante et historique des mises à jour</h2>
          </div>
        </CardHeader>

        {softwareUpdates && softwareUpdates.length > 0 ? (
          <div className="space-y-3">
            <InfoChip
              label="Version installée"
              value={softwareUpdates[0]?.version ?? '—'}
            />
            <div className="space-y-2">
              {softwareUpdates.map((update) => (
                <div key={`${update.version}-${update.startedAt}`} className="flex items-center justify-between gap-3 rounded-xl border border-border-subtle bg-bg-overlay/50 px-3 py-2 text-xs text-text-secondary">
                  <span className="font-medium text-text-primary">{update.version ?? 'Version inconnue'}</span>
                  <span className="text-text-muted">
                    {update.installedAt ? `Installée le ${formatDate(update.installedAt)}` : `Démarrée le ${formatDate(update.startedAt)} (non finalisée)`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <EmptyState message="Aucune mise à jour enregistrée par TeslaMate pour le moment." />
        )}
      </Card>
    </div>
  )
}
