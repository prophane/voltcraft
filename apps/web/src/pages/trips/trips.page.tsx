import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { tripsApi } from '@/features/vehicle/api'
import { Card } from '@/components/ui/card'
import { CardSkeleton } from '@/components/ui/skeleton'
import { formatDate, formatKm, formatDuration } from '@/lib/utils'
import { Route, Clock, Zap } from 'lucide-react'

type TripRecord = {
  id: string
  startedAt: string
  startAddress?: string | null
  endAddress?: string | null
  distanceKm?: number | null
  durationMin?: number | null
  energyUsedKwh?: number | null
  avgConsumptionKwh100?: number | null
  notes?: string | null
}

type TripTab = 'all' | 'work' | 'personal'

function textContainsWorkHint(value?: string | null): boolean {
  if (!value) return false
  const v = value.toLowerCase()
  return [
    'work', 'office', 'bureau', 'societe', 'entreprise', 'company', 'hq', 'cowork',
  ].some((k) => v.includes(k))
}

function isWorkTrip(trip: TripRecord): boolean {
  return textContainsWorkHint(trip.startAddress) || textContainsWorkHint(trip.endAddress) || textContainsWorkHint(trip.notes)
}

function consumptionWhKm(trip: TripRecord): number | null {
  if (typeof trip.avgConsumptionKwh100 === 'number' && Number.isFinite(trip.avgConsumptionKwh100)) {
    return trip.avgConsumptionKwh100 * 10
  }
  const distance = trip.distanceKm ?? 0
  const energy = trip.energyUsedKwh ?? 0
  if (distance > 0 && energy > 0) {
    return (energy / distance) * 1000
  }
  return null
}

function MiniTripTrace({ seed }: { seed: string }) {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0
  const h = Math.abs(hash)

  const y1 = 36 + (h % 10)
  const y2 = 28 + ((h >> 3) % 14)
  const y3 = 34 + ((h >> 6) % 12)
  const y4 = 30 + ((h >> 9) % 16)
  const y5 = 40 + ((h >> 12) % 10)
  const path = `M 12 ${y1} C 28 ${y2}, 42 ${y3}, 58 ${y2} S 90 ${y4}, 112 ${y5}`

  return (
    <div className="rounded-lg border border-border-subtle bg-bg-overlay/70 h-24 px-2 py-2">
      <svg width="100%" height="100%" viewBox="0 0 124 60" preserveAspectRatio="none">
        <path d={path} fill="none" stroke="#E8112D" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="12" cy={y1} r="3" fill="#E8112D" />
        <circle cx="112" cy={y5} r="3" fill="#E8112D" />
      </svg>
    </div>
  )
}

export function TripsPage() {
  const [tab, setTab] = useState<TripTab>('all')

  const { data, isLoading } = useQuery({
    queryKey: ['trips'],
    queryFn: () => tripsApi.list(),
  })

  const trips = (Array.isArray(data) ? data : []) as TripRecord[]

  const filteredTrips = useMemo(() => {
    if (tab === 'all') return trips
    if (tab === 'work') return trips.filter(isWorkTrip)
    return trips.filter((t) => !isWorkTrip(t))
  }, [tab, trips])

  const summary = useMemo(() => {
    const totalDistance = filteredTrips.reduce((acc, t) => acc + (t.distanceKm ?? 0), 0)
    const totalDuration = filteredTrips.reduce((acc, t) => acc + (t.durationMin ?? 0), 0)
    const totalEnergy = filteredTrips.reduce((acc, t) => acc + (t.energyUsedKwh ?? 0), 0)
    return {
      totalDistance,
      totalDuration,
      totalEnergy,
    }
  }, [filteredTrips])

  return (
    <div className="space-y-6">
      <div className="surface-premium p-4 md:p-5">
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary">Trips</h1>
        <p className="text-sm text-text-muted mt-1">Historique de déplacement et consommation</p>
        <div className="h-px mt-4 accent-line opacity-70" />

        <div className="mt-4 flex gap-2 text-sm">
          {([
            { key: 'all', label: 'All' },
            { key: 'work', label: 'Work' },
            { key: 'personal', label: 'Personal' },
          ] as Array<{ key: TripTab; label: string }>).map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              className={[
                'px-3 py-1.5 rounded-full border transition-colors',
                tab === item.key
                  ? 'border-accent-500/40 bg-accent-500/10 text-accent-400'
                  : 'border-border-subtle text-text-secondary hover:text-text-primary',
              ].join(' ')}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-3 mt-4">
          <div>
            <p className="text-[11px] text-text-muted uppercase">Distance</p>
            <p className="text-lg font-semibold text-text-primary">{Math.round(summary.totalDistance)} km</p>
          </div>
          <div>
            <p className="text-[11px] text-text-muted uppercase">Durée</p>
            <p className="text-lg font-semibold text-text-primary">{formatDuration(Math.round(summary.totalDuration))}</p>
          </div>
          <div>
            <p className="text-[11px] text-text-muted uppercase">Énergie</p>
            <p className="text-lg font-semibold text-text-primary">{summary.totalEnergy > 0 ? `${summary.totalEnergy.toFixed(1)} kWh` : '—'}</p>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <CardSkeleton key={i} />)}</div>
      ) : filteredTrips.length === 0 ? (
        <Card className="text-center py-12 text-text-muted">Aucun trajet enregistré</Card>
      ) : (
        <div className="space-y-3">
          {filteredTrips.map((trip) => (
            <Card key={trip['id'] as string} className="surface-premium hover:border-border transition-colors cursor-pointer">
              <div className="grid grid-cols-1 md:grid-cols-[1.2fr_1fr] gap-3 items-center">
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-bg-overlay border border-border-subtle">
                      <Route size={16} className="text-accent-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-text-primary">
                        {trip['startAddress'] as string || 'Départ inconnu'} → {trip['endAddress'] as string || 'Arrivée inconnue'}
                      </p>
                      <p className="text-xs text-text-muted mt-0.5">{formatDate(trip['startedAt'] as string)}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div>
                      <p className="text-[11px] text-text-muted uppercase">Distance</p>
                      <p className="text-text-secondary">{formatKm((trip['distanceKm'] as number) ?? 0)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-text-muted uppercase">Durée</p>
                      <p className="text-text-secondary">{trip.durationMin ? formatDuration(Number(trip.durationMin)) : '—'}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-text-muted uppercase">Conso</p>
                      <p className="text-text-secondary">{consumptionWhKm(trip) ? `${Math.round(consumptionWhKm(trip) as number)} Wh/km` : '—'}</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <MiniTripTrace seed={trip.id} />
                  <div className="flex items-center justify-end gap-4 text-xs text-text-muted">
                    <span className="inline-flex items-center gap-1"><Clock size={11} /> {trip.durationMin ? formatDuration(Number(trip.durationMin)) : '—'}</span>
                    <span className="inline-flex items-center gap-1"><Zap size={11} /> {trip.energyUsedKwh ? `${Number(trip.energyUsedKwh).toFixed(1)} kWh` : '—'}</span>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
