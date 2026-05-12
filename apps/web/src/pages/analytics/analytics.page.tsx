import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { statsApi, vehicleApi, type VehicleHistorySnapshot } from '@/features/vehicle/api'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { cn, formatDate } from '@/lib/utils'
import { EmptyState, ViewModeToggle, type DiagnosticsViewMode } from '../diagnostics/diagnostics-shared'

export function AnalyticsPage() {
  const [viewMode, setViewMode] = useState<DiagnosticsViewMode>('essential')

  const { data: vehicle } = useQuery({
    queryKey: ['vehicle', 'current'],
    queryFn: vehicleApi.getCurrent,
    refetchInterval: 30_000,
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

  const { data: anomalies } = useQuery({
    queryKey: ['stats', 'anomalies', 30],
    queryFn: () => statsApi.anomalies(30),
    staleTime: 5 * 60_000,
  })

  const summaryData = summary as {
    distanceKm?: number
    energyUsedKwh?: number
    avgConsumptionKwhPer100km?: number
    tripsCount?: number
    chargeSessionsCount?: number
  } | undefined

  const historyRows = Array.isArray(history) ? (history as VehicleHistorySnapshot[]) : []

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

  const driveTrend = useMemo(() => {
    const sorted = historyRows.slice(0, 240).slice().reverse()
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
      const power = Number(row.power ?? 0)
      return {
        time,
        speed: Number(row.speed ?? 0),
        powerTraction: power > 0 ? power : null,
        powerRegen: power < 0 ? Math.abs(power) : null,
      }
    })
  }, [historyRows])

  const drivePowerMax = useMemo(() => {
    if (driveTrend.length === 0) return 30
    const maxPower = Math.max(
      ...driveTrend.map((row) => Math.max(Number(row.powerTraction ?? 0), Number(row.powerRegen ?? 0))),
      30,
    )
    return Math.ceil((maxPower * 1.15) / 10) * 10
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

  const stateMix = useMemo(() => {
    const sample = historyRows.slice(0, 120)
    const moving = sample.filter((row) => row.isDriving).length
    const charging = sample.filter((row) => row.isCharging).length
    const parked = Math.max(0, sample.length - moving - charging)
    return [
      { label: 'Stationné', value: parked },
      { label: 'En conduite', value: moving },
      { label: 'En charge', value: charging },
    ]
  }, [historyRows])

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <section className="rounded-3xl border border-border-subtle bg-gradient-to-br from-bg-surface via-bg-surface to-bg-overlay p-5 lg:p-7 shadow-[0_18px_70px_rgba(0,0,0,0.18)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <div>
              <h1 className="text-3xl lg:text-4xl font-semibold tracking-tight text-text-primary">Analyses</h1>
              <p className="mt-2 text-sm lg:text-base text-text-muted max-w-3xl">
                Graphes de conduite, tendances thermiques, activité quotidienne et anomalies de consommation.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm text-text-secondary">
              <span className="font-medium text-text-primary">{vehicle?.displayName ?? 'Véhicule Tesla'}</span>
            </div>
          </div>
          <ViewModeToggle viewMode={viewMode} onChange={setViewMode} />
        </div>
      </section>

      {/* Résumé 30 jours */}
      <div className="grid md:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-border-subtle bg-bg-overlay/60 p-4">
          <p className="text-xs uppercase tracking-wide text-text-muted">Distance 30j</p>
          <p className="mt-2 text-2xl font-semibold text-text-primary">{Math.round(summaryData?.distanceKm ?? 0)} km</p>
        </div>
        <div className="rounded-2xl border border-border-subtle bg-bg-overlay/60 p-4">
          <p className="text-xs uppercase tracking-wide text-text-muted">Conso moyenne</p>
          <p className="mt-2 text-2xl font-semibold text-text-primary">
            {summaryData?.avgConsumptionKwhPer100km != null ? `${summaryData.avgConsumptionKwhPer100km} kWh/100` : '—'}
          </p>
        </div>
        <div className="rounded-2xl border border-border-subtle bg-bg-overlay/60 p-4">
          <p className="text-xs uppercase tracking-wide text-text-muted">Trajets</p>
          <p className="mt-2 text-2xl font-semibold text-text-primary">{summaryData?.tripsCount ?? 0}</p>
        </div>
        <div className="rounded-2xl border border-border-subtle bg-bg-overlay/60 p-4">
          <p className="text-xs uppercase tracking-wide text-text-muted">Charges</p>
          <p className="mt-2 text-2xl font-semibold text-text-primary">{summaryData?.chargeSessionsCount ?? 0}</p>
        </div>
      </div>

      {/* Activité quotidienne */}
      {viewMode === 'expert' && (
        <Card className="p-0 overflow-hidden">
          <div className="p-5 lg:p-6 border-b border-border-subtle">
            <CardTitle>Activité quotidienne</CardTitle>
            <h2 className="mt-2 text-xl font-semibold text-text-primary">Distance et énergie consommée sur 14 jours</h2>
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
                  <Bar dataKey="consumed_kwh" name="kWh consommés" fill="#38bdf8" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState message="L activité quotidienne s affichera après accumulation des trajets et recharges." />
            )}
          </div>
        </Card>
      )}

      {/* Deep dive conduite + Comportement */}
      {viewMode === 'expert' && (
        <div className="grid xl:grid-cols-3 gap-4 items-stretch">
          <Card className="xl:col-span-2 p-0 overflow-hidden">
            <div className="p-5 lg:p-6 border-b border-border-subtle">
              <CardTitle>Deep Dive conduite</CardTitle>
              <h2 className="mt-2 text-xl font-semibold text-text-primary">Vitesse et puissance instantanées</h2>
            </div>
            <div className="h-72 px-3 pb-4 pt-2">
              {driveTrend.length > 0 ? (
                <>
                  <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-text-muted">
                    <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#22c55e]" /> Vitesse (axe gauche, km/h)</span>
                    <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#f59e0b]" /> Traction (axe droit, +kW)</span>
                    <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#38bdf8]" /> Régénération (axe droit, kW récupérés)</span>
                  </div>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={driveTrend} margin={{ left: 8, right: 12, top: 8, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2A2A2A" vertical={false} />
                      <XAxis dataKey="time" stroke="#8D8D8D" tickLine={false} axisLine={false} />
                      <YAxis yAxisId="left" domain={[0, driveSpeedMax]} stroke="#8D8D8D" tickLine={false} axisLine={false} width={40} />
                      <YAxis yAxisId="right" domain={[0, drivePowerMax]} orientation="right" stroke="#8D8D8D" tickLine={false} axisLine={false} width={40} />
                      <Tooltip
                        contentStyle={{ background: '#1B1B1B', border: '1px solid #2A2A2A', borderRadius: 10, color: '#F5F5F5' }}
                        formatter={(value: number | string, name: string) => {
                          const v = Number(value)
                          if (name === 'Vitesse') return [`${Math.round(v)} km/h`, name]
                          if (name === 'Traction') return [`${Math.round(v)} kW`, name]
                          if (name === 'Régénération') return [`${Math.round(v)} kW récupérés`, name]
                          return [String(value), name]
                        }}
                      />
                      <Line yAxisId="left" type="monotone" dataKey="speed" name="Vitesse" stroke="#22c55e" strokeWidth={2} dot={false} />
                      <Line yAxisId="right" type="monotone" dataKey="powerTraction" name="Traction" stroke="#f59e0b" strokeWidth={2} dot={false} connectNulls />
                      <Line yAxisId="right" type="monotone" dataKey="powerRegen" name="Régénération" stroke="#38bdf8" strokeWidth={2} dot={false} connectNulls />
                    </LineChart>
                  </ResponsiveContainer>
                </>
              ) : (
                <EmptyState message="Aucune donnée de conduite récente n est disponible pour tracer cette vue." />
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

      {/* Suivi thermique */}
      {viewMode === 'expert' && (
        <Card className="p-0 overflow-hidden">
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
      )}

      {/* Anomalies de consommation */}
      {viewMode === 'expert' && (
        <Card className="p-0 overflow-hidden">
          <div className="p-5 lg:p-6 border-b border-border-subtle">
            <CardTitle>Anomalies de consommation</CardTitle>
            <h2 className="mt-2 text-xl font-semibold text-text-primary">Trajets avec consommation anormale détectés sur 30 jours</h2>
          </div>
          <div className="p-5 lg:p-6">
            {anomalies ? (
              (() => {
                const anomaliesData = anomalies as {
                  anomalies?: Array<{
                    tripId: string
                    startedAt: string
                    distance: number
                    consumption: number
                    severity: 'high' | 'moderate' | 'low'
                    deviation: number
                    type: 'inefficient' | 'efficient'
                  }>
                  baseline?: { mean: number; stdDev: number; tripCount: number }
                }
                const anomalyList = anomaliesData?.anomalies ?? []
                const baseline = anomaliesData?.baseline

                return (
                  <div className="space-y-4">
                    {baseline && (
                      <div className="grid grid-cols-3 gap-3">
                        <div className="rounded-2xl border border-border-subtle bg-bg-overlay/60 p-3">
                          <p className="text-xs uppercase tracking-wide text-text-muted">Baseline</p>
                          <p className="mt-1 text-lg font-semibold text-text-primary">{baseline.mean.toFixed(1)}</p>
                          <p className="text-xs text-text-muted">kWh/100 km</p>
                        </div>
                        <div className="rounded-2xl border border-border-subtle bg-bg-overlay/60 p-3">
                          <p className="text-xs uppercase tracking-wide text-text-muted">Écart-type</p>
                          <p className="mt-1 text-lg font-semibold text-text-primary">{baseline.stdDev.toFixed(1)}</p>
                          <p className="text-xs text-text-muted">σ (std dev)</p>
                        </div>
                        <div className="rounded-2xl border border-border-subtle bg-bg-overlay/60 p-3">
                          <p className="text-xs uppercase tracking-wide text-text-muted">Trajets valides</p>
                          <p className="mt-1 text-lg font-semibold text-text-primary">{baseline.tripCount}</p>
                          <p className="text-xs text-text-muted">analysés</p>
                        </div>
                      </div>
                    )}

                    {anomalyList.length > 0 ? (
                      <div className="space-y-2">
                        {anomalyList.map((anomaly) => {
                          const severityColor =
                            anomaly.severity === 'high'
                              ? 'border-warning/50 bg-warning/10'
                              : anomaly.severity === 'moderate'
                                ? 'border-accent-500/30 bg-accent-500/10'
                                : 'border-border-subtle bg-bg-overlay/60'
                          const typeLabel = anomaly.type === 'inefficient' ? '⬆ Inefficace' : '⬇ Efficace'

                          return (
                            <div key={anomaly.tripId} className={cn('rounded-xl border p-3', severityColor)}>
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1">
                                  <p className="text-sm font-medium text-text-primary">
                                    {typeLabel} • {anomaly.distance.toFixed(1)} km
                                  </p>
                                  <p className="text-xs text-text-muted mt-0.5">
                                    {new Date(anomaly.startedAt).toLocaleDateString('fr-FR')} à{' '}
                                    {new Date(anomaly.startedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                                  </p>
                                </div>
                                <div className="text-right">
                                  <p className="text-sm font-semibold text-text-primary">{anomaly.consumption.toFixed(1)} kWh/100</p>
                                  <p className="text-xs text-text-muted">{Math.abs(anomaly.deviation).toFixed(2)}σ</p>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <EmptyState message="Aucune anomalie de consommation détectée sur cette période." />
                    )}
                  </div>
                )
              })()
            ) : (
              <EmptyState message="Analyse des anomalies en cours de chargement..." />
            )}
          </div>
        </Card>
      )}
    </div>
  )
}
