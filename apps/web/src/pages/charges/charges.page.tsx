import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { chargesApi, settingsApi, vehicleApi } from '@/features/vehicle/api'
import { Card } from '@/components/ui/card'
import { CardSkeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { api, ApiError } from '@/lib/api-client'
import { formatDate, formatDuration } from '@/lib/utils'
import { useEffect, useMemo, useState } from 'react'
import { Battery, Clock, Euro, Gauge, MapPin, Zap } from 'lucide-react'
import { ageMinutes, ModuleDataHealthStrip } from '../diagnostics/diagnostics-shared'

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
  latitude?: number | null
  longitude?: number | null
}

type GeofenceRecord = {
  id: number
  name: string
  latitude: number
  longitude: number
  radius: number
}

type WindowDays = 7 | 30 | 90

type MiniTrendPoint = {
  dayLabel: string
  value: number
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

function cleanLocationName(address: string | null | undefined): string {
  if (!address) return ''
  const value = address.trim()
  if (!value || value.toLowerCase() === 'emplacement inconnu') return ''
  return value
}

function normalizeGeofence(raw: unknown): GeofenceRecord | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const id = parseNumber(row.id)
  const latitude = parseNumber(row.latitude)
  const longitude = parseNumber(row.longitude)
  const radius = parseNumber(row.radius)
  if (id == null || latitude == null || longitude == null || radius == null) return null

  return {
    id,
    name: parseString(row.name) ?? 'Lieu sans nom',
    latitude,
    longitude,
    radius,
  }
}

function normalizeGeofences(raw: unknown): GeofenceRecord[] {
  if (Array.isArray(raw)) return raw.map(normalizeGeofence).filter(Boolean) as GeofenceRecord[]
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>
    const list = obj.geofences
    if (Array.isArray(list)) return list.map(normalizeGeofence).filter(Boolean) as GeofenceRecord[]
  }
  return []
}

function haversineDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 6371000 * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)))
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
    latitude: parseNumber(row.latitude),
    longitude: parseNumber(row.longitude),
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

async function fetchAllChargeSessions() {
  const pageSize = 100
  const maxPages = 50
  let page = 1
  const sessions: ChargeSessionRecord[] = []

  while (page <= maxPages) {
    const response = await chargesApi.list(page, pageSize)
    const pageSessions = normalizeSessions(response)
    sessions.push(...pageSessions)
    if (pageSessions.length < pageSize) break
    page += 1
  }

  return sessions
}

function chargeTypeLabel(type?: string | null) {
  if (!type) return 'Inconnu'
  if (type === 'SUPERCHARGER') return 'Rapide (Supercharger)'
  if (type === 'DC_FAST') return 'Rapide (DC)'
  if (type === 'AC_LEVEL_2') return 'Normale (AC)'
  if (type === 'AC_LEVEL_1') return 'Lente (AC)'
  return 'Inconnu'
}

function buildDailyChargeEnergyTrend(sessions: ChargeSessionRecord[], days: WindowDays): MiniTrendPoint[] {
  const now = new Date()
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - (days - 1))

  const byDay = new Map<string, number>()
  for (const session of sessions) {
    const at = new Date(session.startedAt)
    if (Number.isNaN(at.getTime()) || at < start) continue
    const key = at.toISOString().slice(0, 10)
    byDay.set(key, (byDay.get(key) ?? 0) + (session.energyAddedKwh ?? 0))
  }

  const points: MiniTrendPoint[] = []
  for (let i = 0; i < days; i++) {
    const day = new Date(start)
    day.setDate(start.getDate() + i)
    const key = day.toISOString().slice(0, 10)
    points.push({
      dayLabel: `${day.getDate()}/${day.getMonth() + 1}`,
      value: Math.round((byDay.get(key) ?? 0) * 10) / 10,
    })
  }
  return points
}

