import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useLocation } from 'react-router-dom'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { diagnosticsApi } from '@/features/vehicle/api'
import type { TeslaConnectionStatus } from '@/features/vehicle/api'
import { AlertCircle, CheckCircle2, Zap } from 'lucide-react'

export function TeslaSettingsSection() {
  const location = useLocation()
  const [testResult, setTestResult] = useState<TeslaConnectionStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const {
    data: teslaHealth,
    refetch: refetchTeslaHealth,
    isFetching: isLoadingStoredHealth,
  } = useQuery({
    queryKey: ['diagnostics', 'tesla-connection'],
    queryFn: diagnosticsApi.teslaConnection,
    retry: false,
  })

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const oauthState = params.get('tesla_oauth')
    const reason = params.get('reason')

    if (oauthState === 'success') {
      setSuccess(true)
      setError(null)
      setTimeout(() => setSuccess(false), 4000)
      void refetchTeslaHealth()
    } else if (oauthState === 'error') {
      setSuccess(false)
      setError(reason ? decodeURIComponent(reason) : 'Tesla OAuth connection failed')
    }
  }, [location.search, refetchTeslaHealth])

  const displayedHealth = testResult ?? teslaHealth
  const oauthConnectUrl = `/api/auth/tesla/connect?returnTo=${encodeURIComponent('/settings')}`

  const handleConnectOAuth = () => {
    window.location.assign(oauthConnectUrl)
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
            <Button
              size="sm"
              variant="secondary"
              onClick={async () => {
                try {
                  const result = await refetchTeslaHealth()
                  setTestResult((result.data ?? null) as TeslaConnectionStatus | null)
                  setError(null)
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Tesla connection test failed')
                }
              }}
              loading={isLoadingStoredHealth}
            >
              Tester la connexion
            </Button>
          </div>

          {displayedHealth ? (
            <div className="space-y-1 text-xs text-text-secondary">
              <p>
                Statut: {displayedHealth.connected ? <span className="text-success">Connecté</span> : <span className="text-error">Non connecté</span>}
              </p>
              <p>OAuth configure: {displayedHealth.oauthConfigured ? 'oui' : 'non'}</p>
              <p>Compte Tesla en base: {displayedHealth.accountConfigured ? 'oui' : 'non'}</p>
              <p>Région: {displayedHealth.region?.toUpperCase?.() ?? 'N/A'}</p>
              <p>Clé partner Tesla: {displayedHealth.partnerPublicKeyConfigured ? 'oui' : 'non'}</p>
              {displayedHealth.partnerPublicKeyUrl && <p>URL clé partner: {displayedHealth.partnerPublicKeyUrl}</p>}
              <p>Véhicules en base: {displayedHealth.dbVehicleCount ?? 0}</p>
              <p>Véhicules vus par l'API Tesla: {displayedHealth.apiVehicleCount ?? 0}</p>
              {!displayedHealth.connected && displayedHealth.error && (
                <p className="text-error">Détail erreur: {displayedHealth.error}</p>
              )}
            </div>
          ) : (
            <p className="text-xs text-text-muted">Clique sur "Tester la connexion" pour verifier la connexion OAuth Fleet.</p>
          )}
        </div>

        <div className="pt-1">
          <p className="text-xs text-text-muted mb-2">
            OAuth Fleet only: connect Voltcraft directly to your Tesla account.
          </p>
          <Button
            variant="secondary"
            className="w-full"
            onClick={handleConnectOAuth}
          >
            Connect With Tesla OAuth
          </Button>
          <p className="text-[11px] text-text-muted mt-2 break-all">If click fails, open directly: {oauthConnectUrl}</p>
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
            <p className="text-sm text-success">Tesla OAuth account connected successfully.</p>
          </div>
        )}
      </div>
    </Card>
  )
}
