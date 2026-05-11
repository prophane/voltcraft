import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { vehicleApi, statsApi, settingsApi, tripsApi } from '@/features/vehicle/api'
import { useVehicleComposedState } from '@/hooks/use-vehicle-composed-state'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Lock, Unlock, MapPin, Plus, Minus, RefreshCw } from 'lucide-react'
import { Link } from 'react-router-dom'
import { cn, formatDate } from '@/lib/utils'

interface ReverseGeocodeResponse {
  display_name?: string
}

interface HomeLocation {
  lat: number
  lon: number
  radiusM: number
}

interface LatestTrip {
  id: string
  startedAt: string
  durationMin: number | null
  distanceKm: number | null
  avgConsumptionKwh100: number | null
  startAddress: string | null
  endAddress: string | null
}

function toFiniteNumber(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(parsed) ? parsed : null
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

function formatDurationMin(value: number | null) {
  if (value == null || !Number.isFinite(value) || value < 1) return '—'
  const minutes = Math.round(value)
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours <= 0) return `${minutes} min`
  if (rest === 0) return `${hours} h`
  return `${hours} h ${rest} min`
}

function formatNumberWithSpaces(value: number): string {
  return Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}

function parseLatestTrip(raw: unknown): LatestTrip | null {
  if (Array.isArray(raw)) return parseLatestTrip(raw[0])
  if (!raw || typeof raw !== 'object') return null

  const obj = raw as Record<string, unknown>
  const listCandidate = obj.items ?? obj.trips ?? obj.data
  if (Array.isArray(listCandidate)) return parseLatestTrip(listCandidate[0])

  const id = obj.id == null ? null : String(obj.id)
  const startedAt = obj.startedAt == null ? null : String(obj.startedAt)
  if (!id || !startedAt) return null

  return {
    id,
    startedAt,
    durationMin: toFiniteNumber(obj.durationMin ?? obj.duration_min),
    distanceKm: toFiniteNumber(obj.distanceKm ?? obj.distance_km),
    avgConsumptionKwh100: toFiniteNumber(obj.avgConsumptionKwh100 ?? obj.avg_consumption_kwh100),
    startAddress: obj.startAddress == null ? null : String(obj.startAddress),
    endAddress: obj.endAddress == null ? null : String(obj.endAddress),
  }
}

function ArcGauge({ level, rangeKm, hasData }: { level: number | null; rangeKm: number | null; hasData: boolean }) {
  const radius = 110
  const circumference = Math.PI * radius
  const progress = hasData ? Math.max(0, Math.min(100, level ?? 0)) : 0
  const dash = (progress / 100) * circumference

  return (
    <div className="relative flex justify-center mt-2">
      <svg width="280" height="170" viewBox="0 0 280 170" className="overflow-visible">
        <path
          d={`M 30 140 A ${radius} ${radius} 0 0 1 250 140`}
          fill="none"
          stroke="rgba(255,255,255,0.16)"
          strokeWidth="12"
          strokeLinecap="round"
        />
        <path
          d={`M 30 140 A ${radius} ${radius} 0 0 1 250 140`}
          fill="none"
          stroke="#E8112D"
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
        />
      </svg>

      <div className="absolute top-[58px] text-center min-w-[140px]">
        <p className="text-5xl font-semibold leading-none text-text-primary">
          {hasData ? Math.round(level ?? 0) : '—'}
          <span className="text-2xl align-top">{hasData ? '%' : ''}</span>
        </p>
        <p className="text-2xl text-text-secondary mt-1">{hasData ? `${formatNumberWithSpaces(rangeKm ?? 0)} km` : 'Aucune donnee'}</p>
        <p className="text-sm text-text-muted mt-1">Batterie</p>
      </div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 border-b border-border-subtle last:border-b-0">
      <p className="text-sm text-text-muted">{label}</p>
      <p className="text-base font-medium text-text-primary text-right">{value}</p>
    </div>
  )
}

