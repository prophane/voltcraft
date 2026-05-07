import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { settingsApi, diagnosticsApi } from '@/features/vehicle/api'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useState } from 'react'
import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'
import { TeslaSettingsSection } from './tesla-section'

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

  const s = settings as Record<string, unknown> | undefined
  const d = diag as Record<string, unknown> | undefined
  const au = apiUsage as Record<string, number> | undefined

  const [priceKwh, setPriceKwh] = useState<string>('')

  const updateMutation = useMutation({
    mutationFn: (data: unknown) => settingsApi.update(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  })

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
