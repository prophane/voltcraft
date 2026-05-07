import { useQuery } from '@tanstack/react-query'
import { tripsApi } from '@/features/vehicle/api'
import { Card } from '@/components/ui/card'
import { CardSkeleton } from '@/components/ui/skeleton'
import { formatDate, formatKm, formatDuration } from '@/lib/utils'
import { Route, Clock, Zap } from 'lucide-react'

export function TripsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['trips'],
    queryFn: () => tripsApi.list(),
  })

  const trips = (data as { data: Record<string, unknown>[] } | undefined)?.data ?? []

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-text-primary">Trajets</h1>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <CardSkeleton key={i} />)}</div>
      ) : trips.length === 0 ? (
        <Card className="text-center py-12 text-text-muted">Aucun trajet enregistré</Card>
      ) : (
        <div className="space-y-3">
          {trips.map((trip) => (
            <Card key={trip['id'] as string} className="hover:border-border transition-colors cursor-pointer">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-bg-overlay">
                    <Route size={16} className="text-accent-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-text-primary">
                      {trip['startAddress'] as string || 'Départ inconnu'} → {trip['endAddress'] as string || 'Arrivée inconnue'}
                    </p>
                    <p className="text-xs text-text-muted mt-0.5">{formatDate(trip['startedAt'] as string)}</p>
                  </div>
                </div>

                <div className="flex items-center gap-5 text-sm">
                  <div className="flex items-center gap-1.5 text-text-secondary">
                    <Route size={12} />
                    {formatKm(trip['distanceKm'] as number ?? 0)}
                  </div>
                  {trip['durationMin'] && (
                    <div className="flex items-center gap-1.5 text-text-secondary">
                      <Clock size={12} />
                      {formatDuration(trip['durationMin'] as number)}
                    </div>
                  )}
                  {trip['energyUsedKwh'] && (
                    <div className="flex items-center gap-1.5 text-text-secondary">
                      <Zap size={12} />
                      {(trip['energyUsedKwh'] as number).toFixed(1)} kWh
                    </div>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
