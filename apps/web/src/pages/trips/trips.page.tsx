import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { statsApi, tripsApi } from '@/features/vehicle/api'
import { MapContainer, Polyline, TileLayer, CircleMarker } from 'react-leaflet'
import { useLocation } from 'react-router-dom'
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
  power?: number | null
  odometer?: number | null
  batteryLevel?: number | null
}

type SpeedBin = { label: string; count: number; pct: number }

type TripPathInsights = {
  odometerFrom: number | null
  odometerTo: number | null
  consumedKwh: number
  recoveredKwh: number
  avgSpeed: number | null
  maxSpeed: number | null
  speedBins: SpeedBin[]
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

async function fetchRoadRoute(
  start: { lat: number; lon: number },
  end: { lat: number; lon: number },
  waypoint?: { lat: number; lon: number } | null,
): Promise<Array<[number, number]>> {
  const coords = waypoint
    ? `${start.lon},${start.lat};${waypoint.lon},${waypoint.lat};${end.lon},${end.lat}`
    : `${start.lon},${start.lat};${end.lon},${end.lat}`
  const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) return []

  const body = (await res.json()) as {
    routes?: Array<{ geometry?: { coordinates?: number[][] } }>
  }
  const coordinates = body.routes?.[0]?.geometry?.coordinates
  if (!Array.isArray(coordinates)) return []

  return coordinates
    .filter((c) => Array.isArray(c) && c.length >= 2)
    .map((c) => [Number(c[1]), Number(c[0])] as [number, number])
    .filter(([lat, lon]) => Number.isFinite(lat) && Number.isFinite(lon))
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
        power: parseNumber(row.power),
        odometer: parseNumber(row.odometer),
        batteryLevel: parseNumber(row.batteryLevel ?? row.battery_level),
      }
    })
    .filter(Boolean) as TripPathPoint[]
}

function buildPathInsights(points: TripPathPoint[]): TripPathInsights | null {
  if (points.length < 2) return null

  const timePoints = points
    .map((p) => ({
      at: p.capturedAt ? new Date(p.capturedAt).getTime() : NaN,
      speed: p.speed ?? null,
      power: p.power ?? null,
      odometer: p.odometer ?? null,
    }))
    .filter((p) => Number.isFinite(p.at))
    .sort((a, b) => a.at - b.at)

  if (timePoints.length < 2) return null

  let consumedKwh = 0
  let recoveredKwh = 0
  const speeds: number[] = []

  for (let i = 1; i < timePoints.length; i++) {
    const prev = timePoints[i - 1]
    const curr = timePoints[i]
    if (!prev || !curr) continue
    const dtHours = (curr.at - prev.at) / 3_600_000
    if (dtHours <= 0 || dtHours > 0.5) continue

    const pPrev = prev.power ?? 0
    const pCurr = curr.power ?? 0
    const avgPower = (pPrev + pCurr) / 2
    if (avgPower >= 0) consumedKwh += avgPower * dtHours
    else recoveredKwh += Math.abs(avgPower) * dtHours

    if (curr.speed != null && curr.speed >= 0) speeds.push(curr.speed)
  }

  const firstOdo = timePoints.find((p) => p.odometer != null)?.odometer ?? null
  const lastOdo = [...timePoints].reverse().find((p) => p.odometer != null)?.odometer ?? null
  const avgSpeed = speeds.length >= 3 ? speeds.reduce((sum, s) => sum + s, 0) / speeds.length : null
  const maxSpeed = speeds.length >= 3 ? Math.max(...speeds) : null

  const bins = [0, 20, 40, 60, 80, 100, 120, 140]
  const counts = Array.from({ length: bins.length }, () => 0)
  for (const speed of speeds) {
    let idx = bins.findIndex((edge, i) => speed >= edge && (i === bins.length - 1 || speed < bins[i + 1]))
    if (idx < 0) idx = bins.length - 1
    counts[idx] += 1
  }
  const total = counts.reduce((sum, count) => sum + count, 0)
  const speedBins: SpeedBin[] = bins.map((edge, idx) => ({
    label: idx === bins.length - 1 ? `${edge}+` : `${edge}-${bins[idx + 1]}`,
    count: counts[idx],
    pct: total > 0 ? (counts[idx] / total) * 100 : 0,
  }))

  return {
    odometerFrom: firstOdo,
    odometerTo: lastOdo,
    consumedKwh,
    recoveredKwh,
    avgSpeed,
    maxSpeed,
    speedBins,
  }
}

