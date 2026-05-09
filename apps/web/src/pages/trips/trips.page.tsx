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

function parseNumber(value: unknown): number | null {
  if (value == null) return null
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function parseString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const v = value.trim()
  return v.length > 0 ? v : null
}

function normalizeTrip(raw: unknown): TripRecord | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const id = parseString(row.id ?? row.tripId)
  const startedAt = parseString(row.startedAt ?? row.started_at)
  if (!id || !startedAt) return null

  return {
    id,
    startedAt,
    endedAt: parseString(row.endedAt ?? row.ended_at),
    startAddress: parseString(row.startAddress ?? row.start_address),
    endAddress: parseString(row.endAddress ?? row.end_address),
    distanceKm: parseNumber(row.distanceKm ?? row.distance_km),
    durationMin: parseNumber(row.durationMin ?? row.duration_min),
    energyUsedKwh: parseNumber(row.energyUsedKwh ?? row.energy_used_kwh),
    avgConsumptionKwh100: parseNumber(row.avgConsumptionKwh100 ?? row.avg_consumption_kwh100),
    notes: parseString(row.notes),
    startLatitude: parseNumber(row.startLatitude ?? row.start_latitude),
    startLongitude: parseNumber(row.startLongitude ?? row.start_longitude),
    endLatitude: parseNumber(row.endLatitude ?? row.end_latitude),
    endLongitude: parseNumber(row.endLongitude ?? row.end_longitude),
    startBatteryLevel: parseNumber(row.startBatteryLevel ?? row.start_battery_level),
    endBatteryLevel: parseNumber(row.endBatteryLevel ?? row.end_battery_level),
  }
}

function normalizeTrips(raw: unknown): TripRecord[] {
  if (Array.isArray(raw)) return raw.map(normalizeTrip).filter(Boolean) as TripRecord[]
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>
    const list = obj.trips ?? obj.items ?? obj.data
    if (Array.isArray(list)) return list.map(normalizeTrip).filter(Boolean) as TripRecord[]
  }
  return []
}

function normalizePath(raw: unknown): TripPathPoint[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const row = item as Record<string, unknown>
      return {
        latitude: parseNumber(row.latitude),
        longitude: parseNumber(row.longitude),
        capturedAt: parseString(row.capturedAt ?? row.captured_at),
        speed: parseNumber(row.speed),
      }
    })
    .filter(Boolean) as TripPathPoint[]
}

function formatPointLabel(address?: string | null, lat?: number | null, lon?: number | null) {
  if (address && address.trim().length > 0) return address
  if (lat != null && lon != null) return `${lat.toFixed(5)}, ${lon.toFixed(5)}`
  return 'Point inconnu'
}

