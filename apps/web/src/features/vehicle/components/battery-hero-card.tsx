import { motion } from 'framer-motion'
import { Battery, Zap } from 'lucide-react'
import { cn, formatKm } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'

interface BatteryHeroCardProps {
  level: number
  range: number
  isCharging: boolean
  chargeRate?: number
  timeToFull?: number
  isLoading?: boolean
}

export function BatteryHeroCard({
  level, range, isCharging, chargeRate, timeToFull, isLoading,
}: BatteryHeroCardProps) {
  if (isLoading) return <div className="card p-6"><Skeleton className="h-40 w-full" /></div>

  const color =
    level <= 15 ? '#ef4444' :
    level <= 25 ? '#f59e0b' :
    isCharging  ? '#22c55e' :
                  '#E8112D'

  // Gauge bar width %
  const barWidth = Math.max(2, Math.min(100, level))

  return (
    <div className="card p-6 relative overflow-hidden">
      {/* Background glow */}
      <div
        className="absolute inset-0 opacity-5 pointer-events-none"
        style={{ background: `radial-gradient(ellipse at 30% 50%, ${color} 0%, transparent 70%)` }}
      />

      <div className="relative">
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="stat-label mb-1">Batterie</p>
            <div className="flex items-end gap-2">
              <motion.span
                className="text-5xl font-bold tracking-tight"
                style={{ color }}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
              >
                {level}
              </motion.span>
              <span className="text-xl font-medium text-text-secondary mb-1">%</span>
            </div>
            <p className="text-text-secondary text-sm mt-1">{formatKm(range)} d'autonomie</p>
          </div>

          <div className="flex flex-col items-end gap-2">
            {isCharging && (
              <div className="flex items-center gap-1.5 text-success text-sm font-medium">
                <Zap size={14} className="animate-pulse" />
                {chargeRate ? `+${Math.round(chargeRate)} km/h` : 'En charge'}
              </div>
            )}
            {isCharging && timeToFull && (
              <p className="text-xs text-text-muted">
                Plein dans {timeToFull < 1
                  ? `${Math.round(timeToFull * 60)} min`
                  : `${timeToFull.toFixed(1)}h`}
              </p>
            )}
            <Battery size={28} style={{ color }} className={cn(isCharging && 'animate-pulse-slow')} />
          </div>
        </div>

        {/* Gauge bar */}
        <div className="h-2 bg-bg-overlay rounded-full overflow-hidden">
          <motion.div
            className="h-full rounded-full"
            style={{ backgroundColor: color }}
            initial={{ width: 0 }}
            animate={{ width: `${barWidth}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          />
        </div>

        {/* Tick marks */}
        <div className="flex justify-between mt-1">
          {[0, 25, 50, 75, 100].map((tick) => (
            <span key={tick} className="text-xs text-text-muted">{tick}%</span>
          ))}
        </div>
      </div>
    </div>
  )
}