export function ChargesPage() {
  const queryClient = useQueryClient()
  const [windowDays, setWindowDays] = useState<WindowDays>(30)
  const [expandedGeofenceForId, setExpandedGeofenceForId] = useState<string | null>(null)
  const [geofenceName, setGeofenceName] = useState('')
  const [geofenceRadius, setGeofenceRadius] = useState(100)
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null)
  const [visibleCount, setVisibleCount] = useState(10)

  const { data: settingsData } = useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsApi.get(),
    staleTime: 60_000,
  })

  const initialChargeDisplayCount = useMemo(() => {
    const raw = (settingsData as Record<string, unknown> | undefined)?.['chargesInitialDisplayCount']
    const value = parseNumber(raw)
    if (value == null) return 10
    const rounded = Math.round(value)
    return Math.max(1, Math.min(200, rounded))
  }, [settingsData])

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['charges'],
    queryFn: () => fetchAllChargeSessions(),
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    staleTime: 0,
    placeholderData: (previousData) => previousData,
  })

  const { data: vehicleState } = useQuery({
    queryKey: ['vehicle', 'state'],
    queryFn: vehicleApi.getState,
    staleTime: 60_000,
    refetchInterval: 60_000,
  })

  useEffect(() => {
    setVisibleCount(initialChargeDisplayCount)
  }, [initialChargeDisplayCount])

  const createGeofenceMutation = useMutation({
    mutationFn: (payload: { name: string; latitude: number; longitude: number; radius: number }) =>
      api.post('/settings/geofences', payload),
    onSuccess: (_, variables) => {
      setFeedbackMessage(`Geofence "${variables.name}" creee avec succes.`)
      setExpandedGeofenceForId(null)
      setGeofenceName('')
      setGeofenceRadius(100)
      queryClient.invalidateQueries({ queryKey: ['geofences'] })
    },
    onError: (mutationError) => {
      const message = mutationError instanceof ApiError ? mutationError.message : 'Erreur inconnue'
      setFeedbackMessage(`Creation impossible: ${message}`)
    },
  })

  const { data: geofencesData } = useQuery({
    queryKey: ['geofences'],
    queryFn: () => api.get('/settings/geofences'),
  })

  const sessions = normalizeSessions(data).filter((session) => {
    const energy = session.energyAddedKwh
    const durationMin = session.durationMin
    const displayedEnergy = energy == null ? null : Math.round(energy * 10) / 10

    const isTrivialShortSession =
      displayedEnergy != null
      && displayedEnergy <= 0.1
      && durationMin != null
      && durationMin <= 2

    return !isTrivialShortSession
  })

  const filteredWindowSessions = useMemo(() => {
    const threshold = Date.now() - windowDays * 86_400_000
    return sessions.filter((session) => new Date(session.startedAt).getTime() >= threshold)
  }, [sessions, windowDays])

  const compactSummary = useMemo(() => {
    const totalEnergy = filteredWindowSessions.reduce((sum, s) => sum + (s.energyAddedKwh ?? 0), 0)
    const totalCost = filteredWindowSessions.reduce((sum, s) => sum + (s.estimatedCost ?? 0), 0)
    const count = filteredWindowSessions.length
    return {
      totalEnergy,
      totalCost,
      count,
    }
  }, [filteredWindowSessions])

  const compactTrend = useMemo(
    () => buildDailyChargeEnergyTrend(sessions, windowDays),
    [sessions, windowDays],
  )

  const chargesLastUpdateAt = sessions[0]?.startedAt ?? null
  const chargesFreshnessMin = ageMinutes(chargesLastUpdateAt)
  const hasChargeSyncGap = Boolean(vehicleState?.isCharging && (chargesFreshnessMin == null || chargesFreshnessMin > 120))
  const chargesSyncMessage = hasChargeSyncGap
    ? 'Vehicule en charge detecte mais aucune session recente: verifier TeslaMate puis relancer la synchro.'
    : chargesFreshnessMin != null && chargesFreshnessMin > 14_400
      ? 'Aucune recharge recente sur cette source. Si vous avez recharge, verifier TeslaMate.'
      : null

  const displayedSessions = sessions.slice(0, visibleCount)
  const geofences = normalizeGeofences(geofencesData)
  const addressCounts = displayedSessions.reduce((acc, session) => {
    const key = session.address ?? ''
    if (!key) return acc
    acc.set(key, (acc.get(key) ?? 0) + 1)
    return acc
  }, new Map<string, number>())

  const openGeofenceForm = (session: ChargeSessionRecord) => {
    setExpandedGeofenceForId(session.id)
    setGeofenceName(cleanLocationName(session.address))
    setGeofenceRadius(100)
    setFeedbackMessage(null)
  }

  const cancelGeofenceForm = () => {
    setExpandedGeofenceForId(null)
    setGeofenceName('')
    setGeofenceRadius(100)
  }

  const submitGeofence = (session: ChargeSessionRecord) => {
    if (session.latitude == null || session.longitude == null) {
      setFeedbackMessage('Coordonnees indisponibles pour ce lieu.')
      return
    }

    const name = geofenceName.trim()
    if (!name) {
      setFeedbackMessage('Le nom du lieu est requis.')
      return
    }

    let closestDuplicate: { geofence: GeofenceRecord; distance: number } | null = null
    for (const geofence of geofences) {
      const distance = haversineDistanceMeters(
        session.latitude,
        session.longitude,
        geofence.latitude,
        geofence.longitude,
      )

      // Consider as duplicate when coverage areas overlap.
      if (distance <= geofence.radius + geofenceRadius) {
        if (!closestDuplicate || distance < closestDuplicate.distance) {
          closestDuplicate = { geofence, distance }
        }
      }
    }

    if (closestDuplicate) {
      setFeedbackMessage(
        `Doublon detecte: trop proche de "${closestDuplicate.geofence.name}" (${Math.round(closestDuplicate.distance)} m).`,
      )
      return
    }

    createGeofenceMutation.mutate({
      name,
      latitude: session.latitude,
      longitude: session.longitude,
      radius: geofenceRadius,
    })
  }

  return (
    <div className="space-y-6">
      <div className="surface-premium p-4 md:p-5">
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary">Charging</h1>
        <p className="text-sm text-text-muted mt-1">Sessions de recharge, vitesse, type, emplacement et coûts</p>
        <div className="mt-3">
          <ModuleDataHealthStrip
            moduleLabel="Recharges"
            source="TeslaMate"
            cached
            lastUpdateAt={chargesLastUpdateAt}
            warnMinutes={7_200}
            criticalMinutes={14_400}
            message={chargesSyncMessage}
            actionLabel="Ouvrir settings"
            actionHref="/settings"
          />
        </div>
        {sessions.length > 0 && (
          <div className="mt-3 rounded-lg border border-border-subtle bg-bg-overlay/45 px-3 py-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="inline-flex rounded-md border border-border-subtle overflow-hidden">
                {([7, 30, 90] as WindowDays[]).map((days) => (
                  <button
                    key={days}
                    type="button"
                    onClick={() => setWindowDays(days)}
                    className={[
                      'px-2.5 py-1 text-xs transition-colors',
                      windowDays === days
                        ? 'bg-accent-500/20 text-accent-400'
                        : 'text-text-muted hover:text-text-primary',
                    ].join(' ')}
                  >
                    {days}j
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-3 gap-3 text-[11px] md:text-xs">
                <p className="text-text-muted">Sessions <span className="text-text-primary font-medium">{compactSummary.count}</span></p>
                <p className="text-text-muted">Energie <span className="text-text-primary font-medium">{compactSummary.totalEnergy.toFixed(1)} kWh</span></p>
                <p className="text-text-muted">Cout <span className="text-text-primary font-medium">{compactSummary.totalCost.toFixed(2)} €</span></p>
              </div>
            </div>

            <div className="mt-2">
              <MiniTrendSparkline points={compactTrend} color="#22c55e" ariaLabel="Tendance énergie recharges" />
            </div>
          </div>
        )}
        <div className="h-px mt-4 accent-line opacity-70" />
      </div>

      {isError ? (
        <Card className="text-center py-12 text-text-muted">
          Impossible de charger les recharges TeslaMate{error instanceof Error ? `: ${error.message}` : ''}
        </Card>
      ) : isLoading ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)}</div>
      ) : sessions.length === 0 ? (
        <Card className="text-center py-12 text-text-muted">Aucune session de recharge enregistrée</Card>
      ) : (
        <div className="space-y-3">
          {displayedSessions.map((session) => (
            (() => {
              const isOngoingCharge = session.endedAt == null
              const primaryChargeKw = isOngoingCharge
                ? (session.chargerPower ?? session.avgChargeKw ?? session.maxChargeKw)
                : (session.avgChargeKw ?? session.maxChargeKw ?? session.chargerPower)
              const speedLabel = isOngoingCharge ? 'Vitesse charge' : 'Vitesse moyenne'

              return (
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
                    <p className="text-[11px] uppercase text-text-muted">{speedLabel}</p>
                    <p className="text-text-primary font-medium mt-1 inline-flex items-center gap-1"><Gauge size={12} /> {primaryChargeKw != null ? `${primaryChargeKw.toFixed(1)} kW` : '—'}</p>
                    <p className="text-[11px] text-text-muted mt-1">Max {session.maxChargeKw != null ? `${session.maxChargeKw.toFixed(0)} kW` : '—'} / Moy {session.avgChargeKw != null ? `${session.avgChargeKw.toFixed(0)} kW` : '—'}</p>
                  </div>
                  <div className="p-2 rounded-lg bg-bg-overlay/50 border border-border-subtle">
                    <p className="text-[11px] uppercase text-text-muted">Lieu</p>
                    <button
                      type="button"
                      className="text-text-primary font-medium mt-1 inline-flex items-center gap-1 underline-offset-2 hover:underline disabled:no-underline disabled:opacity-80"
                      onClick={() => openGeofenceForm(session)}
                      disabled={session.latitude == null || session.longitude == null}
                      title={session.latitude == null || session.longitude == null ? 'Coordonnees indisponibles' : 'Ajouter ce lieu en geofence'}
                    >
                      <MapPin size={12} /> {session.address ?? 'Emplacement inconnu'}
                    </button>
                    <p className="text-[11px] text-text-muted mt-1">{session.address && (addressCounts.get(session.address) ?? 0) > 1 ? 'Lieu connu' : 'Nouveau lieu'}</p>
                  </div>
                  <div className="p-2 rounded-lg bg-bg-overlay/50 border border-border-subtle">
                    <p className="text-[11px] uppercase text-text-muted">Prix</p>
                    <p className="text-text-primary font-medium mt-1">{session.estimatedCost != null ? `${session.estimatedCost.toFixed(2)} €` : '—'}</p>
                    <p className="text-[11px] text-text-muted mt-1">{session.pricePerKwh != null ? `${session.pricePerKwh.toFixed(2)} €/kWh` : 'Tarif inconnu'}</p>
                  </div>
                </div>

                {expandedGeofenceForId === session.id && (
                  <div className="rounded-lg border border-border-subtle bg-bg-overlay/50 p-3 space-y-3">
                    <p className="text-xs uppercase text-text-muted">Ajouter en geofence</p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      <input
                        type="text"
                        placeholder="Nom du lieu"
                        className="w-full bg-bg-overlay border border-border rounded px-2 py-1.5 text-sm text-text-primary"
                        value={geofenceName}
                        onChange={(event) => setGeofenceName(event.target.value)}
                      />
                      <input
                        type="number"
                        min="10"
                        max="10000"
                        className="w-full bg-bg-overlay border border-border rounded px-2 py-1.5 text-sm text-text-primary"
                        value={geofenceRadius}
                        onChange={(event) => setGeofenceRadius(Math.max(10, Number(event.target.value) || 100))}
                      />
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          loading={createGeofenceMutation.isPending}
                          onClick={() => submitGeofence(session)}
                        >
                          Enregistrer
                        </Button>
                        <Button size="sm" variant="ghost" onClick={cancelGeofenceForm}>
                          Annuler
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </Card>
              )
            })()
          ))}

          {sessions.length > displayedSessions.length && (
            <div className="flex items-center justify-between px-1 pt-1">
              <p className="text-xs text-text-muted">
                {displayedSessions.length} sur {sessions.length} sessions affichées
              </p>
              <button
                type="button"
                onClick={() => setVisibleCount((count) => Math.min(sessions.length, count + initialChargeDisplayCount))}
                className="px-3 py-1.5 rounded-md border border-border-subtle text-text-secondary hover:text-text-primary text-sm"
              >
                Charger plus
              </button>
            </div>
          )}
        </div>
      )}

      {feedbackMessage && (
        <Card className="text-sm text-text-secondary">{feedbackMessage}</Card>
      )}
    </div>
  )
}

function MiniTrendSparkline({ points, color, ariaLabel }: { points: MiniTrendPoint[]; color: string; ariaLabel: string }) {
  if (!points.length) {
    return <p className="text-xs text-text-muted">Aucune donnée sur la période.</p>
  }

  const width = 520
  const height = 58
  const pad = 4
  const max = Math.max(...points.map((p) => p.value), 1)
  const min = 0
  const xStep = points.length > 1 ? (width - pad * 2) / (points.length - 1) : 0

  const coords = points.map((point, index) => {
    const x = pad + xStep * index
    const ratio = (point.value - min) / (max - min || 1)
    const y = height - pad - ratio * (height - pad * 2)
    return { x, y }
  })

  const path = coords
    .map((c, index) => `${index === 0 ? 'M' : 'L'} ${c.x.toFixed(2)} ${c.y.toFixed(2)}`)
    .join(' ')

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-14" role="img" aria-label={ariaLabel}>
      <path d={`M ${pad} ${height - pad} ${path.slice(1)} L ${width - pad} ${height - pad} Z`} fill={`${color}22`} stroke="none" />
      <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
