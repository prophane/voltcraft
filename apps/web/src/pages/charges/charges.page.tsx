import { useQuery } from '@tanstack/react-query'
import { chargesApi } from '@/features/vehicle/api'
import { Card } from '@/components/ui/card'
import { CardSkeleton } from '@/components/ui/skeleton'
import { formatDate, formatDuration } from '@/lib/utils'
import { Battery, Clock, Euro, Gauge, MapPin, Zap } from 'lucide-react'

type ChargeSessionRecord = {
  id: string
  startedAt: string
  endedAt?: string | null
  energyAddedKwh?: number | null
  startBatteryLevel?: number | null
  endBatteryLevel?: number | null
  durationMin?: number | null
  estimatedCost?: number | null
  pricePerKwh?: number | null
  chargeType?: string | null
  chargerPower?: number | null
  maxChargeKw?: number | null
  avgChargeKw?: number | null
  address?: string | null
}

function parseNumber(value: unknown): number | null {
  if (value == null) return null
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function parseString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const v = value.trim()
  return v.length > 0 ? v : null
}

function normalizeSession(raw: unknown): ChargeSessionRecord | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const id = parseString(row.id)
  const startedAt = parseString(row.startedAt ?? row.started_at)
  if (!id || !startedAt) return null

  return {
    id,
    startedAt,
    endedAt: parseString(row.endedAt ?? row.ended_at),
    energyAddedKwh: parseNumber(row.energyAddedKwh ?? row.energy_added_kwh),
    startBatteryLevel: parseNumber(row.startBatteryLevel ?? row.start_battery_level),
    endBatteryLevel: parseNumber(row.endBatteryLevel ?? row.end_battery_level),
    durationMin: parseNumber(row.durationMin ?? row.duration_min),
    estimatedCost: parseNumber(row.estimatedCost ?? row.estimated_cost),
    pricePerKwh: parseNumber(row.pricePerKwh ?? row.price_per_kwh),
    chargeType: parseString(row.chargeType ?? row.charge_type),
    chargerPower: parseNumber(row.chargerPower ?? row.charger_power),
    maxChargeKw: parseNumber(row.maxChargeKw ?? row.max_charge_kw),
    avgChargeKw: parseNumber(row.avgChargeKw ?? row.avg_charge_kw),
    address: parseString(row.address),
  }
}

function normalizeSessions(raw: unknown): ChargeSessionRecord[] {
  if (Array.isArray(raw)) return raw.map(normalizeSession).filter(Boolean) as ChargeSessionRecord[]
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>
    const list = obj.sessions ?? obj.items ?? obj.data
    if (Array.isArray(list)) return list.map(normalizeSession).filter(Boolean) as ChargeSessionRecord[]
  }
  return []
}

function chargeTypeLabel(type?: string | null) {
  if (!type) return 'Inconnu'
  if (type === 'SUPERCHARGER') return 'Rapide (Supercharger)'
  if (type === 'DC_FAST') return 'Rapide (DC)'
  if (type === 'AC_LEVEL_2') return 'Normale (AC)'
  if (type === 'AC_LEVEL_1') return 'Lente (AC)'
  return 'Inconnu'
}

export function ChargesPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['charges'],
    queryFn: () => chargesApi.list(),
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    staleTime: 0,
    placeholderData: (previousData) => previousData,
  })

  const sessions = normalizeSessions(data)
  const addressCounts = sessions.reduce((acc, session) => {
    const key = session.address ?? ''
    if (!key) return acc
    acc.set(key, (acc.get(key) ?? 0) + 1)
    return acc
  }, new Map<string, number>())

  return (
    <div className="space-y-6">
      <div className="surface-premium p-4 md:p-5">
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary">Charging</h1>
        <p className="text-sm text-text-muted mt-1">Sessions de recharge, vitesse, type, emplacement et coûts</p>
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
              <div className="space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-success-bg border border-success/30">
                      <Battery size={16} className="text-success" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-text-primary">
                        {session.startBatteryLevel != null ? `${Math.round(session.startBatteryLevel)}%` : '—'} → {session.endBatteryLevel != null ? `${Math.round(session.endBatteryLevel)}%` : '—'}
                      </p>
                      <p className="text-xs text-text-muted mt-0.5">{formatDate(session.startedAt)}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-5 text-sm">
                    {session.energyAddedKwh != null && (
                      <div className="flex items-center gap-1.5 text-text-secondary">
                        <Zap size={12} />
                        +{session.energyAddedKwh.toFixed(1)} kWh
                      </div>
                    )}
                    {session.durationMin != null && (
                      <div className="flex items-center gap-1.5 text-text-secondary">
                        <Clock size={12} />
                        {formatDuration(Number(session.durationMin))}
                      </div>
                    )}
                    {session.estimatedCost != null && (
                      <div className="flex items-center gap-1.5 text-success">
                        <Euro size={12} />
                        {session.estimatedCost.toFixed(2)} €
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div className="p-2 rounded-lg bg-success-bg border border-success/30">
                    <p className="text-[11px] uppercase text-text-muted">Type</p>
                    <p className="text-text-primary font-medium mt-1">{chargeTypeLabel(session.chargeType)}</p>
                  </div>
                  <div className="p-2 rounded-lg bg-bg-overlay/50 border border-border-subtle">
                    <p className="text-[11px] uppercase text-text-muted">Vitesse charge</p>
                    <p className="text-text-primary font-medium mt-1 inline-flex items-center gap-1"><Gauge size={12} /> {session.chargerPower != null ? `${session.chargerPower.toFixed(0)} kW` : '—'}</p>
                    <p className="text-[11px] text-text-muted mt-1">Max {session.maxChargeKw != null ? `${session.maxChargeKw.toFixed(0)} kW` : '—'} / Moy {session.avgChargeKw != null ? `${session.avgChargeKw.toFixed(0)} kW` : '—'}</p>
                  </div>
                  <div className="p-2 rounded-lg bg-bg-overlay/50 border border-border-subtle">
                    <p className="text-[11px] uppercase text-text-muted">Lieu</p>
                    <p className="text-text-primary font-medium mt-1 inline-flex items-center gap-1"><MapPin size={12} /> {session.address ?? 'Emplacement inconnu'}</p>
                    <p className="text-[11px] text-text-muted mt-1">{session.address && (addressCounts.get(session.address) ?? 0) > 1 ? 'Lieu connu' : 'Nouveau lieu'}</p>
                  </div>
                  <div className="p-2 rounded-lg bg-bg-overlay/50 border border-border-subtle">
                    <p className="text-[11px] uppercase text-text-muted">Prix</p>
                    <p className="text-text-primary font-medium mt-1">{session.estimatedCost != null ? `${session.estimatedCost.toFixed(2)} €` : '—'}</p>
                    <p className="text-[11px] text-text-muted mt-1">{session.pricePerKwh != null ? `${session.pricePerKwh.toFixed(2)} €/kWh` : 'Tarif inconnu'}</p>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
