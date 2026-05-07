import { useQuery } from '@tanstack/react-query'
import { chargesApi } from '@/features/vehicle/api'
import { Card } from '@/components/ui/card'
import { CardSkeleton } from '@/components/ui/skeleton'
import { formatDate, formatDuration } from '@/lib/utils'
import { Battery, Clock, Euro, Zap } from 'lucide-react'

export function ChargesPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['charges'],
    queryFn: () => chargesApi.list(),
  })

  const sessions = (data as { data: Record<string, unknown>[] } | undefined)?.data ?? []

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-text-primary">Recharges</h1>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)}</div>
      ) : sessions.length === 0 ? (
        <Card className="text-center py-12 text-text-muted">Aucune session de recharge enregistrée</Card>
      ) : (
        <div className="space-y-3">
          {sessions.map((session) => (
            <Card key={session['id'] as string}>
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-success-bg">
                    <Battery size={16} className="text-success" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-text-primary">
                      {session['startBatteryLevel'] ?? '—'}% → {session['endBatteryLevel'] ?? '—'}%
                    </p>
                    <p className="text-xs text-text-muted mt-0.5">{formatDate(session['startedAt'] as string)}</p>
                  </div>
                </div>

                <div className="flex items-center gap-5 text-sm">
                  {session['energyAddedKwh'] && (
                    <div className="flex items-center gap-1.5 text-text-secondary">
                      <Zap size={12} />
                      +{(session['energyAddedKwh'] as number).toFixed(1)} kWh
                    </div>
                  )}
                  {session['durationMin'] && (
                    <div className="flex items-center gap-1.5 text-text-secondary">
                      <Clock size={12} />
                      {formatDuration(session['durationMin'] as number)}
                    </div>
                  )}
                  {session['estimatedCost'] && (
                    <div className="flex items-center gap-1.5 text-success">
                      <Euro size={12} />
                      {(session['estimatedCost'] as number).toFixed(2)} €
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
