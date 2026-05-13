import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { settingsApi, diagnosticsApi } from '@/features/vehicle/api'
import type {
  TeslamateSettingsStatus,
  TeslamateSettingsInput,
  TeslamateConnectionTestResult,
} from '@/features/vehicle/api'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, AlertTriangle, XCircle, ArrowUp, ArrowDown, GripVertical } from 'lucide-react'
import { ApiError } from '@/lib/api-client'
import { TeslaSettingsSection } from './tesla-section'
import { GeofencesSection } from './geofences-section'
import { MENU_ICON_REGISTRY } from '@/components/layout/nav-config'
import { getNavPreferences, resetNavPreferences, setNavPreferences, type NavPreferences } from '@/features/preferences/nav-preferences'
import { NAV_ITEMS, type NavItemKey } from '@/components/layout/nav-config'

function normalizeOrderedKeys(keys: NavItemKey[]): NavItemKey[] {
  const unique: NavItemKey[] = []
  for (const key of keys) {
    if (!NAV_ITEMS.some((item) => item.key === key) || unique.includes(key)) continue
    unique.push(key)
  }

  for (const item of NAV_ITEMS) {
    if (!unique.includes(item.key)) unique.push(item.key)
  }

  return unique
}

export function SettingsPage() {
  const qc = useQueryClient()
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: settingsApi.get })
  const { data: diag } = useQuery({
    queryKey: ['diagnostics'],
    queryFn: diagnosticsApi.status,
    refetchInterval: 30_000,
  })
  const { data: apiUsage } = useQuery({
    queryKey: ['diagnostics', 'api-usage'],
    queryFn: diagnosticsApi.apiUsage,
    refetchInterval: 60_000,
  })
  const {
    data: teslamateStatus,
    isLoading: isLoadingTeslamate,
  } = useQuery({
    queryKey: ['settings', 'teslamate'],
    queryFn: settingsApi.getTeslamate,
  })

  const s = settings as Record<string, unknown> | undefined
  const d = diag as Record<string, unknown> | undefined
  const au = apiUsage as Record<string, number> | undefined

  const [priceKwh, setPriceKwh] = useState<string>('')
  const [minTripDistanceKm, setMinTripDistanceKm] = useState<string>('')
  const [tripsInitialDisplayCount, setTripsInitialDisplayCount] = useState<string>('')
  const [chargesInitialDisplayCount, setChargesInitialDisplayCount] = useState<string>('')
  const [diagFreshnessWarnMin, setDiagFreshnessWarnMin] = useState<string>('')
  const [diagFreshnessCriticalMin, setDiagFreshnessCriticalMin] = useState<string>('')
  const [diagBatteryDeltaWarnPct, setDiagBatteryDeltaWarnPct] = useState<string>('')
  const [diagBatteryDeltaCriticalPct, setDiagBatteryDeltaCriticalPct] = useState<string>('')
  const [diagIdleWarnHours7d, setDiagIdleWarnHours7d] = useState<string>('')
  const [diagIdleCriticalHours7d, setDiagIdleCriticalHours7d] = useState<string>('')
  const [menuDraft, setMenuDraft] = useState<NavPreferences>(() => getNavPreferences())
  const [menuSavedAt, setMenuSavedAt] = useState<string | null>(null)
  const [draggedMenuKey, setDraggedMenuKey] = useState<NavItemKey | null>(null)
  const [dragOverMenuKey, setDragOverMenuKey] = useState<NavItemKey | null>(null)
  const [teslamateForm, setTeslamateForm] = useState<TeslamateSettingsInput>({
    backendOnly: true,
    dbName: 'teslamate',
    dbUser: 'teslamate',
    grafanaUser: 'admin',
    port: 4000,
    grafanaPort: 3002,
  })

  const updateMutation = useMutation({
    mutationFn: (data: unknown) => settingsApi.update(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  })

  const updateTeslamateMutation = useMutation({
    mutationFn: (data: TeslamateSettingsInput) => settingsApi.updateTeslamate(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'teslamate'] }),
  })

  const [teslamateTestResult, setTeslamateTestResult] = useState<TeslamateConnectionTestResult | null>(null)
  const testTeslamateConnectionMutation = useMutation({
    mutationFn: (data: Pick<TeslamateSettingsInput, 'dbName' | 'dbUser' | 'dbPassword'>) =>
      settingsApi.testTeslamateConnection(data),
    onSuccess: (result) => {
      setTeslamateTestResult(result)
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        setTeslamateTestResult({ connected: false, code: error.code, message: error.message })
      } else if (error instanceof Error) {
        setTeslamateTestResult({ connected: false, code: 'UNKNOWN', message: error.message })
      } else {
        setTeslamateTestResult({ connected: false, code: 'UNKNOWN', message: 'Connection test failed.' })
      }
    },
  })

  useEffect(() => {
    const ts = teslamateStatus as TeslamateSettingsStatus | undefined
    if (!ts) return
    setTeslamateForm((prev) => ({
      ...prev,
      backendOnly: ts.backendOnly,
      dbName: ts.dbName,
      dbUser: ts.dbUser,
      grafanaUser: ts.grafanaUser,
      port: ts.port,
      grafanaPort: ts.grafanaPort,
    }))
  }, [teslamateStatus])

  useEffect(() => {
    if (!s) return
    setTripsInitialDisplayCount(String(s['tripsInitialDisplayCount'] ?? 10))
    setChargesInitialDisplayCount(String(s['chargesInitialDisplayCount'] ?? 10))
    setDiagFreshnessWarnMin(String(s['diagnosticsFreshnessWarnMin'] ?? 8))
    setDiagFreshnessCriticalMin(String(s['diagnosticsFreshnessCriticalMin'] ?? 20))
    setDiagBatteryDeltaWarnPct(String(s['diagnosticsBatteryDeltaWarnPct'] ?? 2))
    setDiagBatteryDeltaCriticalPct(String(s['diagnosticsBatteryDeltaCriticalPct'] ?? 5))
    setDiagIdleWarnHours7d(String(s['diagnosticsIdleWarnHours7d'] ?? 8))
    setDiagIdleCriticalHours7d(String(s['diagnosticsIdleCriticalHours7d'] ?? 12))
  }, [s])

  useEffect(() => {
    setMenuDraft(getNavPreferences())
  }, [])

  const menuItems = useMemo(() => {
    const byKey = new Map(NAV_ITEMS.map((item) => [item.key, item]))
    const orderedKeys = normalizeOrderedKeys(menuDraft.orderedKeys)
    return orderedKeys
      .map((key) => byKey.get(key))
      .filter((item): item is (typeof NAV_ITEMS)[number] => item != null)
      .map((item) => ({
        ...item,
        iconName: menuDraft.iconByKey[item.key] ?? item.defaultIcon,
        hidden: menuDraft.hiddenKeys.includes(item.key),
      }))
  }, [menuDraft])

  const updateMenuIcon = (key: keyof NavPreferences['iconByKey'], iconName: keyof typeof MENU_ICON_REGISTRY) => {
    setMenuDraft((current) => {
      const next = {
        ...current,
        iconByKey: { ...current.iconByKey, [key]: iconName },
      }
      setNavPreferences(next)
      setMenuSavedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
      return next
    })
  }

  const updateMenuVisibility = (key: keyof NavPreferences['iconByKey'], visible: boolean) => {
    setMenuDraft((current) => {
      const next = {
        ...current,
        hiddenKeys: visible
          ? current.hiddenKeys.filter((hiddenKey) => hiddenKey !== key)
          : Array.from(new Set([...current.hiddenKeys, key])),
      }
      setNavPreferences(next)
      setMenuSavedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
      return next
    })
  }

  const moveMenuItem = (key: NavItemKey, direction: 'up' | 'down') => {
    setMenuDraft((current) => {
      const ordered = normalizeOrderedKeys(current.orderedKeys)
      const index = ordered.indexOf(key)
      if (index < 0) return current
      const targetIndex = direction === 'up' ? index - 1 : index + 1
      if (targetIndex < 0 || targetIndex >= ordered.length) return current

      const nextOrdered = [...ordered]
      const currentKey = nextOrdered[index]
      nextOrdered[index] = nextOrdered[targetIndex] as NavItemKey
      nextOrdered[targetIndex] = currentKey as NavItemKey

      const next = {
        ...current,
        orderedKeys: nextOrdered,
      }
      setNavPreferences(next)
      setMenuSavedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
      return next
    })
  }

  const moveMenuItemToTarget = (fromKey: NavItemKey, targetKey: NavItemKey) => {
    if (fromKey === targetKey) return
    setMenuDraft((current) => {
      const ordered = normalizeOrderedKeys(current.orderedKeys)
      const fromIndex = ordered.indexOf(fromKey)
      const targetIndex = ordered.indexOf(targetKey)
      if (fromIndex < 0 || targetIndex < 0) return current

      const nextOrdered = [...ordered]
      const [moved] = nextOrdered.splice(fromIndex, 1)
      if (!moved) return current
      nextOrdered.splice(targetIndex, 0, moved)

      const next = {
        ...current,
        orderedKeys: nextOrdered,
      }
      setNavPreferences(next)
      setMenuSavedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
      return next
    })
  }

  const resetMenuPreferences = () => {
    const next = { hiddenKeys: [], iconByKey: {}, orderedKeys: [] as NavItemKey[] }
    setMenuDraft(next)
    resetNavPreferences()
    setMenuSavedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
  }

  const saveMenuPreferences = () => {
    setNavPreferences(menuDraft)
    setMenuSavedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
  }

  const ServiceStatus = ({ label, status }: { label: string; status?: unknown }) => {
    const isOk = status === 'ok' || status === 'connected'
    const isErr = status === 'error' || status === 'disconnected'
    return (
      <div className="flex items-center justify-between py-2 border-b border-border-subtle last:border-0">
        <span className="text-sm text-text-secondary">{label}</span>
        {isOk
          ? <CheckCircle2 size={16} className="text-success" />
          : isErr
          ? <XCircle size={16} className="text-error" />
          : <AlertTriangle size={16} className="text-warning" />}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-text-primary">Paramètres</h1>

      {/* Preferences */}
      <Card>
        <CardHeader><CardTitle>Préférences</CardTitle></CardHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="stat-label block mb-1">Distance</label>
              <select
                className="w-full bg-bg-overlay border border-border rounded-lg px-3 py-2 text-sm text-text-primary"
                defaultValue={s?.['distanceUnit'] as string ?? 'km'}
                onChange={(e) => updateMutation.mutate({ distanceUnit: e.target.value })}
              >
                <option value="km">Kilomètres</option>
                <option value="miles">Miles</option>
              </select>
            </div>
            <div>
              <label className="stat-label block mb-1">Température</label>
              <select
                className="w-full bg-bg-overlay border border-border rounded-lg px-3 py-2 text-sm text-text-primary"
                defaultValue={s?.['temperatureUnit'] as string ?? 'celsius'}
                onChange={(e) => updateMutation.mutate({ temperatureUnit: e.target.value })}
              >
                <option value="celsius">Celsius</option>
                <option value="fahrenheit">Fahrenheit</option>
              </select>
            </div>
            <div>
              <label className="stat-label block mb-1">Vue carte par défaut</label>
              <select
                className="w-full bg-bg-overlay border border-border rounded-lg px-3 py-2 text-sm text-text-primary"
                defaultValue={s?.['dashboardMapZoomPreset'] as string ?? 'street'}
                onChange={(e) => updateMutation.mutate({ dashboardMapZoomPreset: e.target.value })}
              >
                <option value="street">Rue</option>
                <option value="district">Quartier</option>
                <option value="city">Ville</option>
              </select>
            </div>
          </div>

          <div>
            <label className="stat-label block mb-1">Prix du kWh (€)</label>
            <div className="flex gap-2">
              <input
                type="number"
                step="0.001"
                min="0"
                max="10"
                className="bg-bg-overlay border border-border rounded-lg px-3 py-2 text-sm text-text-primary w-32"
                placeholder={s?.['pricePerKwh']?.toString() ?? '0.15'}
                value={priceKwh}
                onChange={(e) => setPriceKwh(e.target.value)}
              />
              <Button
                size="sm"
                loading={updateMutation.isPending}
                onClick={() => updateMutation.mutate({ pricePerKwh: parseFloat(priceKwh) })}
                disabled={!priceKwh}
              >
                Sauvegarder
              </Button>
            </div>
          </div>

          <div>
            <label className="stat-label block mb-1">Distance minimale d un trajet (km)</label>
            <div className="flex gap-2">
              <input
                type="number"
                step="0.1"
                min="0"
                max="200"
                className="bg-bg-overlay border border-border rounded-lg px-3 py-2 text-sm text-text-primary w-32"
                placeholder={s?.['minTripDistanceKm']?.toString() ?? '0.0'}
                value={minTripDistanceKm}
                onChange={(e) => setMinTripDistanceKm(e.target.value)}
              />
              <Button
                size="sm"
                loading={updateMutation.isPending}
                onClick={() => updateMutation.mutate({ minTripDistanceKm: parseFloat(minTripDistanceKm) })}
                disabled={!minTripDistanceKm}
              >
                Sauvegarder
              </Button>
            </div>
          </div>

          <div>
            <label className="stat-label block mb-1">Affichage initial trajets / recharges</label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <input
                type="number"
                min="1"
                max="200"
                className="bg-bg-overlay border border-border rounded-lg px-3 py-2 text-sm text-text-primary"
                placeholder={s?.['tripsInitialDisplayCount']?.toString() ?? '10'}
                value={tripsInitialDisplayCount}
                onChange={(e) => setTripsInitialDisplayCount(e.target.value)}
              />
              <input
                type="number"
                min="1"
                max="200"
                className="bg-bg-overlay border border-border rounded-lg px-3 py-2 text-sm text-text-primary"
                placeholder={s?.['chargesInitialDisplayCount']?.toString() ?? '10'}
                value={chargesInitialDisplayCount}
                onChange={(e) => setChargesInitialDisplayCount(e.target.value)}
              />
            </div>
            <div className="flex gap-2 mt-2">
              <Button
                size="sm"
                loading={updateMutation.isPending}
                onClick={() => updateMutation.mutate({
                  tripsInitialDisplayCount: Number(tripsInitialDisplayCount),
                  chargesInitialDisplayCount: Number(chargesInitialDisplayCount),
                })}
                disabled={!tripsInitialDisplayCount || !chargesInitialDisplayCount}
              >
                Sauvegarder seuil affichage
              </Button>
            </div>
          </div>

          <div className="rounded-lg border border-border-subtle bg-bg-overlay/40 p-3 space-y-3">
            <p className="text-sm font-medium text-text-primary">Seuils diagnostics</p>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="stat-label block mb-1">Fraicheur warning (min)</label>
                <input
                  type="number"
                  min="1"
                  max="180"
                  className="w-full bg-bg-overlay border border-border rounded-lg px-3 py-2 text-sm text-text-primary"
                  value={diagFreshnessWarnMin}
                  onChange={(e) => setDiagFreshnessWarnMin(e.target.value)}
                />
              </div>
              <div>
                <label className="stat-label block mb-1">Fraicheur critique (min)</label>
                <input
                  type="number"
                  min="2"
                  max="360"
                  className="w-full bg-bg-overlay border border-border rounded-lg px-3 py-2 text-sm text-text-primary"
                  value={diagFreshnessCriticalMin}
                  onChange={(e) => setDiagFreshnessCriticalMin(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="stat-label block mb-1">Ecart batterie warning (pts)</label>
                <input
                  type="number"
                  min="0.1"
                  max="20"
                  step="0.1"
                  className="w-full bg-bg-overlay border border-border rounded-lg px-3 py-2 text-sm text-text-primary"
                  value={diagBatteryDeltaWarnPct}
                  onChange={(e) => setDiagBatteryDeltaWarnPct(e.target.value)}
                />
              </div>
              <div>
                <label className="stat-label block mb-1">Ecart batterie critique (pts)</label>
                <input
                  type="number"
                  min="0.2"
                  max="30"
                  step="0.1"
                  className="w-full bg-bg-overlay border border-border rounded-lg px-3 py-2 text-sm text-text-primary"
                  value={diagBatteryDeltaCriticalPct}
                  onChange={(e) => setDiagBatteryDeltaCriticalPct(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="stat-label block mb-1">Idle warning (h/7j)</label>
                <input
                  type="number"
                  min="0"
                  max="168"
                  step="0.1"
                  className="w-full bg-bg-overlay border border-border rounded-lg px-3 py-2 text-sm text-text-primary"
                  value={diagIdleWarnHours7d}
                  onChange={(e) => setDiagIdleWarnHours7d(e.target.value)}
                />
              </div>
              <div>
                <label className="stat-label block mb-1">Idle critique (h/7j)</label>
                <input
                  type="number"
                  min="0"
                  max="168"
                  step="0.1"
                  className="w-full bg-bg-overlay border border-border rounded-lg px-3 py-2 text-sm text-text-primary"
                  value={diagIdleCriticalHours7d}
                  onChange={(e) => setDiagIdleCriticalHours7d(e.target.value)}
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Button
                size="sm"
                loading={updateMutation.isPending}
                onClick={() => updateMutation.mutate({
                  diagnosticsFreshnessWarnMin: Number(diagFreshnessWarnMin),
                  diagnosticsFreshnessCriticalMin: Number(diagFreshnessCriticalMin),
                  diagnosticsBatteryDeltaWarnPct: Number(diagBatteryDeltaWarnPct),
                  diagnosticsBatteryDeltaCriticalPct: Number(diagBatteryDeltaCriticalPct),
                  diagnosticsIdleWarnHours7d: Number(diagIdleWarnHours7d),
                  diagnosticsIdleCriticalHours7d: Number(diagIdleCriticalHours7d),
                })}
              >
                Sauvegarder les seuils diagnostics
              </Button>
            </div>
          </div>

          <div>
            <label className="stat-label block mb-2">Mode éco API</label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                className="w-4 h-4 rounded accent-accent-500"
                defaultChecked={s?.['ecoModeEnabled'] as boolean ?? true}
                onChange={(e) => updateMutation.mutate({ ecoModeEnabled: e.target.checked })}
              />
              <span className="text-sm text-text-secondary">Limiter les appels Tesla API (recommandé)</span>
            </label>
          </div>
        </div>
      </Card>

      {/* Tesla Configuration */}
      <TeslaSettingsSection />

      {/* Menu customisation */}
      <Card>
        <CardHeader><CardTitle>Menu et navigation</CardTitle></CardHeader>
        <div className="space-y-3">
          <p className="text-sm text-text-muted">Choisis l'ordre, l'icône et la visibilité de chaque entrée. Les changements sont appliqués immédiatement, et tu peux aussi forcer la sauvegarde avec le bouton dédié.</p>

          {menuItems.map((item, index) => {
            const selectedIcon = MENU_ICON_REGISTRY[item.iconName as keyof typeof MENU_ICON_REGISTRY]
            const SelectedIcon = selectedIcon.icon
            return (
              <div
                key={item.key}
                draggable
                onDragStart={(event) => {
                  setDraggedMenuKey(item.key)
                  event.dataTransfer.setData('text/plain', item.key)
                  event.dataTransfer.effectAllowed = 'move'
                }}
                onDragOver={(event) => {
                  event.preventDefault()
                  event.dataTransfer.dropEffect = 'move'
                  setDragOverMenuKey(item.key)
                }}
                onDrop={(event) => {
                  event.preventDefault()
                  const sourceKey = (event.dataTransfer.getData('text/plain') as NavItemKey) || draggedMenuKey
                  if (sourceKey) {
                    moveMenuItemToTarget(sourceKey, item.key)
                  }
                  setDraggedMenuKey(null)
                  setDragOverMenuKey(null)
                }}
                onDragEnd={() => {
                  setDraggedMenuKey(null)
                  setDragOverMenuKey(null)
                }}
                className={[
                  'grid grid-cols-1 md:grid-cols-[1fr_220px_auto] gap-3 items-center rounded-lg border bg-bg-overlay/40 px-3 py-3 transition-colors',
                  dragOverMenuKey === item.key ? 'border-accent-500/60' : 'border-border-subtle',
                  draggedMenuKey === item.key ? 'opacity-70' : '',
                ].join(' ')}
              >
                <div className="flex items-center gap-2 text-sm text-text-secondary">
                  <GripVertical size={15} className="text-text-muted cursor-grab" />
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      className="h-7 w-7 inline-flex items-center justify-center rounded border border-border-subtle text-text-secondary hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed"
                      onClick={() => moveMenuItem(item.key, 'up')}
                      disabled={index === 0}
                      title="Monter"
                    >
                      <ArrowUp size={13} />
                    </button>
                    <button
                      type="button"
                      className="h-7 w-7 inline-flex items-center justify-center rounded border border-border-subtle text-text-secondary hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed"
                      onClick={() => moveMenuItem(item.key, 'down')}
                      disabled={index === menuItems.length - 1}
                      title="Descendre"
                    >
                      <ArrowDown size={13} />
                    </button>
                  </div>
                  <SelectedIcon size={15} className="text-text-primary" />
                  <span>{item.label}</span>
                </div>

                <select
                  className="w-full bg-bg-overlay border border-border rounded-lg px-3 py-2 text-sm text-text-primary"
                  value={item.iconName}
                  onChange={(e) => updateMenuIcon(item.key as keyof NavPreferences['iconByKey'], e.target.value as keyof typeof MENU_ICON_REGISTRY)}
                >
                  {Object.entries(MENU_ICON_REGISTRY).map(([value, cfg]) => (
                    <option key={value} value={value}>{cfg.label}</option>
                  ))}
                </select>

                <label className="inline-flex items-center gap-2 text-sm text-text-secondary justify-self-start md:justify-self-end">
                  <input
                    type="checkbox"
                    checked={!item.hidden}
                    onChange={(e) => updateMenuVisibility(item.key as keyof NavPreferences['iconByKey'], e.target.checked)}
                    className="w-4 h-4 rounded accent-accent-500"
                  />
                  Visible
                </label>
              </div>
            )
          })}

          <div className="flex flex-wrap items-center justify-end gap-2">
            {menuSavedAt && <p className="text-xs text-success mr-auto">Menu appliqué à {menuSavedAt}</p>}
            <Button size="sm" variant="ghost" onClick={resetMenuPreferences}>Réinitialiser le menu</Button>
            <Button size="sm" onClick={saveMenuPreferences}>Sauvegarder le menu</Button>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader><CardTitle>TeslaMate (Backend)</CardTitle></CardHeader>
        {isLoadingTeslamate ? (
          <p className="text-sm text-text-muted">Chargement...</p>
        ) : (
          <div className="space-y-4">
            {(() => {
              const ts = teslamateStatus as TeslamateSettingsStatus | undefined
              if (!ts) return null
              return ts.configured ? (
                <div className="rounded-lg border border-success/30 bg-success/10 p-3 text-xs text-success">
                  Configuration TeslaMate complete.
                </div>
              ) : (
                <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-text-secondary">
                  TeslaMate non configure completement (optionnel). Variables manquantes: {ts.requiredMissing.join(', ')}
                </div>
              )
            })()}

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                className="w-4 h-4 rounded accent-accent-500"
                checked={Boolean(teslamateForm.backendOnly)}
                onChange={(e) => setTeslamateForm((f) => ({ ...f, backendOnly: e.target.checked }))}
              />
              <span className="text-sm text-text-secondary">Mode backend uniquement (recommandé)</span>
            </label>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="stat-label block mb-1">TESLAMATE_DB_NAME</label>
                <input
                  className="w-full bg-bg-overlay border border-border rounded-lg px-3 py-2 text-sm text-text-primary"
                  value={teslamateForm.dbName ?? ''}
                  onChange={(e) => setTeslamateForm((f) => ({ ...f, dbName: e.target.value }))}
                />
              </div>
              <div>
                <label className="stat-label block mb-1">TESLAMATE_DB_USER</label>
                <input
                  className="w-full bg-bg-overlay border border-border rounded-lg px-3 py-2 text-sm text-text-primary"
                  value={teslamateForm.dbUser ?? ''}
                  onChange={(e) => setTeslamateForm((f) => ({ ...f, dbUser: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="stat-label block mb-1">TESLAMATE_PORT</label>
                <input
                  type="number"
                  className="w-full bg-bg-overlay border border-border rounded-lg px-3 py-2 text-sm text-text-primary"
                  value={teslamateForm.port ?? 4000}
                  onChange={(e) => setTeslamateForm((f) => ({ ...f, port: Number(e.target.value) }))}
                />
              </div>
              <div>
                <label className="stat-label block mb-1">TESLAMATE_GRAFANA_PORT</label>
                <input
                  type="number"
                  className="w-full bg-bg-overlay border border-border rounded-lg px-3 py-2 text-sm text-text-primary"
                  value={teslamateForm.grafanaPort ?? 3002}
                  onChange={(e) => setTeslamateForm((f) => ({ ...f, grafanaPort: Number(e.target.value) }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="stat-label block mb-1">TESLAMATE_DB_PASSWORD</label>
                <input
                  type="password"
                  className="w-full bg-bg-overlay border border-border rounded-lg px-3 py-2 text-sm text-text-primary"
                  placeholder="minimum 8 caracteres"
                  onChange={(e) => setTeslamateForm((f) => ({ ...f, dbPassword: e.target.value }))}
                />
              </div>
              <div>
                <label className="stat-label block mb-1">TESLAMATE_ENCRYPTION_KEY</label>
                <input
                  type="password"
                  className="w-full bg-bg-overlay border border-border rounded-lg px-3 py-2 text-sm text-text-primary"
                  placeholder="64 caracteres hex"
                  onChange={(e) => setTeslamateForm((f) => ({ ...f, encryptionKey: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="stat-label block mb-1">TESLAMATE_GRAFANA_USER</label>
                <input
                  className="w-full bg-bg-overlay border border-border rounded-lg px-3 py-2 text-sm text-text-primary"
                  value={teslamateForm.grafanaUser ?? ''}
                  onChange={(e) => setTeslamateForm((f) => ({ ...f, grafanaUser: e.target.value }))}
                />
              </div>
              <div>
                <label className="stat-label block mb-1">TESLAMATE_GRAFANA_PASSWORD</label>
                <input
                  type="password"
                  className="w-full bg-bg-overlay border border-border rounded-lg px-3 py-2 text-sm text-text-primary"
                  placeholder="minimum 8 caracteres"
                  onChange={(e) => setTeslamateForm((f) => ({ ...f, grafanaPassword: e.target.value }))}
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                loading={updateTeslamateMutation.isPending}
                onClick={() => updateTeslamateMutation.mutate(teslamateForm)}
              >
                Sauvegarder la config TeslaMate
              </Button>
              <Button
                size="sm"
                variant="secondary"
                loading={testTeslamateConnectionMutation.isPending}
                onClick={() =>
                  testTeslamateConnectionMutation.mutate({
                    dbName: teslamateForm.dbName,
                    dbUser: teslamateForm.dbUser,
                    dbPassword: teslamateForm.dbPassword,
                  })
                }
              >
                Tester la connexion
              </Button>
              {updateTeslamateMutation.isSuccess && (
                <p className="text-xs text-success">Configuration enregistree.</p>
              )}
            </div>

            {teslamateTestResult && (
              <div className={`rounded-lg border p-3 text-xs ${teslamateTestResult.connected
                ? 'border-success/30 bg-success/10 text-success'
                : 'border-error/30 bg-error/10 text-text-secondary'}`}>
                <p className="font-medium mb-1">
                  {teslamateTestResult.connected ? 'Connexion TeslaMate OK' : `Connexion TeslaMate KO (${teslamateTestResult.code})`}
                </p>
                <p>{teslamateTestResult.message}</p>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Geofences - Known Locations */}
      <GeofencesSection />

      {/* Diagnostics */}
      <Card>
        <CardHeader><CardTitle>Diagnostics système</CardTitle></CardHeader>
        {d?.['services'] ? (
          <div>
            <ServiceStatus label="Base de données (PostgreSQL)" status={(d['services'] as Record<string, unknown>)['db']} />
            <ServiceStatus label="Cache (Redis)" status={(d['services'] as Record<string, unknown>)['redis']} />
            <ServiceStatus label="MQTT Broker" status={(d['services'] as Record<string, unknown>)['mqtt']} />
          </div>
        ) : <p className="text-sm text-text-muted">Chargement...</p>}
      </Card>

      {/* API Usage */}
      <Card>
        <CardHeader><CardTitle>Usage API Tesla</CardTitle></CardHeader>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="stat-label">Aujourd'hui</p>
            <p className="stat-value">{au?.['todayCount'] ?? '—'}</p>
          </div>
          <div>
            <p className="stat-label">Total</p>
            <p className="stat-value">{au?.['totalCount'] ?? '—'}</p>
          </div>
        </div>
      </Card>
    </div>
  )
}
