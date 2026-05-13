import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { settingsApi, statsApi, tripsApi } from '@/features/vehicle/api'
import { api } from '@/lib/api-client'
import { MapContainer, Polyline, TileLayer, CircleMarker } from 'react-leaflet'
import { useLocation, useSearchParams } from 'react-router-dom'
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
  avgSpeed: number | null
  maxSpeed: number | null
  tractionKwh: number
  regenKwh: number
  netKwh: number
  regenSharePct: number | null
  speedBins: SpeedBin[]
}

type EfficiencyScore = {
  score: number
  label: string
  reasons: string[]
}

type HeatSegment = {
  points: LatLonTuple[]
  color: string
}

type LatLonTuple = [number, number]

type TripTab = 'all' | 'work' | 'personal'
type ResolvedTripAddresses = Record<string, { start: string | null; end: string | null }>
type HomeLocation = { lat: number; lon: number; radiusM: number }
type GeofenceLocation = {
  id: number
  name: string
  latitude: number
  longitude: number
  radius: number
}

function textContainsWorkHint(value?: string | null): boolean {
  if (!value) return false
  const v = value.toLowerCase()
  return [
    'work', 'office', 'bureau', 'travail', 'societe', 'entreprise', 'company', 'hq', 'cowork',
  ].some((k) => v.includes(k))
}

function normalizeGeofence(raw: unknown): GeofenceLocation | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const id = parseNumber(row.id)
  const latitude = parseNumber(row.latitude)
  const longitude = parseNumber(row.longitude)
  const radius = parseNumber(row.radius)
  const name = parseString(row.name)
  if (id == null || latitude == null || longitude == null || radius == null || !name) return null
  return {
    id,
    name,
    latitude,
    longitude,
    radius,
  }
}

function isWorkGeofenceName(name: string): boolean {
  const value = name.toLowerCase()
  return ['work', 'office', 'bureau', 'travail', 'company', 'hq', 'cowork'].some((hint) => value.includes(hint))
}

function isPointInsideGeofence(lat: number, lon: number, geofence: GeofenceLocation): boolean {
  return haversineMeters(lat, lon, geofence.latitude, geofence.longitude) <= geofence.radius
}

function isWorkTrip(trip: TripRecord, workGeofences: GeofenceLocation[]): boolean {
  if (textContainsWorkHint(trip.startAddress) || textContainsWorkHint(trip.endAddress) || textContainsWorkHint(trip.notes)) {
    return true
  }

  if (workGeofences.length === 0) return false
  const points: Array<{ lat: number; lon: number }> = []
  if (trip.startLatitude != null && trip.startLongitude != null) {
    points.push({ lat: trip.startLatitude, lon: trip.startLongitude })
  }
  if (trip.endLatitude != null && trip.endLongitude != null) {
    points.push({ lat: trip.endLatitude, lon: trip.endLongitude })
  }

  return points.some((point) => workGeofences.some((geofence) => isPointInsideGeofence(point.lat, point.lon, geofence)))
}

