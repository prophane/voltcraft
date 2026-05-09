import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useVehicleComposedState } from '@/hooks/use-vehicle-composed-state'
import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { BatteryCharging, Compass, Gauge, Thermometer } from 'lucide-react'
import { statsApi, vehicleApi, type VehicleHistorySnapshot } from '@/features/vehicle/api'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { cn, formatDate, formatKm, formatPercent } from '@/lib/utils'
import {
  formatAge,
  sourceLabelText,
  DiagBadge,
  InfoChip,
  MetricTile,
  EmptyState,
  ViewModeToggle,
  type DiagnosticsViewMode,
  type TelemetrySource,
} from '../diagnostics/diagnostics-shared'

export function VehicleHealthPage() {
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

  const { data: batteryHealthMeasurements } = useQuery({
    queryKey: ['stats', 'battery-health', 'measurements', 180],
    queryFn: () => statsApi.batteryHealthMeasurements(180),
    staleTime: 5 * 60_000,
  })

  const batteryHealthSummary = batteryHealth as {
    ready?: boolean
    samplesCount?: number
    estimatedHealthPct?: number | null
    bestFullRangeKm?: number | null
    currentFullRangeKm?: number | null
  } | undefined

  const historyRows = Array.isArray(history) ? (history as VehicleHistorySnapshot[]) : []
  const recentHistory = historyRows.slice(0, 12).reverse()

  const source: TelemetrySource = state?.isCached ? 'Cache' : vehicle?.isCached ? 'Voltcraft' : 'Unknown'

  const vehicleComposedState = useVehicleComposedState({
    isDriving: state?.isDriving,
    isCharging: state?.isCharging,
    isPluggedIn: state?.isPluggedIn,
    vehicleState: vehicle?.state,
  })
  const vehicleStatus = vehicleComposedState.label

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
      </section>

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
              <h2 className="mt-2 text-xl font-semibold text-text-primary">Estimation basée sur TeslaMate</h2>
            </div>
          </CardHeader>

          {batteryHealth ? (
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
    </div>
  )
}
