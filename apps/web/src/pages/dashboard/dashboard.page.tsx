import { type ReactNode, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { vehicleApi, commandsApi, statsApi } from '@/features/vehicle/api'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { RefreshCw, Lock, Unlock, Thermometer, Zap, MapPin } from 'lucide-react'
import { cn, formatDate } from '@/lib/utils'

interface ReverseGeocodeResponse {
  display_name?: string
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

function QuickActionTile({
  icon,
  label,
  subtitle,
  onClick,
  loading,
  disabled,
}: {
  icon: ReactNode
  label: string
  subtitle?: string
  onClick: () => void
  loading?: boolean
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading || disabled}
      className="rounded-xl border border-border-subtle bg-bg-overlay/70 hover:bg-bg-overlay px-3 py-3 text-left transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <div className="text-text-secondary mb-2">{icon}</div>
      {subtitle ? <p className="text-lg font-medium text-text-primary leading-tight">{subtitle}</p> : null}
      <p className="text-xs text-text-muted mt-0.5">{label}</p>
    </button>
  )
}

export function DashboardPage() {
  const qc = useQueryClient()

  const refreshVehicleQueries = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['vehicle', 'current'] }),
      qc.invalidateQueries({ queryKey: ['vehicle', 'state'] }),
      qc.invalidateQueries({ queryKey: ['vehicle', 'location'] }),
    ])

    await Promise.all([
      qc.refetchQueries({ queryKey: ['vehicle', 'current'] }),
      qc.refetchQueries({ queryKey: ['vehicle', 'state'] }),
      qc.refetchQueries({ queryKey: ['vehicle', 'location'] }),
    ])
  }

  const runCommandAndRefresh = async (command: () => Promise<unknown>) => {
    await command()
    // Force a telemetry refresh so UI lock state reflects the command result quickly.
    await vehicleApi.sync().catch(() => undefined)
    await refreshVehicleQueries()
  }

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

  const syncMutation = useMutation({
    mutationFn: vehicleApi.sync,
    onSuccess: () => refreshVehicleQueries(),
  })

  const lockMutation = useMutation({
    mutationFn: () => runCommandAndRefresh(commandsApi.lock),
  })
  const unlockMutation = useMutation({
    mutationFn: () => runCommandAndRefresh(commandsApi.unlock),
  })
  const climateStartMutation = useMutation({
    mutationFn: () => runCommandAndRefresh(commandsApi.climateStart),
  })
  const wakeMutation = useMutation({
    mutationFn: () => runCommandAndRefresh(commandsApi.wake),
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

  const syncErrorMessage = syncMutation.isError
    ? (syncMutation.error instanceof Error ? syncMutation.error.message : 'Sync failed')
    : null

  const lockStatus = state?.isLocked == null
    ? 'Etat serrure inconnu'
    : state.isLocked
      ? 'Verrouille'
      : 'Deverrouille'

  const copLabel = state?.cabinOverheatProtectionMode === 'on'
    ? 'COP ON'
    : state?.cabinOverheatProtectionMode === 'fan_only'
      ? 'COP FAN'
      : 'COP OFF'

  const mapEmbedUrl = useMemo(() => {
    if (!location) return null
    const lon = location.longitude
    const lat = location.latitude
    const delta = 0.01
    const left = lon - delta
    const right = lon + delta
    const top = lat + delta
    const bottom = lat - delta
    return `https://www.openstreetmap.org/export/embed.html?bbox=${left},${bottom},${right},${top}&layer=mapnik&marker=${lat},${lon}`
  }, [location])

  return (
    <div className="max-w-md lg:max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight text-text-primary">Dashboard</h1>
          <p className="text-sm text-text-muted mt-1">{state ? (state.isCached ? 'Donnees cache' : 'Donnees fraiches') : 'Synchronisation requise'}</p>
        </div>
        <Button variant="ghost" size="sm" loading={syncMutation.isPending} onClick={() => syncMutation.mutate()}>
          <RefreshCw size={14} /> Sync
        </Button>
      </div>

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



        <ArcGauge level={state?.batteryLevel ?? null} rangeKm={state?.batteryRange ?? null} hasData={hasTelemetry} />

        {!hasTelemetry && (
          <div className="flex justify-center -mt-2 mb-2">
            <Button size="sm" variant="secondary" loading={syncMutation.isPending} onClick={() => syncMutation.mutate()}>
              Lancer premiere synchro
            </Button>
          </div>
        )}

        {syncErrorMessage && (
          <p className="text-center text-xs text-error -mt-1 mb-2">
            Echec synchronisation: {syncErrorMessage}
          </p>
        )}

        <p className="text-center text-sm text-text-muted -mt-2">
          <MapPin size={12} className="inline mr-1" />
          {vehicle?.lastSeenAt ? `Parked · ${formatDate(vehicle.lastSeenAt)}` : 'Waiting for first telemetry'}
        </p>

        <div className="grid grid-cols-4 gap-2 mt-5">
          <QuickActionTile
            icon={<Lock size={18} />}
            label="Lock"
            subtitle={state?.isLocked ? 'Actif' : undefined}
            onClick={() => lockMutation.mutate()}
            loading={lockMutation.isPending}
            disabled={!vehicle}
          />
          <QuickActionTile
            icon={<Unlock size={18} />}
            label="Unlock"
            subtitle={state?.isLocked === false ? 'Actif' : undefined}
            onClick={() => unlockMutation.mutate()}
            loading={unlockMutation.isPending}
            disabled={!vehicle}
          />
          <QuickActionTile
            icon={<Thermometer size={18} />}
            label="Climate"
            subtitle={state?.insideTemp != null ? `${Math.round(state.insideTemp)}° · ${copLabel}` : copLabel}
            onClick={() => climateStartMutation.mutate()}
            loading={climateStartMutation.isPending}
            disabled={!vehicle}
          />
          <QuickActionTile
            icon={<Zap size={18} />}
            label={vehicle?.state === 'asleep' ? 'Wake' : 'Charge'}
            onClick={() => wakeMutation.mutate()}
            loading={wakeMutation.isPending}
            disabled={!vehicle}
          />
        </div>

        <div className="mt-5 rounded-2xl border border-border-subtle bg-bg-overlay/70 p-4">
          <div>
            <p className="text-sm text-text-primary">{location ? 'Dernière position connue' : 'Position indisponible'}</p>
            <p className="text-xs text-text-muted mt-0.5">
              {location
                ? `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)} · ${formatDate(location.capturedAt)}`
                : 'Aucune donnée GPS enregistrée'}
            </p>
            {location && (
              <p className="text-xs text-text-secondary mt-1">
                {locationAddress ?? 'Adresse en cours de resolution...'}
              </p>
            )}
          </div>

          {location && mapEmbedUrl ? (
            <div className="mt-3 space-y-2">
              <iframe
                title="Carte position véhicule"
                src={mapEmbedUrl}
                className="w-full h-44 rounded-lg border border-border-subtle"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
              <div className="flex justify-end">
                <a
                  href={`https://www.google.com/maps?q=${location.latitude},${location.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent-400 hover:text-accent-300 inline-flex items-center gap-1 text-xs"
                >
                  <MapPin size={14} /> Ouvrir dans Google Maps
                </a>
              </div>
            </div>
          ) : (
            <div className="mt-2 flex justify-end">
              <MapPin size={18} className="text-text-muted flex-shrink-0" />
            </div>
          )}
        </div>
      </Card>

      <Card className="surface-premium p-4 md:p-5 lg:max-w-sm">
        <h3 className="text-lg font-medium text-text-primary">30 derniers jours</h3>
        <div className="grid grid-cols-2 gap-4 mt-4">
          <div>
            <p className="text-xs text-text-muted uppercase">Distance</p>
            <p className="text-3xl font-semibold text-text-primary mt-1">{Math.round((summary as Record<string, number> | undefined)?.distanceKm ?? 0)} km</p>
          </div>
          <div>
            <p className="text-xs text-text-muted uppercase">Énergie</p>
            <p className="text-3xl font-semibold text-text-primary mt-1">{(summary as Record<string, number> | undefined)?.energyAddedKwh?.toFixed(1) ?? '—'} kWh</p>
          </div>
        </div>
      </Card>
    </div>
  )
}
