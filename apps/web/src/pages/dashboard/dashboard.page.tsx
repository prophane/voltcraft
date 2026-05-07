import { type ReactNode, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { vehicleApi, commandsApi, statsApi } from '@/features/vehicle/api'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { RefreshCw, Lock, Unlock, Thermometer, Zap, Car, MapPin } from 'lucide-react'
import { cn, formatDate } from '@/lib/utils'

function ArcGauge({ level, rangeKm }: { level: number; rangeKm: number }) {
  const radius = 110
  const circumference = Math.PI * radius
  const progress = Math.max(0, Math.min(100, level))
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

      <div className="absolute top-[66px] text-center">
        <p className="text-5xl font-semibold leading-none text-text-primary">{Math.round(level)}<span className="text-2xl align-top">%</span></p>
        <p className="text-2xl text-text-secondary mt-1">{Math.round(rangeKm)} km</p>
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
}: {
  icon: ReactNode
  label: string
  subtitle?: string
  onClick: () => void
  loading?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="rounded-xl border border-border-subtle bg-bg-overlay/70 hover:bg-bg-overlay px-3 py-3 text-left transition-colors disabled:opacity-50"
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

  const statusLabel = useMemo(() => {
    if (!vehicle?.state) return 'Unknown'
    return vehicle.state === 'online' ? 'Online' : vehicle.state
  }, [vehicle?.state])

  return (
    <div className="max-w-md lg:max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight text-text-primary">Dashboard</h1>
          <p className="text-sm text-text-muted mt-1">{state?.isCached ? 'Données cache' : 'Données fraîches'}</p>
        </div>
        <Button variant="ghost" size="sm" loading={syncMutation.isPending} onClick={() => syncMutation.mutate()}>
          <RefreshCw size={14} /> Sync
        </Button>
      </div>

      <Card className="surface-premium p-4 md:p-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-3xl font-medium text-text-primary">{vehicle?.displayName ?? 'Model 3'}</h2>
            <p className="text-base text-text-secondary mt-1">
              {statusLabel} <span className={cn('inline-block w-2 h-2 rounded-full ml-1', vehicle?.state === 'online' ? 'bg-success' : 'bg-warning')} />
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-border-subtle bg-bg-overlay/50 h-32 flex items-center justify-center">
          <Car size={72} className="text-text-secondary" />
        </div>

        <ArcGauge level={state?.batteryLevel ?? 0} rangeKm={state?.batteryRange ?? 0} />

        <p className="text-center text-sm text-text-muted -mt-2">
          <MapPin size={12} className="inline mr-1" />
          Parked · {vehicle?.lastSeenAt ? formatDate(vehicle.lastSeenAt) : '—'}
        </p>

        <div className="grid grid-cols-4 gap-2 mt-5">
          <QuickActionTile
            icon={<Lock size={18} />}
            label="Lock"
            onClick={() => lockMutation.mutate()}
            loading={lockMutation.isPending}
          />
          <QuickActionTile
            icon={<Unlock size={18} />}
            label="Unlock"
            onClick={() => unlockMutation.mutate()}
            loading={unlockMutation.isPending}
          />
          <QuickActionTile
            icon={<Thermometer size={18} />}
            label="Climate"
            subtitle={state?.insideTemp != null ? `${Math.round(state.insideTemp)}.0°` : undefined}
            onClick={() => climateStartMutation.mutate()}
            loading={climateStartMutation.isPending}
          />
          <QuickActionTile
            icon={<Zap size={18} />}
            label={vehicle?.state === 'asleep' ? 'Wake' : 'Charge'}
            onClick={() => wakeMutation.mutate()}
            loading={wakeMutation.isPending}
          />
        </div>

        <div className="mt-5 rounded-2xl border border-border-subtle bg-bg-overlay/70 p-4 h-36 flex items-end justify-between">
          <div>
            <p className="text-sm text-text-primary">{state?.latitude && state?.longitude ? 'Position active' : 'Position indisponible'}</p>
            <p className="text-xs text-success mt-1">Connected</p>
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
