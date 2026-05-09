import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { tripsApi } from '@/features/vehicle/api'
import { Card } from '@/components/ui/card'
import { CardSkeleton } from '@/components/ui/skeleton'
import { formatDate, formatKm, formatDuration } from '@/lib/utils'
import { Route, Clock, Zap, MapPin, BatteryCharging, Gauge, ChevronRight } from 'lucide-react'

type TripRecord = {
  id: string
  startedAt: string
  endedAt?: string | null
  startAddress?: string | null
  endAddress?: string | null
  distanceKm?: number | null
  durationMin?: number | null
  energyUsedKwh?: number | null
  avgConsumptionKwh100?: number | null
  notes?: string | null
  startLatitude?: number | null
  startLongitude?: number | null
  endLatitude?: number | null
  endLongitude?: number | null
  startBatteryLevel?: number | null
  endBatteryLevel?: number | null
}

type TripPathPoint = {
  latitude?: number | null
  longitude?: number | null
  capturedAt?: string | null
  speed?: number | null
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

function DetailedTripTrace({ points }: { points: TripPathPoint[] }) {
  const normalized = useMemo(() => {
    const valid = points.filter((p) => typeof p.latitude === 'number' && typeof p.longitude === 'number') as Array<{ latitude: number; longitude: number }>
    if (valid.length < 2) return ''

    const lats = valid.map((p) => p.latitude)
    const lons = valid.map((p) => p.longitude)
    const minLat = Math.min(...lats)
    const maxLat = Math.max(...lats)
    const minLon = Math.min(...lons)
    const maxLon = Math.max(...lons)
    const latSpan = Math.max(0.0001, maxLat - minLat)
    const lonSpan = Math.max(0.0001, maxLon - minLon)

    const path = valid
      .map((p, index) => {
        const x = 8 + ((p.longitude - minLon) / lonSpan) * 108
        const y = 52 - ((p.latitude - minLat) / latSpan) * 44
        return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
      })
      .join(' ')

    return path
  }, [points])

  if (!normalized) {
    return <p className="text-xs text-text-muted">Trace indisponible pour ce trajet.</p>
  }

  return (
    <div className="rounded-xl border border-border-subtle bg-bg-overlay/70 p-3">
      <svg width="100%" height="160" viewBox="0 0 124 60" preserveAspectRatio="none">
        <path d={normalized} fill="none" stroke="#E8112D" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
    </div>
  )
}

export function TripsPage() {
  const [tab, setTab] = useState<TripTab>('all')
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['trips'],
    queryFn: () => tripsApi.list(),
  })

  const { data: selectedTripData, isFetching: isFetchingTrip } = useQuery({
    queryKey: ['trips', selectedTripId],
    queryFn: () => tripsApi.getById(selectedTripId as string),
    enabled: !!selectedTripId,
  })

  const { data: selectedPathData, isFetching: isFetchingPath } = useQuery({
    queryKey: ['trips', selectedTripId, 'path'],
    queryFn: () => tripsApi.path(selectedTripId as string),
    enabled: !!selectedTripId,
  })

  const trips = (Array.isArray(data) ? data : []) as TripRecord[]
  const selectedTrip = selectedTripData as TripRecord | undefined
  const selectedPath = (Array.isArray(selectedPathData) ? selectedPathData : []) as TripPathPoint[]

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
          {selectedTripId && (
            <Card className="surface-premium p-4 md:p-5">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-xs uppercase tracking-wide text-text-muted">Détail trajet</p>
                  <h2 className="text-lg font-semibold text-text-primary mt-1">
                    {selectedTrip?.startAddress ?? 'Départ inconnu'} → {selectedTrip?.endAddress ?? 'Arrivée inconnue'}
                  </h2>
                  <p className="text-xs text-text-muted mt-1">
                    {selectedTrip?.startedAt ? formatDate(selectedTrip.startedAt) : 'Date inconnue'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedTripId(null)}
                  className="text-xs px-3 py-1.5 rounded-lg border border-border-subtle text-text-secondary hover:text-text-primary"
                >
                  Fermer
                </button>
              </div>

              {(isFetchingTrip || isFetchingPath) && (
                <p className="text-sm text-text-muted mt-3">Chargement des détails...</p>
              )}

              {!isFetchingTrip && selectedTrip && (
                <>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
                    <DetailMetric icon={Route} label="Distance" value={formatKm(selectedTrip.distanceKm ?? 0)} />
                    <DetailMetric icon={Clock} label="Durée" value={selectedTrip.durationMin ? formatDuration(Math.round(selectedTrip.durationMin)) : '—'} />
                    <DetailMetric icon={Zap} label="Énergie" value={selectedTrip.energyUsedKwh ? `${Number(selectedTrip.energyUsedKwh).toFixed(1)} kWh` : '—'} />
                    <DetailMetric icon={Gauge} label="Conso" value={consumptionWhKm(selectedTrip) ? `${Math.round(consumptionWhKm(selectedTrip) as number)} Wh/km` : '—'} />
                    <DetailMetric icon={BatteryCharging} label="SOC départ" value={selectedTrip.startBatteryLevel != null ? `${Math.round(selectedTrip.startBatteryLevel)}%` : '—'} />
                    <DetailMetric icon={BatteryCharging} label="SOC arrivée" value={selectedTrip.endBatteryLevel != null ? `${Math.round(selectedTrip.endBatteryLevel)}%` : '—'} />
                    <DetailMetric
                      icon={MapPin}
                      label="Coord. départ"
                      value={selectedTrip.startLatitude != null && selectedTrip.startLongitude != null
                        ? `${selectedTrip.startLatitude.toFixed(5)}, ${selectedTrip.startLongitude.toFixed(5)}`
                        : '—'}
                    />
                    <DetailMetric
                      icon={MapPin}
                      label="Coord. arrivée"
                      value={selectedTrip.endLatitude != null && selectedTrip.endLongitude != null
                        ? `${selectedTrip.endLatitude.toFixed(5)}, ${selectedTrip.endLongitude.toFixed(5)}`
                        : '—'}
                    />
                  </div>

                  <div className="mt-4">
                    <p className="text-xs uppercase tracking-wide text-text-muted mb-2">Trace du trajet</p>
                    <DetailedTripTrace points={selectedPath} />
                  </div>
                </>
              )}
            </Card>
          )}

          {filteredTrips.map((trip) => (
            <Card
              key={trip['id'] as string}
              className="surface-premium hover:border-border transition-colors cursor-pointer"
              onClick={() => setSelectedTripId(String(trip.id))}
            >
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
                    <span className="inline-flex items-center gap-1 text-accent-400"><ChevronRight size={11} /> Détail</span>
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

function DetailMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Route
  label: string
  value: string
}) {
  return (
    <div className="rounded-lg border border-border-subtle bg-bg-overlay/60 p-3">
      <div className="flex items-center gap-2 text-text-muted text-[11px] uppercase">
        <Icon size={12} />
        <span>{label}</span>
      </div>
      <p className="text-sm text-text-primary font-medium mt-2">{value}</p>
    </div>
  )
}
