import { type ReactNode } from 'react'
import { type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'

export type TelemetrySource = 'TeslaMate' | 'Fleet' | 'Voltcraft' | 'Cache' | 'Unknown'
export type DiagnosticsViewMode = 'essential' | 'expert'
export type AlertSeverity = 'Critique' | 'A surveiller' | 'Info'

export function ageMinutes(iso?: string | null): number | null {
  if (!iso) return null
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000))
}

export function formatAge(iso?: string | null): string {
  const minutes = ageMinutes(iso)
  if (minutes == null) return 'non disponible'
  if (minutes < 1) return 'moins d 1 min'
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return mins > 0 ? `${hours} h ${mins} min` : `${hours} h`
}

export function sourceLabelText(source: TelemetrySource, cached: boolean): string {
  if (source === 'TeslaMate') return cached ? 'TeslaMate (cache)' : 'TeslaMate (direct)'
  if (source === 'Fleet') return cached ? 'Fleet (cache)' : 'Fleet (direct)'
  if (source === 'Cache') return 'Cache local'
  if (source === 'Voltcraft') return cached ? 'Voltcraft (cache)' : 'Voltcraft (direct)'
  return 'Source inconnue'
}

function freshnessTone(minutes: number | null, warnMinutes: number, criticalMinutes: number) {
  if (minutes == null) return 'text-text-muted border-border-subtle bg-bg-overlay/60'
  if (minutes >= criticalMinutes) return 'text-warning border-warning/30 bg-warning/10'
  if (minutes >= warnMinutes) return 'text-warning border-warning/30 bg-warning/10'
  return 'text-success border-success/30 bg-success/10'
}

function freshnessLabel(minutes: number | null, warnMinutes: number, criticalMinutes: number) {
  if (minutes == null) return 'Fraicheur inconnue'
  if (minutes >= criticalMinutes) return 'Synchro en retard'
  if (minutes >= warnMinutes) return 'Synchro a surveiller'
  return 'Synchronise'
}

export function ModuleDataHealthStrip({
  moduleLabel,
  source,
  lastUpdateAt,
  cached,
  warnMinutes,
  criticalMinutes,
  message,
  actionLabel,
  onAction,
  actionHref,
}: {
  moduleLabel: string
  source: TelemetrySource
  lastUpdateAt?: string | null
  cached?: boolean
  warnMinutes: number
  criticalMinutes: number
  message?: string | null
  actionLabel?: string
  onAction?: () => void
  actionHref?: string
}) {
  const minutes = ageMinutes(lastUpdateAt)
  const tone = freshnessTone(minutes, warnMinutes, criticalMinutes)
  const status = freshnessLabel(minutes, warnMinutes, criticalMinutes)

  return (
    <div className="rounded-xl border border-border-subtle bg-bg-overlay/45 px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <DiagBadge tone="text-text-secondary border-border-subtle bg-bg-overlay/70">
            {moduleLabel}
          </DiagBadge>
          <DiagBadge tone="text-text-secondary border-border-subtle bg-bg-overlay/70">
            Source: {sourceLabelText(source, Boolean(cached))}
          </DiagBadge>
          <DiagBadge tone={tone}>{status}</DiagBadge>
        </div>

        {(onAction && actionLabel) || (actionHref && actionLabel) ? (
          onAction ? (
            <button
              type="button"
              onClick={onAction}
              className="text-xs px-2.5 py-1 rounded-md border border-border-subtle text-text-secondary hover:text-text-primary"
            >
              {actionLabel}
            </button>
          ) : (
            <a
              href={actionHref}
              className="text-xs px-2.5 py-1 rounded-md border border-border-subtle text-text-secondary hover:text-text-primary"
            >
              {actionLabel}
            </a>
          )
        ) : null}
      </div>

      <p className="mt-1 text-xs text-text-muted">
        Derniere mise a jour: {formatAge(lastUpdateAt)}
        {message ? ` - ${message}` : ''}
      </p>
    </div>
  )
}

export function MetricTile({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: LucideIcon
  label: string
  value: string
  detail?: string
}) {
  return (
    <Card className="p-4 lg:p-5">
      <div className="flex items-center gap-2 text-text-muted">
        <Icon size={14} />
        <p className="text-xs uppercase tracking-wide">{label}</p>
      </div>
      <p className="mt-3 text-2xl font-semibold text-text-primary leading-tight">{value}</p>
      {detail ? <p className="mt-1 text-xs text-text-muted">{detail}</p> : null}
    </Card>
  )
}

export function CompareRow({
  label,
  left,
  right,
  delta,
  tone = 'text-text-secondary',
}: {
  label: string
  left: string
  right: string
  delta?: string
  tone?: string
}) {
  return (
    <div className="grid grid-cols-12 gap-3 items-center py-3 border-b border-border-subtle last:border-b-0">
      <div className="col-span-4 lg:col-span-3 text-sm text-text-muted">{label}</div>
      <div className="col-span-4 lg:col-span-4 text-sm text-text-primary font-medium">{left}</div>
      <div className={cn('col-span-4 lg:col-span-3 text-sm text-right', tone)}>{right}</div>
      <div className="col-span-12 lg:col-span-2 text-xs text-text-muted lg:text-right">{delta ?? '—'}</div>
    </div>
  )
}

export function DiagBadge({
  children,
  tone = 'text-text-secondary border-border-subtle bg-bg-overlay/70',
}: {
  children: ReactNode
  tone?: string
}) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs', tone)}>
      {children}
    </span>
  )
}

export function InfoChip({
  label,
  value,
  tone = 'neutral',
}: {
  label: string
  value: string
  tone?: 'neutral' | 'success' | 'warning'
}) {
  const toneClass =
    tone === 'warning'
      ? 'border-warning/30 bg-warning/10 text-text-secondary'
      : tone === 'success'
        ? 'border-success/30 bg-success/10 text-text-secondary'
        : 'border-border-subtle bg-bg-overlay/60 text-text-secondary'

  return (
    <div className={cn('rounded-2xl border p-4', toneClass)}>
      <p className="text-xs uppercase tracking-wide text-text-muted">{label}</p>
      <p className="mt-2 text-base font-semibold text-text-primary">{value}</p>
    </div>
  )
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center px-4 text-center">
      <p className="max-w-sm text-sm text-text-muted">{message}</p>
    </div>
  )
}

export function ViewModeToggle({
  viewMode,
  onChange,
}: {
  viewMode: DiagnosticsViewMode
  onChange: (mode: DiagnosticsViewMode) => void
}) {
  return (
    <div className="inline-flex rounded-xl border border-border-subtle bg-bg-overlay/60 p-1">
      <button
        type="button"
        onClick={() => onChange('essential')}
        className={cn(
          'px-3 py-1.5 text-xs rounded-lg transition-colors',
          viewMode === 'essential' ? 'bg-accent-500/20 text-text-primary' : 'text-text-secondary hover:text-text-primary',
        )}
      >
        Essentiel
      </button>
      <button
        type="button"
        onClick={() => onChange('expert')}
        className={cn(
          'px-3 py-1.5 text-xs rounded-lg transition-colors',
          viewMode === 'expert' ? 'bg-accent-500/20 text-text-primary' : 'text-text-secondary hover:text-text-primary',
        )}
      >
        Expert
      </button>
    </div>
  )
}
