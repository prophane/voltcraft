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

  const sessions = Array.isArray(data) ? data : []

  return (
    <div className="space-y-6">
      <div className="surface-premium p-4 md:p-5">
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary">Charging</h1>
        <p className="text-sm text-text-muted mt-1">Sessions de recharge et coûts estimés</p>
        <div className="h-px mt-4 accent-line opacity-70" />
      </div>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)}</div>
      ) : sessions.length === 0 ? (
        <Card className="text-center py-12 text-text-muted">Aucune session de recharge enregistrée</Card>
      ) : (
        <div className="space-y-3">
          {sessions.map((session) => (
            <Card key={session['id'] as string} className="surface-premium">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-success-bg border border-success/30">
                    <Battery size={16} className="text-success" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-text-primary">
                      {String(session['startBatteryLevel'] ?? '—')}% → {String(session['endBatteryLevel'] ?? '—')}%
                    </p>
                    <p className="text-xs text-text-muted mt-0.5">{formatDate(session['startedAt'] as string)}</p>
                  </div>
                </div>

                <div className="flex items-center gap-5 text-sm">
                  {Boolean(session['energyAddedKwh']) && (
                    <div className="flex items-center gap-1.5 text-text-secondary">
                      <Zap size={12} />
                      +{Number(session['energyAddedKwh']).toFixed(1)} kWh
                    </div>
                  )}
                  {Boolean(session['durationMin']) && (
                    <div className="flex items-center gap-1.5 text-text-secondary">
                      <Clock size={12} />
                      {formatDuration(Number(session['durationMin']))}
                    </div>
                  )}
                  {Boolean(session['estimatedCost']) && (
                    <div className="flex items-center gap-1.5 text-success">
                      <Euro size={12} />
                      {Number(session['estimatedCost']).toFixed(2)} €
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