function consumptionWhKm(trip: TripRecord): number | null {
  if (typeof trip.avgConsumptionKwh100 === 'number' && Number.isFinite(trip.avgConsumptionKwh100)) {
    return trip.avgConsumptionKwh100 * 10
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

async function fetchAllTrips() {
  const pageSize = 100
  const maxPages = 50
  let page = 1
  const trips: TripRecord[] = []

  while (page <= maxPages) {
    const response = await tripsApi.list(page, pageSize)
    const pageTrips = normalizeTrips(response)
    trips.push(...pageTrips)
    if (pageTrips.length < pageSize) break
    page += 1
  }

  return trips
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
  const speeds: number[] = []
  let tractionKwh = 0
  let regenKwh = 0

  for (let i = 1; i < timePoints.length; i++) {
    const prev = timePoints[i - 1]
    const curr = timePoints[i]
    if (!prev || !curr) continue
    const dtHours = (curr.at - prev.at) / 3_600_000
    if (dtHours <= 0 || dtHours > 0.5) continue

    const prevPower = prev.power ?? null
    const currPower = curr.power ?? null
    if (prevPower != null || currPower != null) {
      const avgPower = ((prevPower ?? currPower ?? 0) + (currPower ?? prevPower ?? 0)) / 2
      if (avgPower > 0) {
        tractionKwh += avgPower * dtHours
      } else if (avgPower < 0) {
        regenKwh += Math.abs(avgPower) * dtHours
      }
    }

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

  const roundedTraction = Math.round(tractionKwh * 100) / 100
  const roundedRegen = Math.round(regenKwh * 100) / 100
  const netKwh = Math.max(0, roundedTraction - roundedRegen)
  const regenSharePct = roundedTraction > 0
    ? Math.round((roundedRegen / roundedTraction) * 100)
    : null

  return {
    odometerFrom: firstOdo,
    odometerTo: lastOdo,
    avgSpeed,
    maxSpeed,
    tractionKwh: roundedTraction,
    regenKwh: roundedRegen,
    netKwh,
    regenSharePct,
    speedBins,
  }
}

function computeEfficiencyScore(consumptionWhKm: number | null, baselineKwh100: number | null, insights: TripPathInsights | null): EfficiencyScore {
  let score = 75
  const reasons: string[] = []

  if (consumptionWhKm != null && baselineKwh100 != null) {
    const baselineWhKm = baselineKwh100 * 10
    const ratio = consumptionWhKm / Math.max(1, baselineWhKm)

    if (ratio <= 0.9) {
      score += 15
      reasons.push('Conso meilleure que la moyenne 30 jours')
    } else if (ratio <= 1.05) {
      score += 5
      reasons.push('Conso proche de ta moyenne')
    } else if (ratio >= 1.25) {
      score -= 20
      reasons.push('Conso nettement au-dessus de la moyenne')
    } else if (ratio >= 1.1) {
      score -= 10
      reasons.push('Conso un peu élevée vs moyenne')
    }
  }

  if (insights?.regenSharePct != null) {
    if (insights.regenSharePct >= 18) {
      score += 10
      reasons.push('Bonne récupération au freinage')
    } else if (insights.regenSharePct <= 6) {
      score -= 8
      reasons.push('Récupération faible')
    }
  }

  score = Math.max(0, Math.min(100, Math.round(score)))
  const label = score >= 85 ? 'Excellent' : score >= 70 ? 'Bon' : score >= 50 ? 'Moyen' : 'À améliorer'

  return {
    score,
    label,
    reasons: reasons.slice(0, 2),
  }
}

function buildConsumptionHeatSegments(points: TripPathPoint[]): HeatSegment[] {
  if (points.length < 2) return []

  const withGeoTime = points
    .map((p) => ({
      at: p.capturedAt ? new Date(p.capturedAt).getTime() : NaN,
      lat: p.latitude,
      lon: p.longitude,
      power: p.power,
    }))
    .filter((p) => Number.isFinite(p.at) && p.lat != null && p.lon != null)
    .sort((a, b) => a.at - b.at)

  const segments: HeatSegment[] = []
  for (let i = 1; i < withGeoTime.length; i++) {
    const prev = withGeoTime[i - 1]
    const curr = withGeoTime[i]
    if (!prev || !curr) continue

    const dtHours = (curr.at - prev.at) / 3_600_000
    if (dtHours <= 0 || dtHours > 0.5) continue

    const avgPower = ((prev.power ?? curr.power ?? 0) + (curr.power ?? prev.power ?? 0)) / 2
    let color = '#52525b'
    if (avgPower >= 30) color = '#dc2626'
    else if (avgPower >= 16) color = '#f97316'
    else if (avgPower >= 6) color = '#eab308'
    else if (avgPower <= -12) color = '#0ea5e9'
    else if (avgPower <= -4) color = '#22c55e'

    segments.push({
      points: [[prev.lat as number, prev.lon as number], [curr.lat as number, curr.lon as number]],
      color,
    })
  }

  return segments
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

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 6371000 * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)))
}

