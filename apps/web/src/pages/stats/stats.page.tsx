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

  const s = summary as Record<string, number> | undefined

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-text-primary">Statistiques — 30 jours</h1>

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

      {/* Battery trend chart */}
      <Card>
        <CardHeader><CardTitle>Évolution batterie</CardTitle></CardHeader>
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={battery as unknown[] ?? []}>
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
        </div>
      </Card>

      {/* Trips/charges bar chart */}
      <Card>
        <CardHeader><CardTitle>Activité quotidienne</CardTitle></CardHeader>
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={efficiency as unknown[] ?? []}>
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