export function DashboardPage() {
  const [mapZoomLevel, setMapZoomLevel] = useState(16)
  const queryClient = useQueryClient()

  const syncMutation = useMutation({
    mutationFn: () => vehicleApi.sync(),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['vehicle', 'current'] }),
        queryClient.invalidateQueries({ queryKey: ['vehicle', 'state'] }),
        queryClient.invalidateQueries({ queryKey: ['vehicle', 'location'] }),
      ])
    },
  })

  const { data: vehicle } = useQuery({
    queryKey: ['vehicle', 'current'],
    queryFn: vehicleApi.getCurrent,
    refetchInterval: 60_000,
  })

  const { data: state } = useQuery({
    queryKey: ['vehicle', 'state'],
    queryFn: vehicleApi.getState,
    refetchInterval: 60_000,
    enabled: !!vehicle,
  })

  const { data: summary } = useQuery({
    queryKey: ['stats', 'summary', 7],
    queryFn: () => statsApi.summary(7),
    staleTime: 300_000,
  })

  const { data: latestTripRaw } = useQuery({
    queryKey: ['trips', 'latest'],
    queryFn: () => tripsApi.list(1, 1),
    staleTime: 120_000,
  })

  const { data: settingsData } = useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsApi.get(),
    staleTime: 60_000,
  })

  const { data: location } = useQuery({
    queryKey: ['vehicle', 'location'],
    queryFn: vehicleApi.getLocation,
    refetchInterval: 120_000,
    enabled: !!vehicle,
  })

  const { data: locationAddress } = useQuery({
    queryKey: ['vehicle', 'location', 'address', location?.latitude, location?.longitude],
    enabled: !!location,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      if (!location) return null
      const url = new URL('https://nominatim.openstreetmap.org/reverse')
      url.searchParams.set('format', 'jsonv2')
      url.searchParams.set('lat', String(location.latitude))
      url.searchParams.set('lon', String(location.longitude))
      url.searchParams.set('zoom', '18')
      url.searchParams.set('addressdetails', '1')
      url.searchParams.set('accept-language', 'fr')

      const res = await fetch(url.toString(), {
        headers: {
          Accept: 'application/json',
        },
      })

      if (!res.ok) {
        return null
      }

      const body = (await res.json()) as ReverseGeocodeResponse
      return body.display_name ?? null
    },
  })

  const hasTelemetry = Boolean(
    state && (
      typeof state.batteryLevel === 'number'
      || typeof state.batteryRange === 'number'
      || state.capturedAt
    ),
  )

  const friendlyName = useMemo(() => {
    const name = vehicle?.displayName?.trim()
    if (!name) return 'Vehicule Tesla'
    const looksLikeVin = name.length >= 17 && !name.includes(' ')
    return looksLikeVin ? `Tesla ${name.slice(-6)}` : name
  }, [vehicle?.displayName])

  const extendedState = state as (typeof state & {
    chargeLimitSoc?: number | null
    odometer?: number | null
  }) | undefined

  const summaryData = summary as Record<string, unknown> | undefined
  const distanceKm = toFiniteNumber(summaryData?.['distanceKm'])
  const energyUsedKwh = toFiniteNumber(summaryData?.['energyUsedKwh'])
  const avgConsumption7d = toFiniteNumber(summaryData?.['avgConsumptionKwhPer100km'])
  const tripsCount7d = toFiniteNumber(summaryData?.['tripsCount'])
  const batteryRange = toFiniteNumber(state?.batteryRange)
  const batteryLevel = toFiniteNumber(state?.batteryLevel)
  const outsideTemp = toFiniteNumber(state?.outsideTemp)
  const insideTemp = toFiniteNumber(state?.insideTemp)
  const odometer = toFiniteNumber(extendedState?.odometer)
  const latitude = toFiniteNumber(location?.latitude)
  const longitude = toFiniteNumber(location?.longitude)
  const latestTrip = useMemo(() => parseLatestTrip(latestTripRaw), [latestTripRaw])

  const latestTripWhKm = latestTrip?.avgConsumptionKwh100 != null
    ? Math.round(latestTrip.avgConsumptionKwh100 * 10)
    : null

  const homeLocation = useMemo<HomeLocation | null>(() => {
    const settings = (settingsData ?? {}) as Record<string, unknown>
    const lat = toFiniteNumber(settings.homeLatitude)
    const lon = toFiniteNumber(settings.homeLongitude)
    const radiusM = toFiniteNumber(settings.homeRadiusM)
    if (lat == null || lon == null) return null
    return {
      lat,
      lon,
      radiusM: radiusM != null && radiusM >= 50 ? radiusM : 180,
    }
  }, [settingsData])

  const isAtHome = useMemo(() => {
    if (homeLocation == null || latitude == null || longitude == null) return false
    const dist = haversineMeters(latitude, longitude, homeLocation.lat, homeLocation.lon)
    return Number.isFinite(dist) && dist <= homeLocation.radiusM
  }, [homeLocation, latitude, longitude])

  const lockStatus = state?.isLocked == null
    ? 'Etat de serrure inconnu'
    : state.isLocked
      ? 'Verrouillee'
      : 'Deverrouillee'

  const vehicleComposedState = useVehicleComposedState({
    isDriving: state?.isDriving,
    isCharging: state?.isCharging,
    isPluggedIn: state?.isPluggedIn,
    vehicleState: vehicle?.state,
  })

  const statusDetail = vehicleComposedState.label
  const statusLabel = hasTelemetry || vehicle?.state
    ? vehicleComposedState.label
    : 'Aucune donnee pour le moment'

  const mapEmbedUrl = useMemo(() => {
    if (latitude == null || longitude == null) return null
    const lon = longitude
    const lat = latitude
    const safeZoom = Math.max(13, Math.min(18, mapZoomLevel))
    const delta = 0.14 / (2 ** (safeZoom - 10))
    const left = lon - delta
    const right = lon + delta
    const top = lat + delta
    const bottom = lat - delta
    return `https://www.openstreetmap.org/export/embed.html?bbox=${left},${bottom},${right},${top}&layer=mapnik&marker=${lat},${lon}`
  }, [latitude, longitude, mapZoomLevel])

  const mapPreset = useMemo(() => {
    if (mapZoomLevel >= 17) return 'street'
    if (mapZoomLevel <= 14) return 'city'
    return 'district'
  }, [mapZoomLevel])

  return (
    <div className="max-w-md lg:max-w-[1220px] mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight text-text-primary">Tableau de bord</h1>
          <p className="text-sm text-text-muted mt-1">{state ? (state.isCached ? 'Donnees cache' : 'Donnees fraiches') : 'Synchronisation requise'}</p>
        </div>
        <Button
          variant="secondary"
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending}
          className="shrink-0 gap-2"
        >
          <RefreshCw size={14} className={syncMutation.isPending ? 'animate-spin' : ''} />
          {syncMutation.isPending ? 'Synchronisation...' : 'Actualiser'}
        </Button>
      </div>

      <div className="grid lg:grid-cols-[420px_minmax(0,1fr)] gap-5 items-start">
        <Card className="surface-premium p-4 md:p-6">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-3xl font-medium text-text-primary">{friendlyName}</h2>
              <p className="text-base text-text-secondary mt-1">
                {statusLabel} <span className={cn('inline-block w-2 h-2 rounded-full ml-1', hasTelemetry ? 'bg-success' : 'bg-warning')} />
              </p>
              <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-border-subtle bg-bg-overlay/70 px-3 py-1.5 text-sm text-text-secondary">
                {state?.isLocked ? <Lock size={14} className="text-success" /> : <Unlock size={14} className="text-warning" />}
                <span>{lockStatus}</span>
              </div>
            </div>
          </div>

          <ArcGauge level={batteryLevel} rangeKm={batteryRange} hasData={hasTelemetry} />

          <p className="text-center text-sm text-text-muted -mt-2">
            <MapPin size={12} className="inline mr-1" />
            {vehicle?.lastSeenAt ? `${statusDetail} · ${formatDate(vehicle.lastSeenAt)}` : 'En attente de la première télémétrie'}
          </p>

          <div className="mt-5 rounded-2xl border border-border-subtle bg-bg-overlay/70 p-4">
            <div className="grid gap-1">
              <InfoRow label="Etat vehicule" value={statusDetail} />
              <InfoRow label="Autonomie" value={batteryRange != null ? `${formatNumberWithSpaces(batteryRange)} km` : '—'} />
              <InfoRow label="Limite de charge" value={extendedState?.chargeLimitSoc != null ? `${extendedState.chargeLimitSoc}%` : '—'} />
              <InfoRow label="Niveau de charge" value={batteryLevel != null ? `${Math.round(batteryLevel)}%` : '—'} />
              <InfoRow label="Temperature exterieure" value={outsideTemp != null ? `${outsideTemp.toFixed(1)} °C` : '—'} />
              <InfoRow label="Temperature interieure" value={insideTemp != null ? `${insideTemp.toFixed(1)} °C` : '—'} />
              <InfoRow label="Kilometrage" value={odometer != null ? `${formatNumberWithSpaces(odometer)} km` : '—'} />
            </div>
          </div>
        </Card>

        <Card className="surface-premium p-4 md:p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="text-sm text-text-primary">{location ? 'Dernière position connue' : 'Position indisponible'}</p>
              <p className="text-xs text-text-muted mt-0.5">
                {latitude != null && longitude != null && location
                  ? `${latitude.toFixed(5)}, ${longitude.toFixed(5)} · ${formatDate(location.capturedAt)}`
                  : 'Aucune donnée GPS enregistrée'}
              </p>
              {location && (
                <p className="text-xs text-text-secondary mt-1 max-w-3xl">
                  {isAtHome ? 'Maison' : (locationAddress ?? 'Adresse en cours de resolution...')}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMapZoomLevel((z) => Math.max(13, z - 1))}
                className="px-2 py-1 rounded-md border border-border-subtle text-text-secondary hover:text-text-primary"
              >
                <Minus size={14} />
              </button>
              <span className="text-xs text-text-muted min-w-14 text-center">Zoom {mapZoomLevel}</span>
              <button
                type="button"
                onClick={() => setMapZoomLevel((z) => Math.min(18, z + 1))}
                className="px-2 py-1 rounded-md border border-border-subtle text-text-secondary hover:text-text-primary"
              >
                <Plus size={14} />
              </button>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setMapZoomLevel(18)}
              className={cn('px-2.5 py-1 rounded-md border text-xs transition-colors', mapPreset === 'street' ? 'border-accent-500/40 bg-accent-500/10 text-accent-400' : 'border-border-subtle text-text-secondary hover:text-text-primary')}
            >
              Rue
            </button>
            <button
              type="button"
              onClick={() => setMapZoomLevel(16)}
              className={cn('px-2.5 py-1 rounded-md border text-xs transition-colors', mapPreset === 'district' ? 'border-accent-500/40 bg-accent-500/10 text-accent-400' : 'border-border-subtle text-text-secondary hover:text-text-primary')}
            >
              Quartier
            </button>
            <button
              type="button"
              onClick={() => setMapZoomLevel(14)}
              className={cn('px-2.5 py-1 rounded-md border text-xs transition-colors', mapPreset === 'city' ? 'border-accent-500/40 bg-accent-500/10 text-accent-400' : 'border-border-subtle text-text-secondary hover:text-text-primary')}
            >
              Ville
            </button>
          </div>

          {mapEmbedUrl ? (
            <div className="mt-3 space-y-2">
              <iframe
                title="Carte position véhicule"
                src={mapEmbedUrl}
                className="w-full h-64 lg:h-[460px] rounded-lg border border-border-subtle"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
              <div className="flex justify-end">
                <a
                  href={`https://www.google.com/maps?q=${latitude},${longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent-400 hover:text-accent-300 inline-flex items-center gap-1 text-xs"
                >
                  <MapPin size={14} /> Ouvrir dans Google Maps
                </a>
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-lg border border-border-subtle bg-bg-overlay/50 h-40 flex items-center justify-center text-sm text-text-muted">
              Position carte indisponible
            </div>
          )}
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <Card className="surface-premium p-4 md:p-5">
          <h3 className="text-lg font-medium text-text-primary">Bilan 7 jours</h3>
          <div className="grid grid-cols-2 gap-4 mt-4">
            <div>
              <p className="text-xs text-text-muted uppercase">Distance</p>
              <p className="text-3xl font-semibold text-text-primary mt-1">{distanceKm != null ? `${formatNumberWithSpaces(distanceKm)} km` : '—'}</p>
            </div>
            <div>
              <p className="text-xs text-text-muted uppercase">Énergie</p>
              <p className="text-3xl font-semibold text-text-primary mt-1">{energyUsedKwh != null ? `${energyUsedKwh.toFixed(1)} kWh` : '—'}</p>
            </div>
            <div>
              <p className="text-xs text-text-muted uppercase">Conso moyenne</p>
              <p className="text-xl font-semibold text-text-primary mt-1">{avgConsumption7d != null ? `${Math.round(avgConsumption7d * 10)} Wh/km` : '—'}</p>
            </div>
            <div>
              <p className="text-xs text-text-muted uppercase">Trajets</p>
              <p className="text-xl font-semibold text-text-primary mt-1">{tripsCount7d != null ? `${Math.round(tripsCount7d)}` : '—'}</p>
            </div>
          </div>
        </Card>

        <Card className="surface-premium p-4 md:p-5">
          <h3 className="text-lg font-medium text-text-primary">Dernier trajet</h3>
          {latestTrip ? (
            <Link
              to={`/trips?trip=${encodeURIComponent(latestTrip.id)}`}
              className="mt-3 block w-full space-y-3 text-left rounded-xl transition-colors hover:bg-bg-overlay/40 focus:outline-none focus:ring-2 focus:ring-accent-500/40"
            >
              <p className="text-sm text-text-secondary">
                {(latestTrip.startAddress ?? 'Départ inconnu')} → {(latestTrip.endAddress ?? 'Arrivée inconnue')}
              </p>
              <p className="text-xs text-text-muted">{formatDate(latestTrip.startedAt)}</p>
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div>
                  <p className="text-[11px] text-text-muted uppercase">Distance</p>
                  <p className="text-text-secondary">{latestTrip.distanceKm != null ? `${formatNumberWithSpaces(latestTrip.distanceKm)} km` : '—'}</p>
                </div>
                <div>
                  <p className="text-[11px] text-text-muted uppercase">Durée</p>
                  <p className="text-text-secondary">{formatDurationMin(latestTrip.durationMin)}</p>
                </div>
                <div>
                  <p className="text-[11px] text-text-muted uppercase">Conso</p>
                  <p className="text-text-secondary">{latestTripWhKm != null ? `${latestTripWhKm} Wh/km` : '—'}</p>
                </div>
              </div>
            </Link>
          ) : (
            <p className="mt-3 text-sm text-text-muted">Aucun trajet récent disponible</p>
          )}
        </Card>
      </div>
    </div>
  )
}
