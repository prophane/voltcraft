import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { vehicleApi, commandsApi } from '@/features/vehicle/api'
import { BatteryHeroCard } from '@/features/vehicle/components/battery-hero-card'
import { VehicleStatusCard } from '@/features/vehicle/components/vehicle-status-card'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CardSkeleton } from '@/components/ui/skeleton'
import { RefreshCw, Lock, Unlock, Thermometer, Zap } from 'lucide-react'

export function DashboardPage() {
  const qc = useQueryClient()

  const { data: vehicle, isLoading: vLoading } = useQuery({
    queryKey: ['vehicle', 'current'],
    queryFn: vehicleApi.getCurrent,
    refetchInterval: 60_000,
  })

  const { data: state, isLoading: sLoading } = useQuery({
    queryKey: ['vehicle', 'state'],
    queryFn: vehicleApi.getState,
    refetchInterval: 60_000,
    enabled: !!vehicle,
  })

  const syncMutation = useMutation({
    mutationFn: vehicleApi.sync,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['vehicle'] }) },
  })

  const isLoading = vLoading || sLoading

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">
            {vehicle?.displayName ?? 'Tableau de bord'}
          </h1>
          <p className="text-sm text-text-muted mt-0.5">
            {state?.isCached ? 'Données en cache' : 'Données fraîches'}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          loading={syncMutation.isPending}
          onClick={() => syncMutation.mutate()}
        >
          <RefreshCw size={14} />
          Sync
        </Button>
      </div>

      {/* Bento grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">

        {/* Battery hero — span full row on xl */}
        <div className="md:col-span-2 xl:col-span-2">
          {isLoading
            ? <div className="card p-6"><CardSkeleton /></div>
            : state && (
              <BatteryHeroCard
                level={state.batteryLevel}
                range={state.batteryRange}
                isCharging={state.isCharging}
                chargeRate={state.chargeRate ?? undefined}
                timeToFull={state.timeToFullCharge ?? undefined}
              />
            )}
        </div>

        {/* Vehicle status */}
        <div>
          {isLoading
            ? <CardSkeleton />
            : state && vehicle && (
              <VehicleStatusCard
                displayName={vehicle.displayName}
                state={vehicle.state}
                isLocked={state.isLocked}
                insideTemp={state.insideTemp}
                outsideTemp={state.outsideTemp}
                lastSeenAt={vehicle.lastSeenAt}
              />
            )}
        </div>

        {/* Quick commands */}
        <div className="md:col-span-2">
          <QuickActionsCard isAsleep={vehicle?.state === 'asleep'} />
        </div>

        {/* Stats chips */}
        <div>
          <StatsChipsCard />
        </div>

      </div>
    </div>
  )
}

function QuickActionsCard({ isAsleep }: { isAsleep: boolean }) {
  const qc = useQueryClient()
  const qOpts = { onSuccess: () => qc.invalidateQueries({ queryKey: ['vehicle'] }) }

  const lockMutation = useMutation({ mutationFn: commandsApi.lock, ...qOpts })
  const unlockMutation = useMutation({ mutationFn: commandsApi.unlock, ...qOpts })
  const climateStartMutation = useMutation({ mutationFn: commandsApi.climateStart, ...qOpts })
  const climateStopMutation = useMutation({ mutationFn: commandsApi.climateStop, ...qOpts })
  const wakeMutation = useMutation({ mutationFn: commandsApi.wake, ...qOpts })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Commandes rapides</CardTitle>
      </CardHeader>
      <div className="flex flex-wrap gap-3">
        {isAsleep ? (
          <Button variant="primary" loading={wakeMutation.isPending} onClick={() => wakeMutation.mutate()}>
            <Zap size={14} /> Réveiller
          </Button>
        ) : (
          <>
            <Button size="sm" loading={lockMutation.isPending} onClick={() => lockMutation.mutate()}>
              <Lock size={14} /> Verrouiller
            </Button>
            <Button size="sm" loading={unlockMutation.isPending} onClick={() => unlockMutation.mutate()}>
              <Unlock size={14} /> Déverrouiller
            </Button>
            <Button size="sm" loading={climateStartMutation.isPending} onClick={() => climateStartMutation.mutate()}>
              <Thermometer size={14} /> Clim ON
            </Button>
            <Button size="sm" variant="ghost" loading={climateStopMutation.isPending} onClick={() => climateStopMutation.mutate()}>
              Clim OFF
            </Button>
          </>
        )}
      </div>
    </Card>
  )
}

function StatsChipsCard() {
  const { data, isLoading } = useQuery({
    queryKey: ['stats', 'summary', 30],
    queryFn: () => import('@/features/vehicle/api').then(m => m.statsApi.summary(30)),
    staleTime: 300_000,
  })

  const s = data as Record<string, number> | undefined

  if (isLoading) return <CardSkeleton />

  return (
    <Card>
      <CardHeader><CardTitle>30 derniers jours</CardTitle></CardHeader>
      <div className="grid grid-cols-2 gap-4">
        <StatChip label="Distance" value={`${Math.round(s?.['distanceKm'] ?? 0)} km`} />
        <StatChip label="Énergie" value={`${s?.['energyAddedKwh']?.toFixed(1) ?? '—'} kWh`} />
        <StatChip label="Coût estimé" value={`${s?.['estimatedCostEur']?.toFixed(2) ?? '—'} €`} />
        <StatChip label="Trajets" value={String(s?.['tripsCount'] ?? '—')} />
      </div>
    </Card>
  )
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="stat-label">{label}</p>
      <p className="stat-value text-xl mt-0.5">{value}</p>
    </div>
  )
}
