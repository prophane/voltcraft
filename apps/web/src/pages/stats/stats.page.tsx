import { useQuery } from '@tanstack/react-query'
import { statsApi } from '@/features/vehicle/api'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { CardSkeleton } from '@/components/ui/skeleton'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, CartesianGrid,
} from 'recharts'

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
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-text-primary">Statistiques — 30 jours</h1>

      {!isLoading && !hasSummaryActivity && !hasBatteryTrend && (
        <Card>
          <div className="px-6 py-5">
            <p className="text-sm font-medium text-text-primary">Les statistiques ne sont pas retroactives.</p>
            <p className="mt-1 text-sm text-text-muted">
              Cette page commence a se remplir apres les premiers trajets, recharges et synchronisations enregistres depuis la connexion du vehicule.
            </p>
          </div>
        </Card>
      )}

      {/* KPI grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="Distance" value={`${Math.round(s?.['distanceKm'] ?? 0)} km`} />
          <KpiCard label="Énergie ajoutée" value={`${s?.['energyAddedKwh']?.toFixed(1) ?? '—'} kWh`} />
          <KpiCard label="Coût estimé" value={`${s?.['estimatedCostEur']?.toFixed(2) ?? '—'} €`} />
          <KpiCard label="Consommation moy." value={s?.['avgConsumptionKwhPer100km'] ? `${s['avgConsumptionKwhPer100km']} kWh/100` : '—'} />
        </div>
      )}

      <Card>
        <CardHeader><CardTitle>Santé batterie (estimation)</CardTitle></CardHeader>
        <div className="px-6 pb-6">
          {healthReady ? (
            <>
              <p className="text-3xl font-semibold text-text-primary">{healthPct.toFixed(1)}%</p>
              <p className="text-xs text-text-muted mt-1">
                Basé sur l'évolution de l'autonomie estimée à 100% sur 180 jours.
              </p>
              <p className="text-xs text-text-muted mt-1">
                Plage de référence: {Number(h?.['currentFullRangeKm'] ?? 0).toFixed(1)} km / meilleur {Number(h?.['bestFullRangeKm'] ?? 0).toFixed(1)} km.
              </p>
            </>
          ) : (
            <>
              <p className="text-lg font-medium text-text-primary">Données insuffisantes</p>
              <p className="text-xs text-text-muted mt-1">
                Il faut au moins 10 échantillons valides (niveau batterie entre 20% et 95%).
              </p>
              <p className="text-xs text-text-muted mt-1">
                En pratique, il faut quelques jours d'usage normal avec des synchronisations a differents niveaux de batterie.
              </p>
              <p className="text-xs text-text-muted mt-1">Échantillons actuels: {samplesCount}</p>
            </>
          )}
        </div>
      </Card>

      {/* Battery trend chart */}
      <Card>
        <CardHeader><CardTitle>Évolution batterie</CardTitle></CardHeader>
        <div className="h-52">
          {hasBatteryTrend ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={batteryTrend}>
                <defs>
                  <linearGradient id="battGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#E8112D" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#E8112D" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="day" hide />
                <YAxis domain={[0, 100]} hide />
                <Tooltip
                  contentStyle={{ background: '#1B1B1B', border: '1px solid #2A2A2A', borderRadius: 8, color: '#F5F5F5' }}
                  formatter={(v: number) => [`${v}%`, '']}
                />
                <Area type="monotone" dataKey="avg_level" stroke="#E8112D" fill="url(#battGrad)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChartState message="Le graphe apparait des qu'au moins une synchronisation enregistre l'etat batterie sur la periode." />
          )}
        </div>
      </Card>

      {/* Trips/charges bar chart */}
      <Card>
        <CardHeader><CardTitle>Activité quotidienne</CardTitle></CardHeader>
        <div className="h-52">
          {hasDailyActivity ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyActivity}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2A2A2A" vertical={false} />
                <XAxis dataKey="day" hide />
                <YAxis hide />
                <Tooltip
                  contentStyle={{ background: '#1B1B1B', border: '1px solid #2A2A2A', borderRadius: 8, color: '#F5F5F5' }}
                />
                <Bar dataKey="distance_km" name="km" fill="#E8112D" radius={[3, 3, 0, 0]} />
                <Bar dataKey="charged_kwh" name="kWh" fill="#22c55e" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChartState message="L'activite apparait apres le premier trajet ou la premiere recharge enregistres sur la periode." />
          )}
        </div>
      </Card>
    </div>
  )
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <p className="stat-label">{label}</p>
      <p className="stat-value mt-2">{value}</p>
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
