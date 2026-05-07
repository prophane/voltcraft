import { cn } from '@/lib/utils'
import type { VehicleState } from '@voltcraft/shared'

type BadgeVariant = 'online' | 'asleep' | 'charging' | 'driving' | 'offline' | 'default'

interface BadgeProps {
  variant?: BadgeVariant
  children: React.ReactNode
  className?: string
}

export function Badge({ variant = 'default', children, className }: BadgeProps) {
  const variantClass: Record<BadgeVariant, string> = {
    online: 'badge-online',
    asleep: 'badge-asleep',
    charging: 'badge-charging',
    driving: 'badge-driving',
    offline: 'badge-offline',
    default: 'badge bg-bg-overlay text-text-secondary border border-border-subtle',
  }
  return <span className={cn(variantClass[variant], className)}>{children}</span>
}

const STATE_LABELS: Record<string, string> = {
  online: 'En ligne',
  asleep: 'En veille',
  offline: 'Hors ligne',
  charging: 'En charge',
  driving: 'En route',
  updating: 'Mise à jour',
}

export function VehicleStateBadge({ state }: { state: VehicleState | string }) {
  const variant = (state as BadgeVariant) in {
    online: 1, asleep: 1, charging: 1, driving: 1, offline: 1,
  } ? (state as BadgeVariant) : 'default'

  return (
    <Badge variant={variant}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {STATE_LABELS[state] ?? state}
    </Badge>
  )
}
