import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { vehicleApi, statsApi } from '@/features/vehicle/api'
import { Card } from '@/components/ui/card'
import { Lock, Unlock, MapPin, Plus, Minus } from 'lucide-react'
import { cn, formatDate } from '@/lib/utils'

interface ReverseGeocodeResponse {
  display_name?: string
}

function toFiniteNumber(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(parsed) ? parsed : null
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
        <p className="text-2xl text-text-secondary mt-1">{hasData ? `${Math.round(rangeKm ?? 0)} km` : 'No data'}</p>
        <p className="text-sm text-text-muted mt-1">Battery</p>
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
  const [mapZoomLevel, setMapZoomLevel] = useState(14)

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
    queryKey: ['stats', 'summary', 30],
    queryFn: () => statsApi.summary(30),
    staleTime: 300_000,
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
    if (!name) return 'Tesla Vehicle'
    const looksLikeVin = name.length >= 17 && !name.includes(' ')
    return looksLikeVin ? `Tesla ${name.slice(-6)}` : name
  }, [vehicle?.displayName])

  const statusLabel = useMemo(() => {
    if (!vehicle?.state) return hasTelemetry ? 'Online' : 'No data yet'
    return vehicle.state === 'online' ? 'Online' : vehicle.state
  }, [hasTelemetry, vehicle?.state])

  const extendedState = state as (typeof state & {
    chargeLimitSoc?: number | null
    odometer?: number | null
  }) | undefined

  const summaryData = summary as Record<string, unknown> | undefined
  const distanceKm = toFiniteNumber(summaryData?.['distanceKm'])
  const energyUsedKwh = toFiniteNumber(summaryData?.['energyUsedKwh'])
  const batteryRange = toFiniteNumber(state?.batteryRange)
  const batteryLevel = toFiniteNumber(state?.batteryLevel)
  const outsideTemp = toFiniteNumber(state?.outsideTemp)
  const insideTemp = toFiniteNumber(state?.insideTemp)
  const odometer = toFiniteNumber(extendedState?.odometer)
  const latitude = toFiniteNumber(location?.latitude)
  const longitude = toFiniteNumber(location?.longitude)

  const lockStatus = state?.isLocked == null
    ? 'Etat serrure inconnu'
    : state.isLocked
      ? 'Verrouille'
      : 'Deverrouille'

  const statusDetail = useMemo(() => {
    if (!hasTelemetry) return 'No data yet'
    if (vehicle?.state === 'online') return 'Online'
    if (vehicle?.state === 'asleep') return 'Asleep'
    if (vehicle?.state === 'offline') return 'Offline'
    if (vehicle?.state === 'charging') return 'Charging'
    if (vehicle?.state === 'driving') return 'Driving'
    return vehicle?.state ?? 'Unknown'
  }, [hasTelemetry, vehicle?.state])

  const mapEmbedUrl = useMemo(() => {
    if (latitude == null || longitude == null) return null
    const lon = longitude
    const lat = latitude
    const safeZoom = Math.max(11, Math.min(17, mapZoomLevel))
    const delta = 0.2 / (2 ** (safeZoom - 10))
    const left = lon - delta
    const right = lon + delta
    const top = lat + delta
    const bottom = lat - delta
    return `https://www.openstreetmap.org/export/embed.html?bbox=${left},${bottom},${right},${top}&layer=mapnik&marker=${lat},${lon}`
  }, [latitude, longitude, mapZoomLevel])

  const mapPreset = useMemo(() => {
    if (mapZoomLevel >= 16) return 'street'
    if (mapZoomLevel <= 12) return 'city'
    return 'district'
  }, [mapZoomLevel])

  return (
    <div className="max-w-md lg:max-w-[1220px] mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight text-text-primary">Dashboard</h1>
          <p className="text-sm text-text-muted mt-1">{state ? (state.isCached ? 'Donnees cache' : 'Donnees fraiches') : 'Synchronisation requise'}</p>
        </div>
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
            {vehicle?.lastSeenAt ? `Parked · ${formatDate(vehicle.lastSeenAt)}` : 'Waiting for first telemetry'}
          </p>

          <div className="mt-5 rounded-2xl border border-border-subtle bg-bg-overlay/70 p-4">
            <div className="grid gap-1">
              <InfoRow label="Vehicle status" value={statusDetail} />
              <InfoRow label="Range" value={batteryRange != null ? `${Math.round(batteryRange)} km` : '—'} />
              <InfoRow label="Charge limit" value={extendedState?.chargeLimitSoc != null ? `${extendedState.chargeLimitSoc}%` : '—'} />
              <InfoRow label="State of charge" value={batteryLevel != null ? `${Math.round(batteryLevel)}%` : '—'} />
              <InfoRow label="Outside temperature" value={outsideTemp != null ? `${outsideTemp.toFixed(1)} °C` : '—'} />
              <InfoRow label="Inside temperature" value={insideTemp != null ? `${insideTemp.toFixed(1)} °C` : '—'} />
              <InfoRow label="Mileage" value={odometer != null ? `${Math.round(odometer)} km` : '—'} />
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
                  {locationAddress ?? 'Adresse en cours de resolution...'}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMapZoomLevel((z) => Math.max(11, z - 1))}
                className="px-2 py-1 rounded-md border border-border-subtle text-text-secondary hover:text-text-primary"
              >
                <Minus size={14} />
              </button>
              <span className="text-xs text-text-muted min-w-14 text-center">Zoom {mapZoomLevel}</span>
              <button
                type="button"
                onClick={() => setMapZoomLevel((z) => Math.min(17, z + 1))}
                className="px-2 py-1 rounded-md border border-border-subtle text-text-secondary hover:text-text-primary"
              >
                <Plus size={14} />
              </button>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setMapZoomLevel(16)}
              className={cn('px-2.5 py-1 rounded-md border text-xs transition-colors', mapPreset === 'street' ? 'border-accent-500/40 bg-accent-500/10 text-accent-400' : 'border-border-subtle text-text-secondary hover:text-text-primary')}
            >
              Rue
            </button>
            <button
              type="button"
              onClick={() => setMapZoomLevel(14)}
              className={cn('px-2.5 py-1 rounded-md border text-xs transition-colors', mapPreset === 'district' ? 'border-accent-500/40 bg-accent-500/10 text-accent-400' : 'border-border-subtle text-text-secondary hover:text-text-primary')}
            >
              Quartier
            </button>
            <button
              type="button"
              onClick={() => setMapZoomLevel(12)}
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

      <Card className="surface-premium p-4 md:p-5">
        <h3 className="text-lg font-medium text-text-primary">30 derniers jours</h3>
        <div className="grid grid-cols-2 gap-4 mt-4">
          <div>
            <p className="text-xs text-text-muted uppercase">Distance</p>
            <p className="text-3xl font-semibold text-text-primary mt-1">{Math.round(distanceKm ?? 0)} km</p>
          </div>
          <div>
            <p className="text-xs text-text-muted uppercase">Énergie consommée</p>
            <p className="text-3xl font-semibold text-text-primary mt-1">{energyUsedKwh != null ? `${energyUsedKwh.toFixed(1)} kWh` : '—'}</p>
          </div>
        </div>
      </Card>
    </div>
  )
}
