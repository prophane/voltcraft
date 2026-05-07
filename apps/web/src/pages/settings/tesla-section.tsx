import { useEffect, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useLocation } from 'react-router-dom'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api-client'
import { diagnosticsApi } from '@/features/vehicle/api'
import { AlertCircle, CheckCircle2, Zap } from 'lucide-react'

type TeslaRegion = 'na' | 'eu' | 'cn'

interface TeslaConnectionStatus {
  connected: boolean
  tokenConfigured: boolean
  accountConfigured: boolean
  region: TeslaRegion
  dbVehicleCount: number
  apiVehicleCount?: number
  apiReachable: boolean
  httpStatus?: number
  error?: string
}

export function TeslaSettingsSection() {
  const location = useLocation()
  const [teslaToken, setTeslaToken] = useState('')
  const [teslaRegion, setTeslaRegion] = useState<TeslaRegion>('na')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const {
    data: teslaHealth,
    refetch: refetchTeslaHealth,
    isFetching: isCheckingTeslaHealth,
  } = useQuery({
    queryKey: ['diagnostics', 'tesla-connection'],
    queryFn: diagnosticsApi.teslaConnection,
    retry: false,
  })

  // Load current Tesla config
  const { data: teslaConfig } = useQuery({
    queryKey: ['tesla-config'],
    queryFn: async () => {
      try {
        const res = await api.get<{ token: string; region: string }>('/settings/tesla')
        return res
      } catch {
        return null
      }
    },
  })

  useEffect(() => {
    if (!teslaConfig) return
    setTeslaToken(teslaConfig.token ?? '')
    if (teslaConfig.region === 'na' || teslaConfig.region === 'eu' || teslaConfig.region === 'cn') {
      setTeslaRegion(teslaConfig.region)
    }
  }, [teslaConfig])

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const oauthState = params.get('tesla_oauth')
    const reason = params.get('reason')

    if (oauthState === 'success') {
      setSuccess(true)
      setError(null)
      setTimeout(() => setSuccess(false), 4000)
    } else if (oauthState === 'error') {
      setSuccess(false)
      setError(reason ? decodeURIComponent(reason) : 'Tesla OAuth connection failed')
    }
  }, [location.search])

  // Update Tesla config
  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!teslaToken.trim()) {
        throw new Error('Tesla token is required')
      }
      await api.post('/settings/tesla', {
        token: teslaToken,
        region: teslaRegion,
      })
    },
    onSuccess: () => {
      setSuccess(true)
      setError(null)
      setTimeout(() => setSuccess(false), 3000)
    },
    onError: (err: Error) => {
      setError(err.message)
      setSuccess(false)
    },
  })

  const handleSave = async () => {
    updateMutation.mutate()
  }

  return (
    <Card className="p-6 space-y-6">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Zap size={20} className="text-accent-500" />
          <CardTitle>Tesla Configuration</CardTitle>
        </div>
      </CardHeader>

      <div className="space-y-4">
        <div className="rounded-lg border border-border bg-bg-overlay/40 p-3 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-text-primary">Validation connexion API Tesla</p>
            <Button size="sm" variant="secondary" onClick={() => refetchTeslaHealth()} loading={isCheckingTeslaHealth}>
              Tester la connexion
            </Button>
          </div>

          {teslaHealth ? (
            <div className="space-y-1 text-xs text-text-secondary">
              <p>
                Statut: {teslaHealth.connected ? <span className="text-success">Connecté</span> : <span className="text-error">Non connecté</span>}
              </p>
              <p>Token configuré: {teslaHealth.tokenConfigured ? 'oui' : 'non'}</p>
              <p>Compte Tesla en base: {teslaHealth.accountConfigured ? 'oui' : 'non'}</p>
              <p>Région: {teslaHealth.region?.toUpperCase?.() ?? 'N/A'}</p>
              <p>Véhicules en base: {teslaHealth.dbVehicleCount ?? 0}</p>
              <p>Véhicules vus par l'API Tesla: {teslaHealth.apiVehicleCount ?? 0}</p>
              {!teslaHealth.connected && teslaHealth.error && (
                <p className="text-error">Détail erreur: {teslaHealth.error}</p>
              )}
            </div>
          ) : (
            <p className="text-xs text-text-muted">Aucun diagnostic disponible pour le moment.</p>
          )}
        </div>

        {/* Token Input */}
        <div>
          <label className="stat-label block mb-1.5">Bearer Token</label>
          <textarea
            value={teslaToken}
            onChange={(e) => setTeslaToken(e.target.value)}
            placeholder="eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
            className="w-full bg-bg-overlay border border-border rounded-lg px-3 py-2.5 text-sm text-text-primary focus:border-accent-500 focus:ring-1 focus:ring-accent-500 outline-none font-mono"
            rows={6}
          />
          <p className="text-xs text-text-muted mt-1">
            Get your token from{' '}
            <a href="https://developer.tesla.com" target="_blank" rel="noopener noreferrer" className="text-accent-500 hover:underline">
              Tesla Developer Portal
            </a>
          </p>
        </div>

        {/* Region Select */}
        <div>
          <label className="stat-label block mb-1.5">Region</label>
          <select
            value={teslaRegion}
            onChange={(e) => setTeslaRegion(e.target.value as TeslaRegion)}
            className="w-full bg-bg-overlay border border-border rounded-lg px-3 py-2.5 text-sm text-text-primary focus:border-accent-500 focus:ring-1 focus:ring-accent-500 outline-none"
          >
            <option value="na">North America</option>
            <option value="eu">Europe</option>
            <option value="cn">China</option>
          </select>
        </div>

        <div className="pt-1">
          <p className="text-xs text-text-muted mb-2">
            Prefer automatic flow: connect Voltcraft directly to your Tesla account via OAuth.
          </p>
          <a
            href="/api/auth/tesla/connect?returnTo=/settings"
            className="inline-flex items-center justify-center w-full rounded-lg border border-border px-3 py-2.5 text-sm font-medium text-text-primary hover:bg-bg-overlay transition-colors"
          >
            Connect With Tesla OAuth
          </a>
        </div>

        {/* Status Messages */}
        {error && (
          <div className="bg-error/10 border border-error/30 rounded-lg p-3 flex gap-2">
            <AlertCircle size={16} className="text-error flex-shrink-0 mt-0.5" />
            <p className="text-sm text-error">{error}</p>
          </div>
        )}

        {success && (
          <div className="bg-success/10 border border-success/30 rounded-lg p-3 flex gap-2">
            <CheckCircle2 size={16} className="text-success flex-shrink-0 mt-0.5" />
            <p className="text-sm text-success">Configuration saved successfully!</p>
          </div>
        )}

        {/* Save Button */}
        <Button
          onClick={handleSave}
          disabled={updateMutation.isPending || !teslaToken.trim()}
          className="w-full"
        >
          {updateMutation.isPending ? 'Saving...' : 'Save Tesla Configuration'}
        </Button>
      </div>
    </Card>
  )
}