function compactAddress(address?: string | null) {
  if (!address) return null
  const parts = address
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)

  if (parts.length === 0) return null

  const first = /^\d+$/.test(parts[0] ?? '') && parts[1]
    ? `${parts[0]} ${parts[1]}`
    : parts[0]

  const isNoise = (p: string) =>
    /france|m[ée]tropolitaine|occitanie|[- ]d[ée]partement|haute-garonne|bas-rhin|haut-rhin|gironde|h[ée]rault|bouches/i.test(p)
      || /^[A-ZÀÂÆÇÉÈÊËÎÏÔÙÛÜŒ][a-zàâæçéèêëîïôùûüœ]+[- ][A-ZÀÂÆÇÉÈÊËÎÏÔÙÛÜŒ][a-zàâæçéèêëîïôùûüœ]+$/.test(p) // département nom composé

  const postalIndex = parts.findIndex((p) => /^\d{5}$/.test(p))
  const city = postalIndex > 0
    ? parts.slice(0, postalIndex).reverse().find((p) => !isNoise(p) && p !== first)
    : parts.find((p) => /(^[A-Za-zÀ-ÿ'\- ]+$)/.test(p) && !isNoise(p))

  if (city && city !== first) return `${first}, ${city}`
  return first
}

function formatPointLabel(address?: string | null, lat?: number | null, lon?: number | null, home?: HomeLocation | null) {
  if (home && lat != null && lon != null) {
    const dist = haversineMeters(lat, lon, home.lat, home.lon)
    if (Number.isFinite(dist) && dist <= home.radiusM) return 'Maison'
  }

  if (address) return address
  if (lat != null && lon != null) return `${lat.toFixed(5)}, ${lon.toFixed(5)}`
  return 'Point inconnu'
}

function isMeaningfulTrip(trip: TripRecord, minDistanceKm: number) {
  if (minDistanceKm <= 0) return true
  const distance = trip.distanceKm ?? 0
  return distance >= minDistanceKm
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
  const queryClient = useQueryClient()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const [tab, setTab] = useState<TripTab>('all')
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null)
  const [isHeatmapEnabled, setIsHeatmapEnabled] = useState(true)
  const [addGeofenceModal, setAddGeofenceModal] = useState<{ tripId: string; lat: number; lon: number; defaultName: string } | null>(null)
  const [newGeofenceName, setNewGeofenceName] = useState('')
  const [savedGeofenceTripId, setSavedGeofenceTripId] = useState<string | null>(null)
  const [visibleCount, setVisibleCount] = useState(10)
  const hasHydratedTripFromUrl = useRef(false)

  const { data: settingsData } = useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsApi.get(),
    staleTime: 60_000,
  })

  const heatmapSettingMutation = useMutation({
    mutationFn: (enabled: boolean) => settingsApi.update({ tripHeatmapEnabled: enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
    },
  })

  const { data: geofencesData } = useQuery({
    queryKey: ['geofences'],
    queryFn: async () => api.get('/settings/geofences'),
    staleTime: 60_000,
  })

  const workGeofences = useMemo(() => {
    if (!Array.isArray(geofencesData)) return [] as GeofenceLocation[]
    return geofencesData
      .map(normalizeGeofence)
      .filter((value): value is GeofenceLocation => value != null)
      .filter((geofence) => isWorkGeofenceName(geofence.name))
  }, [geofencesData])

  const createGeofenceMutation = useMutation({
    mutationFn: async ({ name, latitude, longitude }: { name: string; latitude: number; longitude: number }) => {
      await api.post('/settings/geofences', { name: name.trim(), latitude, longitude, radius: 150 })
    },
    onSuccess: () => {
      setSavedGeofenceTripId(addGeofenceModal?.tripId ?? null)
      setAddGeofenceModal(null)
      queryClient.invalidateQueries({ queryKey: ['geofences'] })
    },
  })

  const {
    data,
    isLoading,
    isError: hasTripsError,
    error: tripsError,
    refetch: refetchTrips,
  } = useQuery({
    queryKey: ['trips'],
    queryFn: () => fetchAllTrips(),
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

  const { data: selectedPathData, isFetching: isFetchingPath } = useQuery({
    queryKey: ['trips', selectedTripId, 'path'],
    queryFn: () => tripsApi.path(selectedTripId as string),
    enabled: !!selectedTripId,
  })

  const minTripDistanceKm = useMemo(() => {
    const raw = (settingsData as Record<string, unknown> | undefined)?.['minTripDistanceKm']
    const value = parseNumber(raw)
    return value != null && value >= 0 ? value : 0
  }, [settingsData])

  const initialTripDisplayCount = useMemo(() => {
    const raw = (settingsData as Record<string, unknown> | undefined)?.['tripsInitialDisplayCount']
    const value = parseNumber(raw)
    if (value == null) return 10
    const rounded = Math.round(value)
    return Math.max(1, Math.min(200, rounded))
  }, [settingsData])

  const homeLocation = useMemo(() => {
    const settings = (settingsData ?? {}) as Record<string, unknown>
    const lat = parseNumber(settings.homeLatitude)
    const lon = parseNumber(settings.homeLongitude)
    const radiusM = parseNumber(settings.homeRadiusM)
    if (lat == null || lon == null) return null
    return {
      lat,
      lon,
      radiusM: radiusM != null && radiusM >= 50 ? radiusM : 180,
    }
  }, [settingsData])

  const trips = useMemo(() => {
    return normalizeTrips(data)
      .filter((trip) => isMeaningfulTrip(trip, minTripDistanceKm))
      .sort((a, b) => {
        const aTime = new Date(a.startedAt).getTime()
        const bTime = new Date(b.startedAt).getTime()
        return bTime - aTime
      })
  }, [data, minTripDistanceKm])
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
    if (hasHydratedTripFromUrl.current) return
    const tripFromUrl = searchParams.get('trip')
    if (tripFromUrl) {
      setSelectedTripId(tripFromUrl)
    }
    hasHydratedTripFromUrl.current = true
  }, [searchParams])

  useEffect(() => {
    if (!selectedTripId) {
      if (searchParams.has('trip')) {
        const nextParams = new URLSearchParams(searchParams)
        nextParams.delete('trip')
        setSearchParams(nextParams, { replace: true })
      }
      return
    }

    if (searchParams.get('trip') !== selectedTripId) {
      const nextParams = new URLSearchParams(searchParams)
      nextParams.set('trip', selectedTripId)
      setSearchParams(nextParams, { replace: true })
    }
  }, [searchParams, selectedTripId, setSearchParams])

  useEffect(() => {
    const raw = (settingsData as Record<string, unknown> | undefined)?.['tripHeatmapEnabled']
    if (typeof raw === 'boolean') {
      setIsHeatmapEnabled(raw)
      return
    }
    setIsHeatmapEnabled(true)
  }, [settingsData])

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
    if (tab === 'work') return trips.filter((trip) => isWorkTrip(trip, workGeofences))
    return trips.filter((trip) => !isWorkTrip(trip, workGeofences))
  }, [tab, trips, workGeofences])

  const displayedTrips = useMemo(() => filteredTrips.slice(0, visibleCount), [filteredTrips, visibleCount])

  const activeTrip = useMemo(
    () => filteredTrips.find((trip) => String(trip.id) === selectedTripId) ?? null,
    [filteredTrips, selectedTripId],
  )

  const { data: listResolvedAddresses } = useQuery({
    queryKey: [
      'trips',
      'list-addresses',
      displayedTrips
        .map((trip) => `${trip.id}:${trip.startLatitude ?? ''}:${trip.startLongitude ?? ''}:${trip.endLatitude ?? ''}:${trip.endLongitude ?? ''}`)
        .join('|'),
    ],
    queryFn: async () => {
      const candidates = displayedTrips
      const entries = await Promise.all(candidates.map(async (trip) => {
        const start = trip.startAddress && trip.startAddress.trim().length > 0
          ? trip.startAddress
          : trip.startLatitude != null && trip.startLongitude != null
            ? await reverseGeocode(trip.startLatitude, trip.startLongitude)
            : null
        const end = trip.endAddress && trip.endAddress.trim().length > 0
          ? trip.endAddress
          : trip.endLatitude != null && trip.endLongitude != null
            ? await reverseGeocode(trip.endLatitude, trip.endLongitude)
            : null
        return [String(trip.id), { start, end }] as const
      }))
      return Object.fromEntries(entries) as ResolvedTripAddresses
    },
    enabled: displayedTrips.length > 0,
    staleTime: 30 * 60_000,
  })

  const { data: listPreviewRoutes } = useQuery({
    queryKey: ['trips', 'list-preview-routes', displayedTrips.map((trip) => String(trip.id)).join('|')],
    queryFn: async () => {
      const entries = await Promise.all(displayedTrips.map(async (trip) => {
        const start = trip.startLatitude != null && trip.startLongitude != null
          ? { lat: trip.startLatitude, lon: trip.startLongitude }
          : null
        const end = trip.endLatitude != null && trip.endLongitude != null
          ? { lat: trip.endLatitude, lon: trip.endLongitude }
          : null

        if (!start || !end) {
          return [String(trip.id), [] as LatLonTuple[]] as const
        }

        try {
          const rawPath = await tripsApi.path(String(trip.id))
          const path = normalizePath(rawPath)
          const route = normalizeRoutePoints(start, end, path)
          return [String(trip.id), route] as const
        } catch {
          return [String(trip.id), normalizeRoutePoints(start, end, [])] as const
        }
      }))
      return Object.fromEntries(entries) as Record<string, LatLonTuple[]>
    },
    enabled: displayedTrips.length > 0,
    staleTime: 10 * 60_000,
  })

  useEffect(() => {
    setVisibleCount(initialTripDisplayCount)
  }, [tab, initialTripDisplayCount])

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

  const handleHeatmapToggle = () => {
    const next = !isHeatmapEnabled
    setIsHeatmapEnabled(next)
    heatmapSettingMutation.mutate(next)
  }

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

      {hasTripsError ? (
        <Card className="text-center py-12 text-text-muted">
          Impossible de charger les trajets TeslaMate{tripsError instanceof Error ? `: ${tripsError.message}` : ''}
        </Card>
      ) : isLoading ? (
        <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <CardSkeleton key={i} />)}</div>
      ) : filteredTrips.length === 0 ? (
        <Card className="text-center py-12 text-text-muted">Aucun trajet enregistré</Card>
      ) : (
        <div className="space-y-3">
          {displayedTrips.map((trip) => {
            const tripId = String(trip.id)
            const isSelected = selectedTripId === tripId
            const detailTrip = isSelected && selectedTrip?.id === tripId ? selectedTrip : trip
            const startLabel = formatPointLabel(
              detailTrip.startAddress ?? (isSelected ? (startResolvedAddress ?? null) : null),
              detailTrip.startLatitude,
              detailTrip.startLongitude,
              homeLocation,
            )
            const endLabel = formatPointLabel(
              detailTrip.endAddress ?? (isSelected ? (endResolvedAddress ?? null) : null),
              detailTrip.endLatitude,
              detailTrip.endLongitude,
              homeLocation,
            )
            const detailEnergyKwh = detailTrip.energyUsedKwh ?? null
            const detailConsumptionWhKm = detailTrip.avgConsumptionKwh100 != null
              ? detailTrip.avgConsumptionKwh100 * 10
              : null
            const detailStartCoords = detailTrip.startLatitude != null && detailTrip.startLongitude != null
              ? { lat: detailTrip.startLatitude, lon: detailTrip.startLongitude }
              : null
            const detailEndCoords = detailTrip.endLatitude != null && detailTrip.endLongitude != null
              ? { lat: detailTrip.endLatitude, lon: detailTrip.endLongitude }
              : null
            const fallbackPreviewRoute = detailStartCoords && detailEndCoords
              ? [[detailStartCoords.lat, detailStartCoords.lon], [detailEndCoords.lat, detailEndCoords.lon]] as LatLonTuple[]
              : []
            const previewRoutePoints = isSelected && selectedDisplayedRoutePoints.length > 0
              ? selectedDisplayedRoutePoints
              : (listPreviewRoutes?.[tripId] ?? fallbackPreviewRoute)
            const detailRoutePoints = isSelected ? selectedDisplayedRoutePoints : []
            const pathInsights = isSelected ? buildPathInsights(selectedPath) : null
            const efficiencyScore = isSelected
              ? computeEfficiencyScore(detailConsumptionWhKm, baselineConsumption, pathInsights)
              : null
            const consumptionHeatSegments = isSelected ? buildConsumptionHeatSegments(selectedPath) : []
            const avgSpeedFromTrip = detailTrip != null && (detailTrip.distanceKm ?? 0) > 0 && (detailTrip.durationMin ?? 0) > 0
              ? (detailTrip.distanceKm as number) / ((detailTrip.durationMin as number) / 60)
              : null
            const avgSpeedDisplay = avgSpeedFromTrip ?? pathInsights?.avgSpeed ?? null
            const maxSpeedDisplay = pathInsights?.maxSpeed ?? null
            const canAddGeofence = detailEndCoords != null
            const isGeofenceSaved = savedGeofenceTripId === tripId

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
                        {formatPointLabel(listResolvedAddresses?.[tripId]?.start ?? trip.startAddress, trip.startLatitude, trip.startLongitude, homeLocation)} → {formatPointLabel(listResolvedAddresses?.[tripId]?.end ?? trip.endAddress, trip.endLatitude, trip.endLongitude, homeLocation)}
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
                  <TripRoutePreview
                    start={detailStartCoords}
                    end={detailEndCoords}
                    routePoints={previewRoutePoints}
                    startLabel={startLabel}
                    endLabel={endLabel}
                  />
                  <div className="flex items-center justify-end gap-4 text-xs text-text-muted">
                    <span className="inline-flex items-center gap-1"><Clock size={11} /> {trip.durationMin ? formatDuration(Number(trip.durationMin)) : '—'}</span>
                    <span className="inline-flex items-center gap-1"><Zap size={11} /> {trip.energyUsedKwh != null ? `${trip.energyUsedKwh.toFixed(1)} kWh` : '—'}</span>
                    <button
                      type="button"
                      disabled={!canAddGeofence}
                      onClick={(event) => {
                        event.stopPropagation()
                        if (!detailEndCoords) return
                        setSavedGeofenceTripId(null)
                        setNewGeofenceName('')
                        setAddGeofenceModal({
                          tripId,
                          lat: detailEndCoords.lat,
                          lon: detailEndCoords.lon,
                          defaultName: endLabel,
                        })
                      }}
                      className="inline-flex items-center gap-1 text-accent-400 hover:text-accent-300 disabled:text-text-muted disabled:cursor-not-allowed"
                      title="Ajouter la destination comme lieu enregistré"
                    >
                      <MapPin size={11} />
                      {isGeofenceSaved ? 'Lieu enregistré ✓' : 'Ajouter lieu'}
                    </button>
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
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            setSelectedTripId(null)
                          }}
                          className="text-xs text-text-secondary hover:text-text-primary"
                        >
                          Masquer
                        </button>
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
                      <DetailMetric icon={Zap} label="Énergie" value={detailEnergyKwh != null ? `${Number(detailEnergyKwh).toFixed(1)} kWh` : '—'} />
                      <DetailMetric icon={Gauge} label="Conso" value={detailConsumptionWhKm != null ? `${Math.round(detailConsumptionWhKm)} Wh/km` : '—'} />
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

                    {efficiencyScore && (
                      <div className="rounded-xl border border-border-subtle bg-bg-overlay/55 p-3 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs uppercase tracking-wide text-text-muted">Score efficience trajet</p>
                          <p className="text-sm font-semibold text-text-primary">{efficiencyScore.score}/100 · {efficiencyScore.label}</p>
                        </div>
                        {efficiencyScore.reasons.length > 0 && (
                          <p className="text-xs text-text-muted">{efficiencyScore.reasons.join(' · ')}</p>
                        )}
                      </div>
                    )}

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
                            label="Traction"
                            value={`${pathInsights.tractionKwh.toFixed(1)} kWh`}
                          />
                          <DetailMetric
                            icon={Zap}
                            label="Régénération"
                            value={`${pathInsights.regenKwh.toFixed(1)} kWh`}
                          />
                          <DetailMetric
                            icon={Zap}
                            label="Énergie nette"
                            value={`${pathInsights.netKwh.toFixed(1)} kWh`}
                          />
                          <DetailMetric
                            icon={Gauge}
                            label="Part récup"
                            value={pathInsights.regenSharePct != null ? `${pathInsights.regenSharePct}%` : '—'}
                          />
                        </div>

                        <div className="rounded-xl border border-border-subtle bg-bg-overlay/55 p-3">
                          <p className="text-xs uppercase tracking-wide text-text-muted mb-2">Distribution vitesse</p>
                          {pathInsights.speedBins.reduce((sum, bin) => sum + bin.count, 0) >= 3 ? (
                            <SpeedDistribution bins={pathInsights.speedBins} />
                          ) : (
                            <p className="text-xs text-text-muted">Échantillons vitesse insuffisants pour histogramme fiable.</p>
                          )}
                          <p className="text-xs text-text-muted mt-2">Les statistiques de vitesse sont issues de la télémétrie TeslaMate du trajet sélectionné.</p>
                        </div>
                      </div>
                    )}

                    {detailRoutePoints.length > 0 && detailStartCoords && detailEndCoords && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-xs uppercase tracking-wide text-text-muted">Carte du trajet</p>
                          <button
                            type="button"
                            onClick={handleHeatmapToggle}
                            className="inline-flex items-center gap-2 text-xs text-text-secondary hover:text-text-primary"
                            aria-pressed={isHeatmapEnabled}
                          >
                            <span className={[
                              'relative inline-flex h-5 w-9 items-center rounded-full border transition-colors',
                              isHeatmapEnabled
                                ? 'border-accent-500/60 bg-accent-500/30'
                                : 'border-border-subtle bg-bg-overlay/70',
                            ].join(' ')}>
                              <span
                                className={[
                                  'inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform',
                                  isHeatmapEnabled ? 'translate-x-4' : 'translate-x-1',
                                ].join(' ')}
                              />
                            </span>
                            Heatmap {isHeatmapEnabled ? 'ON' : 'OFF'}
                          </button>
                        </div>
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
                            {isHeatmapEnabled && consumptionHeatSegments.map((segment, idx) => (
                              <Polyline
                                key={`heat-${idx}`}
                                positions={segment.points}
                                pathOptions={{ color: segment.color, weight: 6, opacity: 0.9 }}
                              />
                            ))}
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
                        {isHeatmapEnabled && (
                          <div className="flex flex-wrap gap-3 text-[11px] text-text-muted">
                            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#dc2626]" /> Forte traction</span>
                            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#f97316]" /> Traction moyenne</span>
                            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#eab308]" /> Traction légère</span>
                            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#22c55e]" /> Régénération</span>
                            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#0ea5e9]" /> Régénération forte</span>
                          </div>
                        )}
                        <div className="flex justify-end">
                          <a
                            href={`https://www.google.com/maps/dir/?api=1&origin=${detailStartCoords.lat},${detailStartCoords.lon}&destination=${detailEndCoords.lat},${detailEndCoords.lon}&travelmode=driving`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-accent-400 hover:text-accent-300 inline-flex items-center gap-1 text-xs"
                          >
                            <MapPin size={14} /> Ouvrir l'itinéraire dans Google Maps
                          </a>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </Card>
            )
          })}

          {filteredTrips.length > displayedTrips.length && (
            <div className="flex items-center justify-between px-1 pt-1">
              <p className="text-xs text-text-muted">
                {displayedTrips.length} sur {filteredTrips.length} trajets affichés
              </p>
              <button
                type="button"
                onClick={() => setVisibleCount((count) => Math.min(filteredTrips.length, count + initialTripDisplayCount))}
                className="px-3 py-1.5 rounded-md border border-border-subtle text-text-secondary hover:text-text-primary text-sm"
              >
                Charger plus
              </button>
            </div>
          )}
        </div>
      )}

      {addGeofenceModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setAddGeofenceModal(null)}
        >
          <div
            className="surface-premium rounded-2xl border border-border-subtle w-full max-w-sm p-6 space-y-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <p className="text-xs uppercase tracking-wide text-text-muted">Ajouter un lieu</p>
              <h3 className="text-base font-semibold text-text-primary mt-1">Nommer ce lieu</h3>
              <p className="text-xs text-text-muted mt-1">
                Si le nom contient <span className="text-accent-400">&quot;Travail&quot;</span>, le lieu sera automatiquement reconnu comme destination professionnelle.
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-text-secondary" htmlFor="geofence-name-input">
                Nom du lieu
              </label>
              <input
                id="geofence-name-input"
                type="text"
                autoFocus
                placeholder={addGeofenceModal.defaultName ?? 'Ex: Travail, Client Paris...'}
                value={newGeofenceName}
                onChange={(e) => setNewGeofenceName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newGeofenceName.trim().length > 0 && !createGeofenceMutation.isPending) {
                    createGeofenceMutation.mutate({
                      name: newGeofenceName,
                      latitude: addGeofenceModal.lat,
                      longitude: addGeofenceModal.lon,
                    })
                  }
                  if (e.key === 'Escape') setAddGeofenceModal(null)
                }}
                className="w-full bg-bg-overlay border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-500/60"
              />
              <p className="text-[11px] text-text-muted">
                Coordonnées : {addGeofenceModal.lat.toFixed(5)}, {addGeofenceModal.lon.toFixed(5)} · Rayon 150 m
              </p>
            </div>

            {createGeofenceMutation.isError && (
              <p className="text-xs text-warning">Erreur lors de l&apos;enregistrement. Réessaie.</p>
            )}

            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setAddGeofenceModal(null)}
                className="px-4 py-2 rounded-lg border border-border-subtle text-sm text-text-secondary hover:text-text-primary"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={newGeofenceName.trim().length === 0 || createGeofenceMutation.isPending}
                onClick={() => {
                  createGeofenceMutation.mutate({
                    name: newGeofenceName,
                    latitude: addGeofenceModal.lat,
                    longitude: addGeofenceModal.lon,
                  })
                }}
                className="px-4 py-2 rounded-lg bg-accent-500/20 border border-accent-500/40 text-sm text-accent-400 hover:bg-accent-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {createGeofenceMutation.isPending ? 'Enregistrement...' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

