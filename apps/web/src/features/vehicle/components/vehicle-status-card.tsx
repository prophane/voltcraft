import { Thermometer, Lock, Unlock, MapPin, Clock } from 'lucide-react'
import { VehicleStateBadge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDate } from '@/lib/utils'
import { CardSkeleton } from '@/components/ui/skeleton'

interface VehicleStatusCardProps {
  displayName: string
  state: string
  isLocked: boolean
  insideTemp: number | null
  outsideTemp: number | null
  lastSeenAt: string | null
  isLoading?: boolean
}

export function VehicleStatusCard({
  displayName, state, isLocked, insideTemp, outsideTemp, lastSeenAt, isLoading,
}: VehicleStatusCardProps) {
  if (isLoading) return <CardSkeleton />

  return (
    <Card>
      <CardHeader>
        <CardTitle>Véhicule</CardTitle>
        <VehicleStateBadge state={state} />
      </CardHeader>

      <h2 className="text-xl font-semibold text-text-primary mb-4">{displayName}</h2>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex items-center gap-2 text-sm text-text-secondary">
          {isLocked
            ? <Lock size={14} className="text-success" />
            : <Unlock size={14} className="text-warning" />}
          <span>{isLocked ? 'Verrouillé' : 'Déverrouillé'}</span>
        </div>

        {insideTemp !== null && (
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <Thermometer size={14} className="text-accent-400" />
            <span>{insideTemp}°C intérieur</span>
          </div>
        )}

        {outsideTemp !== null && (
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <Thermometer size={14} className="text-text-muted" />
            <span>{outsideTemp}°C extérieur</span>
          </div>
        )}

        {lastSeenAt && (
          <div className="flex items-center gap-2 text-sm text-text-muted col-span-2">
            <Clock size={12} />
            <span>Synchro: {formatDate(lastSeenAt)}</span>
          </div>
        )}
      </div>
    </Card>
  )
}