function normalizeRoutePoints(start: { lat: number; lon: number } | null, end: { lat: number; lon: number } | null, path: TripPathPoint[]) {
  const raw = path
    .filter((p) => typeof p.latitude === 'number' && typeof p.longitude === 'number')
    .map((p) => [p.latitude as number, p.longitude as number] as [number, number])

  if (raw.length >= 2) {
    return raw
  }

  if (start && end) {
    return [
      [start.lat, start.lon] as [number, number],
      [end.lat, end.lon] as [number, number],
    ]
  }

  if (start) return [[start.lat, start.lon] as [number, number]]
  if (end) return [[end.lat, end.lon] as [number, number]]
  return []
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
  return distance > 0.3 || energy > 0.1
}

async function reverseGeocode(lat: number, lon: number) {
  const url = new URL('https://nominatim.openstreetmap.org/reverse')
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('lat', String(lat))
  url.searchParams.set('lon', String(lon))
  url.searchParams.set('zoom', '18')
  url.searchParams.set('addressdetails', '1')
  url.searchParams.set('accept-language', 'fr')

  const res = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
  })

  if (!res.ok) return null
  const body = (await res.json()) as { display_name?: string }
  return body.display_name ?? null
}

export function TripsPage() {
  const location = useLocation()
  const [tab, setTab] = useState<TripTab>('all')
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null)

  const {
    data,
    isLoading,
    isError: hasTripsError,
    refetch: refetchTrips,
  } = useQuery({
    queryKey: ['trips'],
    queryFn: () => tripsApi.list(),
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    staleTime: 0,
    placeholderData: (previousData) => previousData,
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

  const selectedStartCoords = selectedTrip?.startLatitude != null && selectedTrip?.startLongitude != null
    ? { lat: selectedTrip.startLatitude, lon: selectedTrip.startLongitude }
    : null
  const selectedEndCoords = selectedTrip?.endLatitude != null && selectedTrip?.endLongitude != null
    ? { lat: selectedTrip.endLatitude, lon: selectedTrip.endLongitude }
    : null
  const selectedTelemetryRoutePoints = useMemo(
    () => normalizeRoutePoints(selectedStartCoords, selectedEndCoords, selectedPath),
    [selectedStartCoords, selectedEndCoords, selectedPath],
  )
  const selectedMidpoint =
    selectedPath.length >= 3
      ? {
          lat: selectedPath[Math.floor(selectedPath.length / 2)]?.latitude ?? null,
          lon: selectedPath[Math.floor(selectedPath.length / 2)]?.longitude ?? null,
        }
      : null

  const { data: selectedRoadRouteData } = useQuery({
    queryKey: [
      'trips',
      selectedTripId,
      'road-route',
      selectedStartCoords?.lat,
      selectedStartCoords?.lon,
      selectedEndCoords?.lat,
      selectedEndCoords?.lon,
      selectedMidpoint?.lat,
      selectedMidpoint?.lon,
      selectedTelemetryRoutePoints.length,
    ],
    queryFn: () => fetchRoadRoute(
      selectedStartCoords as { lat: number; lon: number },
      selectedEndCoords as { lat: number; lon: number },
      selectedMidpoint?.lat != null && selectedMidpoint?.lon != null
        ? { lat: selectedMidpoint.lat, lon: selectedMidpoint.lon }
        : null,
    ),
    enabled:
      !!selectedTripId
      && !!selectedStartCoords
      && !!selectedEndCoords
      && selectedTelemetryRoutePoints.length > 0
      && selectedTelemetryRoutePoints.length < 8,
    staleTime: 10 * 60_000,
  })

  const selectedDisplayedRoutePoints =
    Array.isArray(selectedRoadRouteData) && selectedRoadRouteData.length >= 2
      ? selectedRoadRouteData
      : selectedTelemetryRoutePoints

  useEffect(() => {
    void refetchTrips()
  }, [location.key, refetchTrips])

  useEffect(() => {
    if (!isLoading && !hasTripsError && normalizeTrips(data).length === 0) {
      const timer = setTimeout(() => {
        void refetchTrips()
      }, 1000)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [data, hasTripsError, isLoading, refetchTrips])

  const { data: summary30 } = useQuery({
    queryKey: ['stats', 'summary', 30],
    queryFn: () => statsApi.summary(30),
    staleTime: 300_000,
  })

  const baselineConsumption = useMemo(() => {
    const value = parseNumber((summary30 as Record<string, unknown> | undefined)?.['avgConsumptionKwhPer100km'])
    return value != null && value > 0 ? value : null
  }, [summary30])

  const startCoords = selectedTrip?.startLatitude != null && selectedTrip?.startLongitude != null
    ? { lat: selectedTrip.startLatitude, lon: selectedTrip.startLongitude }
    : null
  const endCoords = selectedTrip?.endLatitude != null && selectedTrip?.endLongitude != null
    ? { lat: selectedTrip.endLatitude, lon: selectedTrip.endLongitude }
    : null

  const { data: startResolvedAddress } = useQuery({
    queryKey: ['trips', selectedTripId, 'start-address'],
    queryFn: () => reverseGeocode(startCoords!.lat, startCoords!.lon),
    enabled: !!selectedTripId && !!startCoords && !(selectedTrip?.startAddress && selectedTrip.startAddress.length > 0),
    staleTime: 10 * 60_000,
  })

  const { data: endResolvedAddress } = useQuery({
    queryKey: ['trips', selectedTripId, 'end-address'],
    queryFn: () => reverseGeocode(endCoords!.lat, endCoords!.lon),
    enabled: !!selectedTripId && !!endCoords && !(selectedTrip?.endAddress && selectedTrip.endAddress.length > 0),
    staleTime: 10 * 60_000,
  })

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
            const startLabel = formatPointLabel(
              detailTrip.startAddress ?? (isSelected ? (startResolvedAddress ?? null) : null),
              detailTrip.startLatitude,
              detailTrip.startLongitude,
            )
            const endLabel = formatPointLabel(
              detailTrip.endAddress ?? (isSelected ? (endResolvedAddress ?? null) : null),
              detailTrip.endLatitude,
              detailTrip.endLongitude,
            )
            const estimatedEnergy = detailTrip.energyUsedKwh
              ?? (baselineConsumption != null && (detailTrip.distanceKm ?? 0) > 0
                ? ((detailTrip.distanceKm ?? 0) * baselineConsumption) / 100
                : null)
            const detailConsumption = consumptionWhKm(detailTrip)
              ?? (baselineConsumption != null ? baselineConsumption * 10 : null)
            const detailStartCoords = detailTrip.startLatitude != null && detailTrip.startLongitude != null
              ? { lat: detailTrip.startLatitude, lon: detailTrip.startLongitude }
              : null
            const detailEndCoords = detailTrip.endLatitude != null && detailTrip.endLongitude != null
              ? { lat: detailTrip.endLatitude, lon: detailTrip.endLongitude }
              : null
            const detailRoutePoints = isSelected ? selectedDisplayedRoutePoints : []
            const pathInsights = isSelected ? buildPathInsights(selectedPath) : null
            const avgSpeedFromTrip = (detailTrip.distanceKm ?? 0) > 0 && (detailTrip.durationMin ?? 0) > 0
              ? (detailTrip.distanceKm as number) / ((detailTrip.durationMin as number) / 60)
              : null
            const avgSpeedDisplay = avgSpeedFromTrip ?? pathInsights?.avgSpeed ?? null
            const maxSpeedDisplay = pathInsights?.maxSpeed ?? null

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
                  <div className="rounded-lg border border-border-subtle bg-bg-overlay/50 h-24 px-3 py-2 flex items-center justify-center text-xs text-text-muted">
                    Itinéraire disponible dans le détail de la carte
                  </div>
                  <div className="flex items-center justify-end gap-4 text-xs text-text-muted">
                    <span className="inline-flex items-center gap-1"><Clock size={11} /> {trip.durationMin ? formatDuration(Number(trip.durationMin)) : '—'}</span>
                    <span className="inline-flex items-center gap-1"><Zap size={11} /> {estimatedEnergy != null ? `${Number(estimatedEnergy).toFixed(1)} kWh` : '—'}</span>
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
                <div
                  className="mt-4 pt-4 border-t border-border-subtle space-y-4"
                  onClick={(event) => event.stopPropagation()}
                >
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
                    <DetailMetric icon={Zap} label="Énergie" value={estimatedEnergy != null ? `${Number(estimatedEnergy).toFixed(1)} kWh` : '—'} />
                    <DetailMetric icon={Gauge} label="Conso" value={detailConsumption != null ? `${Math.round(detailConsumption)} Wh/km` : '—'} />
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

                  {pathInsights && (
                    <div className="space-y-3">
                      <p className="text-xs uppercase tracking-wide text-text-muted">Deep dive conduite</p>
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        <DetailMetric
                          icon={Route}
                          label="Odomètre"
                          value={pathInsights.odometerFrom != null && pathInsights.odometerTo != null
                            ? `${Math.round(pathInsights.odometerFrom)} - ${Math.round(pathInsights.odometerTo)} km`
                            : '—'}
                        />
                        <DetailMetric
                          icon={Gauge}
                          label="Vitesse moy"
                          value={avgSpeedDisplay != null ? `${Math.round(avgSpeedDisplay)} km/h` : '—'}
                        />
                        <DetailMetric
                          icon={Gauge}
                          label="Vitesse max"
                          value={maxSpeedDisplay != null ? `${Math.round(maxSpeedDisplay)} km/h` : '—'}
                        />
                        <DetailMetric
                          icon={Zap}
                          label="Récupération"
                          value={pathInsights.recoveredKwh > 0 ? `${pathInsights.recoveredKwh.toFixed(2)} kWh` : '—'}
                        />
                      </div>

                      <div className="rounded-xl border border-border-subtle bg-bg-overlay/55 p-3">
                        <p className="text-xs uppercase tracking-wide text-text-muted mb-2">Distribution vitesse</p>
                        {pathInsights.speedBins.reduce((sum, bin) => sum + bin.count, 0) >= 3 ? (
                          <SpeedDistribution bins={pathInsights.speedBins} />
                        ) : (
                          <p className="text-xs text-text-muted">Échantillons vitesse insuffisants pour histogramme fiable.</p>
                        )}
                        <p className="text-xs text-text-muted mt-2">
                          Énergie nette consommée: {pathInsights.consumedKwh > 0 ? `${pathInsights.consumedKwh.toFixed(2)} kWh` : '—'}
                        </p>
                      </div>
                    </div>
                  )}

                  {detailRoutePoints.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs uppercase tracking-wide text-text-muted">Carte du trajet</p>
                      <div className="w-full h-64 lg:h-80 rounded-lg border border-border-subtle overflow-hidden">
                        <MapContainer
                          bounds={detailRoutePoints}
                          className="h-full w-full"
                          scrollWheelZoom
                        >
                          <TileLayer
                            attribution='&copy; OpenStreetMap contributors'
                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                          />
                          {detailRoutePoints.length >= 2 && (
                            <Polyline positions={detailRoutePoints} pathOptions={{ color: '#E8112D', weight: 5 }} />
                          )}
                          <CircleMarker
                            center={detailRoutePoints[0] as [number, number]}
                            radius={6}
                            pathOptions={{ color: '#16a34a', fillColor: '#16a34a', fillOpacity: 0.9 }}
                          />
                          <CircleMarker
                            center={detailRoutePoints[detailRoutePoints.length - 1] as [number, number]}
                            radius={6}
                            pathOptions={{ color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.9 }}
                          />
                        </MapContainer>
                      </div>
                      {detailStartCoords && detailEndCoords && (
                        <div className="flex justify-end">
                          <a
                            href={`https://www.google.com/maps/dir/?api=1&origin=${detailStartCoords.lat},${detailStartCoords.lon}&destination=${detailEndCoords.lat},${detailEndCoords.lon}&travelmode=driving`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-accent-400 hover:text-accent-300 inline-flex items-center gap-1 text-xs"
                          >
                            <MapPin size={14} /> Ouvrir l itinéraire dans Google Maps
                          </a>
                        </div>
                      )}
                    </div>
                  )}
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

function SpeedDistribution({ bins }: { bins: SpeedBin[] }) {
  const maxPct = Math.max(...bins.map((b) => b.pct), 1)
  return (
    <div className="grid grid-cols-4 lg:grid-cols-8 gap-2 items-end">
      {bins.map((bin) => (
        <div key={bin.label} className="text-center">
          <div className="h-20 rounded-md border border-border-subtle bg-bg-overlay/60 flex items-end overflow-hidden">
            <div
              className="w-full bg-accent-500/80"
              style={{ height: `${Math.max(8, (bin.pct / maxPct) * 100)}%` }}
              title={`${bin.label}: ${bin.pct.toFixed(1)}%`}
            />
          </div>
          <p className="text-[10px] text-text-muted mt-1">{bin.label}</p>
          <p className="text-[10px] text-text-secondary">{bin.pct.toFixed(0)}%</p>
        </div>
      ))}
    </div>
  )
}
