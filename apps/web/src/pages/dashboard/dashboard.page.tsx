import { type ReactNode, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { vehicleApi, commandsApi, statsApi } from '@/features/vehicle/api'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { RefreshCw, Lock, Unlock, Thermometer, Zap, MapPin } from 'lucide-react'
import { cn, formatDate } from '@/lib/utils'

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

  const syncMutation = useMutation({
    mutationFn: vehicleApi.sync,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vehicle'] }),
  })

  const lockMutation = useMutation({
    mutationFn: commandsApi.lock,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vehicle'] }),
  })
  const unlockMutation = useMutation({
    mutationFn: commandsApi.unlock,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vehicle'] }),
  })
  const climateStartMutation = useMutation({
    mutationFn: commandsApi.climateStart,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vehicle'] }),
  })
  const wakeMutation = useMutation({
    mutationFn: commandsApi.wake,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vehicle'] }),
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
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-border-subtle bg-bg-overlay/50 h-36 flex items-center justify-center overflow-hidden px-4">
          <svg viewBox="0 0 560 180" className="w-full max-w-xs drop-shadow-lg" fill="none" xmlns="http://www.w3.org/2000/svg">
            {/* Body */}
            <path d="M60 120 C60 120 80 80 140 68 C170 62 210 58 280 58 C350 58 390 62 420 68 C480 80 500 120 500 120 L500 140 C500 148 493 154 485 154 L75 154 C67 154 60 148 60 140 Z" fill="rgba(220,220,230,0.12)" stroke="rgba(255,255,255,0.18)" strokeWidth="1.5"/>
            {/* Roof */}
            <path d="M170 68 C185 40 210 28 280 26 C350 28 375 40 390 68 Z" fill="rgba(220,220,230,0.08)" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5"/>
            {/* Windshield */}
            <path d="M178 67 C192 44 215 31 280 29 C345 31 368 44 382 67 Z" fill="rgba(120,180,255,0.07)" stroke="rgba(120,180,255,0.25)" strokeWidth="1"/>
            {/* Side windows */}
            <path d="M180 67 L210 67 L205 95 L172 95 Z" fill="rgba(120,180,255,0.07)" stroke="rgba(120,180,255,0.2)" strokeWidth="1"/>
            <path d="M218 67 L280 67 L280 96 L213 96 Z" fill="rgba(120,180,255,0.07)" stroke="rgba(120,180,255,0.2)" strokeWidth="1"/>
            <path d="M288 67 L350 67 L347 96 L288 96 Z" fill="rgba(120,180,255,0.07)" stroke="rgba(120,180,255,0.2)" strokeWidth="1"/>
            <path d="M357 67 L380 67 L388 95 L354 95 Z" fill="rgba(120,180,255,0.07)" stroke="rgba(120,180,255,0.2)" strokeWidth="1"/>
            {/* Front wheel arch */}
            <path d="M100 120 C100 120 105 108 130 108 C155 108 160 120 160 120 Z" fill="rgba(0,0,0,0.3)" stroke="rgba(255,255,255,0.1)" strokeWidth="1"/>
            {/* Rear wheel arch */}
            <path d="M370 120 C370 120 375 108 400 108 C425 108 430 120 430 120 Z" fill="rgba(0,0,0,0.3)" stroke="rgba(255,255,255,0.1)" strokeWidth="1"/>
            {/* Front wheel */}
            <circle cx="130" cy="138" r="22" fill="rgba(30,30,35,0.95)" stroke="rgba(255,255,255,0.25)" strokeWidth="2"/>
            <circle cx="130" cy="138" r="13" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5"/>
            <circle cx="130" cy="138" r="4" fill="rgba(255,255,255,0.2)"/>
            {/* Rear wheel */}
            <circle cx="400" cy="138" r="22" fill="rgba(30,30,35,0.95)" stroke="rgba(255,255,255,0.25)" strokeWidth="2"/>
            <circle cx="400" cy="138" r="13" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5"/>
            <circle cx="400" cy="138" r="4" fill="rgba(255,255,255,0.2)"/>
            {/* T badge */}
            <path d="M273 42 L287 42 L287 44 L281.5 44 L281.5 54 L279.5 54 L279.5 44 L273 44 Z" fill="rgba(232,17,45,0.8)"/>
            {/* Ground shadow */}
            <ellipse cx="280" cy="160" rx="200" ry="6" fill="rgba(0,0,0,0.35)"/>
            {/* Front light strip */}
            <path d="M500 118 C500 118 495 112 480 112" stroke="rgba(255,240,180,0.6)" strokeWidth="2" strokeLinecap="round"/>
            {/* Rear light strip */}
            <path d="M60 118 C60 118 65 112 80 112" stroke="rgba(232,17,45,0.6)" strokeWidth="2" strokeLinecap="round"/>
          </svg>
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
            onClick={() => lockMutation.mutate()}
            loading={lockMutation.isPending}
            disabled={!vehicle}
          />
          <QuickActionTile
            icon={<Unlock size={18} />}
            label="Unlock"
            onClick={() => unlockMutation.mutate()}
            loading={unlockMutation.isPending}
            disabled={!vehicle}
          />
          <QuickActionTile
            icon={<Thermometer size={18} />}
            label="Climate"
            subtitle={state?.insideTemp != null ? `${Math.round(state.insideTemp)}°` : undefined}
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

        <div className="mt-5 rounded-2xl border border-border-subtle bg-bg-overlay/70 p-4 h-36 flex items-end justify-between">
          <div>
            <p className="text-sm text-text-primary">{state?.latitude && state?.longitude ? 'Position active' : 'Position indisponible'}</p>
            <p className={cn('text-xs mt-1', hasTelemetry ? 'text-success' : 'text-text-muted')}>{hasTelemetry ? 'Connected' : 'Waiting sync'}</p>
          </div>
          <MapPin size={18} className="text-accent-400" />
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