function TripRoutePreview({
  start,
  end,
  routePoints,
  startLabel,
  endLabel,
}: {
  start: { lat: number; lon: number } | null
  end: { lat: number; lon: number } | null
  routePoints: LatLonTuple[]
  startLabel: string
  endLabel: string
}) {
  const hasCoords = !!start && !!end
  const simplified = useMemo(() => {
    if (!Array.isArray(routePoints) || routePoints.length <= 24) return routePoints
    const step = Math.ceil(routePoints.length / 24)
    const sampled: LatLonTuple[] = []
    for (let i = 0; i < routePoints.length; i += step) {
      const point = routePoints[i]
      if (point) sampled.push(point)
    }
    const last = routePoints[routePoints.length - 1]
    if (last && sampled[sampled.length - 1] !== last) sampled.push(last)
    return sampled
  }, [routePoints])

  const previewPath = useMemo(() => {
    if (!simplified || simplified.length < 2) return null

    const lats = simplified.map((p) => p[0])
    const lons = simplified.map((p) => p[1])
    const minLat = Math.min(...lats)
    const maxLat = Math.max(...lats)
    const minLon = Math.min(...lons)
    const maxLon = Math.max(...lons)

    const width = 280
    const height = 38
    const pad = 8
    const drawWidth = width - pad * 2
    const drawHeight = height - pad * 2
    const lonSpan = Math.max(maxLon - minLon, 0.00001)
    const latSpan = Math.max(maxLat - minLat, 0.00001)

    const scaled = simplified.map(([lat, lon]) => {
      const x = pad + ((lon - minLon) / lonSpan) * drawWidth
      const y = pad + (1 - ((lat - minLat) / latSpan)) * drawHeight
      return [x, y] as const
    })

    const path = scaled
      .map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`)
      .join(' ')

    return {
      path,
      start: scaled[0] as readonly [number, number],
      end: scaled[scaled.length - 1] as readonly [number, number],
    }
  }, [simplified])

  return (
    <div className="rounded-lg border border-border-subtle bg-bg-overlay/50 h-24 px-3 py-2">
      {hasCoords ? (
        <div className="h-full flex flex-col justify-between">
          <div className="flex items-center justify-between text-[11px] text-text-muted">
            <span className="truncate max-w-[42%]">{startLabel}</span>
            <span className="truncate max-w-[42%] text-right">{endLabel}</span>
          </div>
          <svg viewBox="0 0 280 38" className="w-full h-10" role="img" aria-label="Aperçu itinéraire">
            {previewPath ? (
              <>
                <path d={previewPath.path} fill="none" stroke="#f97316" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx={previewPath.start[0]} cy={previewPath.start[1]} r="4.5" fill="#16a34a" />
                <circle cx={previewPath.end[0]} cy={previewPath.end[1]} r="4.5" fill="#ef4444" />
              </>
            ) : (
              <>
                <path d="M 18 19 L 262 19" fill="none" stroke="#f97316" strokeWidth="3" strokeLinecap="round" />
                <circle cx="18" cy="19" r="4.5" fill="#16a34a" />
                <circle cx="262" cy="19" r="4.5" fill="#ef4444" />
              </>
            )}
          </svg>
          <p className="text-[11px] text-text-muted">Aperçu simplifié du tracé réel</p>
        </div>
      ) : (
        <div className="h-full flex items-center justify-center text-xs text-text-muted">Coordonnées manquantes pour l'aperçu</div>
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
