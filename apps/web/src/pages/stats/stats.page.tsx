import { useQuery } from '@tanstack/react-query'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Activity, BatteryCharging, CarFront, Euro, Gauge, Leaf } from 'lucide-react'
import { statsApi } from '@/features/vehicle/api'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { CardSkeleton } from '@/components/ui/skeleton'

export function StatsPage() {
  const { data: summary, isLoading } = useQuery({
    queryKey: ['stats', 'summary', 30],
    queryFn: () => statsApi.summary(30),
    staleTime: 300_000,
  })

  const { data: battery } = useQuery({
    queryKey: ['stats', 'battery', 30],
    queryFn: () => statsApi.battery(30),
    staleTime: 300_000,
  })

  const { data: efficiency } = useQuery({
    queryKey: ['stats', 'efficiency', 30],
    queryFn: () => statsApi.efficiency(30),
    staleTime: 300_000,
  })

  const { data: batteryHealth } = useQuery({
    queryKey: ['stats', 'battery-health', 180],
    queryFn: () => statsApi.batteryHealth(180),
    staleTime: 300_000,
  })

  const s = summary as Record<string, number> | undefined
  const h = batteryHealth as Record<string, unknown> | undefined
  const batteryTrend = Array.isArray(battery) ? battery : []
  const dailyActivity = Array.isArray(efficiency) ? efficiency : []
  const healthReady = Boolean(h?.['ready'])
  const healthPct = Number(h?.['estimatedHealthPct'] ?? 0)
  const samplesCount = Number(h?.['samplesCount'] ?? 0)
  const hasSummaryActivity = Boolean((s?.['tripsCount'] ?? 0) > 0 || (s?.['chargeSessionsCount'] ?? 0) > 0)
  const hasBatteryTrend = batteryTrend.length > 0
  const hasDailyActivity = dailyActivity.length > 0

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <section className="rounded-2xl border border-border-subtle bg-gradient-to-br from-bg-surface via-bg-surface to-bg-overlay p-5 lg:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl lg:text-3xl font-semibold text-text-primary">Statistiques TeslaMate</h1>
            <p className="mt-1 text-sm text-text-muted">Vision 30 jours sur l usage, la charge et l efficience.</p>
          </div>
          <div className="rounded-xl border border-border-subtle bg-bg-overlay/60 px-3 py-2 text-xs text-text-muted">
            Fenetre active: 30 jours
          </div>
        </div>

        {!isLoading && !hasSummaryActivity && !hasBatteryTrend && (
          <div className="mt-4 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-text-secondary">
            Les statistiques ne sont pas retroactives. Elles se remplissent apres les premiers trajets/recharges synchronises.
          </div>
        )}
      </section>

      {isLoading ? (
        <div className="grid grid-cols-2 xl:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 xl:grid-cols-6 gap-4">
          <MetricCard icon={CarFront} label="Distance" value={`${Math.round(s?.['distanceKm'] ?? 0)} km`} />
          <MetricCard icon={BatteryCharging} label="Energie ajoutee" value={`${s?.['energyAddedKwh']?.toFixed(1) ?? '—'} kWh`} />
          <MetricCard icon={Leaf} label="Energie consommee" value={`${s?.['energyUsedKwh']?.toFixed(1) ?? '—'} kWh`} />
          <MetricCard icon={Euro} label="Cout estime" value={`${s?.['estimatedCostEur']?.toFixed(2) ?? '—'} €`} />
          <MetricCard icon={Gauge} label="Conso moyenne" value={s?.['avgConsumptionKwhPer100km'] ? `${s['avgConsumptionKwhPer100km']} kWh/100` : '—'} />
          <MetricCard icon={Activity} label="Sessions" value={`${s?.['tripsCount'] ?? 0} trajets / ${s?.['chargeSessionsCount'] ?? 0} charges`} />
        </div>
      )}

      <div className="grid xl:grid-cols-3 gap-4 items-stretch">
        <Card className="xl:col-span-2">
          <CardHeader><CardTitle>Evolution batterie</CardTitle></CardHeader>
          <div className="h-72 px-3 pb-4">
            {hasBatteryTrend ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={batteryTrend} margin={{ left: 8, right: 12, top: 8, bottom: 4 }}>
                  <defs>
                    <linearGradient id="battGradDesktop" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#E8112D" stopOpacity={0.32} />
                      <stop offset="100%" stopColor="#E8112D" stopOpacity={0.04} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2A2A2A" vertical={false} />
                  <XAxis dataKey="day" stroke="#8D8D8D" tickLine={false} axisLine={false} />
                  <YAxis domain={[0, 100]} stroke="#8D8D8D" tickLine={false} axisLine={false} width={36} />
                  <Tooltip
                    contentStyle={{ background: '#1B1B1B', border: '1px solid #2A2A2A', borderRadius: 10, color: '#F5F5F5' }}
                    formatter={(v: number) => [`${v}%`, 'Niveau moyen']}
                  />
                  <Area type="monotone" dataKey="avg_level" stroke="#E8112D" fill="url(#battGradDesktop)" strokeWidth={2.25} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChartState message="Le graphe apparait des qu au moins une synchronisation enregistre l etat batterie sur la periode." />
            )}
          </div>
        </Card>

        <Card>
          <CardHeader><CardTitle>Sante batterie</CardTitle></CardHeader>
          <div className="px-6 pb-6">
            {healthReady ? (
              <>
                <p className="text-4xl font-semibold text-text-primary">{healthPct.toFixed(1)}%</p>
                <p className="mt-2 text-xs text-text-muted">Basee sur l evolution de l autonomie estimee a 100% sur 180 jours.</p>
                <div className="mt-4 rounded-lg border border-border-subtle bg-bg-overlay/40 p-3 text-sm text-text-secondary space-y-1">
                  <p>Autonomie actuelle: <span className="text-text-primary">{Number(h?.['currentFullRangeKm'] ?? 0).toFixed(1)} km</span></p>
                  <p>Meilleure autonomie: <span className="text-text-primary">{Number(h?.['bestFullRangeKm'] ?? 0).toFixed(1)} km</span></p>
                  <p>Echantillons: <span className="text-text-primary">{samplesCount}</span></p>
                </div>
              </>
            ) : (
              <>
                <p className="text-lg font-medium text-text-primary">Donnees insuffisantes</p>
                <p className="mt-1 text-xs text-text-muted">Au moins 10 echantillons valides sont necessaires (batterie entre 20% et 95%).</p>
                <p className="mt-2 text-xs text-text-muted">Echantillons actuels: {samplesCount}</p>
              </>
            )}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Activite quotidienne (km / kWh)</CardTitle></CardHeader>
        <div className="h-72 px-3 pb-4">
          {hasDailyActivity ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyActivity} margin={{ left: 8, right: 12, top: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2A2A2A" vertical={false} />
                <XAxis dataKey="day" stroke="#8D8D8D" tickLine={false} axisLine={false} />
                <YAxis stroke="#8D8D8D" tickLine={false} axisLine={false} width={36} />
                <Tooltip contentStyle={{ background: '#1B1B1B', border: '1px solid #2A2A2A', borderRadius: 10, color: '#F5F5F5' }} />
                <Bar dataKey="distance_km" name="km" fill="#E8112D" radius={[4, 4, 0, 0]} />
                <Bar dataKey="charged_kwh" name="kWh" fill="#22c55e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChartState message="L activite apparait apres le premier trajet ou la premiere recharge enregistres sur la periode." />
          )}
        </div>
      </Card>
    </div>
  )
}

function MetricCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Activity
  label: string
  value: string
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-text-muted">
        <Icon size={14} />
        <p className="text-xs uppercase tracking-wide">{label}</p>
      </div>
      <p className="mt-3 text-xl xl:text-2xl font-semibold text-text-primary leading-tight">{value}</p>
    </Card>
  )
}

function EmptyChartState({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center px-6 text-center">
      <p className="max-w-sm text-sm text-text-muted">{message}</p>
    </div>
  )
}