function isMeaningfulTrip(trip: TripRecord) {
  const distance = trip.distanceKm ?? 0
  const duration = trip.durationMin ?? 0
  const energy = trip.energyUsedKwh ?? 0
  return distance > 0.2 || energy > 0.1 || duration >= 5
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

  const { data: selectedTripData, isFetching: isFetchingTrip, isError: hasTripError } = useQuery({
    queryKey: ['trips', selectedTripId],
    queryFn: () => tripsApi.getById(selectedTripId as string),
    enabled: !!selectedTripId,
  })

  const { data: selectedPathData, isFetching: isFetchingPath, isError: hasPathError } = useQuery({
    queryKey: ['trips', selectedTripId, 'path'],
    queryFn: () => tripsApi.path(selectedTripId as string),
    enabled: !!selectedTripId,
  })

  const trips = useMemo(() => normalizeTrips(data).filter(isMeaningfulTrip), [data])
  const selectedTrip = useMemo(() => normalizeTrip(selectedTripData), [selectedTripData])
  const selectedPath = useMemo(() => normalizePath(selectedPathData), [selectedPathData])

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
          {filteredTrips.map((trip) => {
            const tripId = String(trip.id)
            const isSelected = selectedTripId === tripId
            const detailTrip = isSelected && selectedTrip?.id === tripId ? selectedTrip : trip
            const startLabel = formatPointLabel(detailTrip.startAddress, detailTrip.startLatitude, detailTrip.startLongitude)
            const endLabel = formatPointLabel(detailTrip.endAddress, detailTrip.endLatitude, detailTrip.endLongitude)

            return (
            <Card
              key={tripId}
              className="surface-premium hover:border-border transition-colors cursor-pointer"
              onClick={() => setSelectedTripId((prev) => (prev === tripId ? null : tripId))}
            >
              <div className="grid grid-cols-1 md:grid-cols-[1.2fr_1fr] gap-3 items-center">
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-bg-overlay border border-border-subtle">
                      <Route size={16} className="text-accent-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-text-primary">
                        {formatPointLabel(trip.startAddress, trip.startLatitude, trip.startLongitude)} → {formatPointLabel(trip.endAddress, trip.endLatitude, trip.endLongitude)}
                      </p>
                      <p className="text-xs text-text-muted mt-0.5">{formatDate(trip.startedAt)}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div>
                      <p className="text-[11px] text-text-muted uppercase">Distance</p>
                      <p className="text-text-secondary">{formatKm(trip.distanceKm ?? 0)}</p>
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
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        setSelectedTripId((prev) => (prev === tripId ? null : tripId))
                      }}
                      className="inline-flex items-center gap-1 text-accent-400 hover:text-accent-300"
                    >
                      <ChevronRight size={11} /> {isSelected ? 'Masquer' : 'Détail'}
                    </button>
                  </div>
                </div>
              </div>

              {isSelected && (
                <div className="mt-4 pt-4 border-t border-border-subtle space-y-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-text-muted">Détail trajet</p>
                      <h2 className="text-lg font-semibold text-text-primary mt-1">{startLabel} → {endLabel}</h2>
                      <p className="text-xs text-text-muted mt-1">{detailTrip.startedAt ? formatDate(detailTrip.startedAt) : 'Date inconnue'}</p>
                    </div>
                  </div>

                  {(isFetchingTrip || isFetchingPath) && (
                    <p className="text-sm text-text-muted">Chargement des détails...</p>
                  )}

                  {hasTripError && (
                    <p className="text-sm text-warning">Impossible de charger le détail complet du trajet.</p>
                  )}

                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <DetailMetric icon={Route} label="Distance" value={formatKm(detailTrip.distanceKm ?? 0)} />
                    <DetailMetric icon={Clock} label="Durée" value={detailTrip.durationMin ? formatDuration(Math.round(detailTrip.durationMin)) : '—'} />
                    <DetailMetric icon={Zap} label="Énergie" value={detailTrip.energyUsedKwh ? `${Number(detailTrip.energyUsedKwh).toFixed(1)} kWh` : '—'} />
                    <DetailMetric icon={Gauge} label="Conso" value={consumptionWhKm(detailTrip) ? `${Math.round(consumptionWhKm(detailTrip) as number)} Wh/km` : '—'} />
                    <DetailMetric icon={BatteryCharging} label="SOC départ" value={detailTrip.startBatteryLevel != null ? `${Math.round(detailTrip.startBatteryLevel)}%` : '—'} />
                    <DetailMetric icon={BatteryCharging} label="SOC arrivée" value={detailTrip.endBatteryLevel != null ? `${Math.round(detailTrip.endBatteryLevel)}%` : '—'} />
                    <DetailMetric
                      icon={MapPin}
                      label="Coord. départ"
                      value={detailTrip.startLatitude != null && detailTrip.startLongitude != null
                        ? `${detailTrip.startLatitude.toFixed(5)}, ${detailTrip.startLongitude.toFixed(5)}`
                        : '—'}
                    />
                    <DetailMetric
                      icon={MapPin}
                      label="Coord. arrivée"
                      value={detailTrip.endLatitude != null && detailTrip.endLongitude != null
                        ? `${detailTrip.endLatitude.toFixed(5)}, ${detailTrip.endLongitude.toFixed(5)}`
                        : '—'}
                    />
                  </div>

                  <div>
                    <p className="text-xs uppercase tracking-wide text-text-muted mb-2">Trace du trajet</p>
                    {hasPathError ? (
                      <p className="text-xs text-warning">Trace indisponible pour ce trajet.</p>
                    ) : (
                      <DetailedTripTrace points={selectedPath} />
                    )}
                  </div>
                </div>
              )}
            </Card>
            )
          })}
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
