import { useEffect, useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useLocation, useNavigate } from 'react-router-dom'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { diagnosticsApi, settingsApi } from '@/features/vehicle/api'
import type { TeslaConnectionStatus, TeslaOAuthConfig } from '@/features/vehicle/api'
import { AlertCircle, CheckCircle2, Zap, ChevronDown, ChevronUp } from 'lucide-react'

export function TeslaSettingsSection() {
  const location = useLocation()
  const navigate = useNavigate()
  const [testResult, setTestResult] = useState<TeslaConnectionStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [showOAuthForm, setShowOAuthForm] = useState(false)
  const [oauthForm, setOAuthForm] = useState<TeslaOAuthConfig>({
    clientId: '',
    clientSecret: '',
    redirectUri: '',
    region: 'eu',
  })
  const [oauthSaveSuccess, setOAuthSaveSuccess] = useState(false)

  const {
    data: teslaHealth,
    refetch: refetchTeslaHealth,
    isFetching: isLoadingStoredHealth,
  } = useQuery({
    queryKey: ['diagnostics', 'tesla-connection'],
    queryFn: diagnosticsApi.teslaConnection,
    retry: false,
  })

  const oauthMutation = useMutation({
    mutationFn: (data: TeslaOAuthConfig) => settingsApi.updateTeslaOAuth(data),
    onSuccess: () => {
      setOAuthSaveSuccess(true)
      setShowOAuthForm(false)
      setTimeout(() => setOAuthSaveSuccess(false), 4000)
      void refetchTeslaHealth()
    },
  })

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const oauthState = params.get('tesla_oauth')
    const reason = params.get('reason')

    if (!oauthState) {
      return
    }

    if (oauthState === 'success') {
      setSuccess(true)
      setError(null)
      setTimeout(() => setSuccess(false), 4000)
      void refetchTeslaHealth()
    } else if (oauthState === 'error') {
      setSuccess(false)
      setError(reason ? decodeURIComponent(reason) : 'Tesla OAuth connection failed')
    }

    void navigate(location.pathname, { replace: true })
  }, [location.pathname, location.search, navigate, refetchTeslaHealth])

  const displayedHealth = testResult ?? teslaHealth
  const oauthConnectUrl = `/api/auth/tesla/connect?returnTo=${encodeURIComponent('/settings')}`
  const teslaDeveloperPortalUrl = 'https://developer.tesla.com/'

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
                setError(null)
                try {
                  const result = await refetchTeslaHealth()
                  setTestResult((result.data ?? null) as TeslaConnectionStatus | null)
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
          {/* OAuth config collapsible form */}
          <button
            type="button"
            className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary mb-2"
            onClick={() => setShowOAuthForm((v) => !v)}
          >
            {showOAuthForm ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            Modifier la configuration OAuth (Client ID / Secret)
          </button>

          {showOAuthForm && (
            <form
              className="space-y-3 mb-4 p-3 rounded-lg border border-border bg-bg-overlay/40"
              onSubmit={(e) => {
                e.preventDefault()
                oauthMutation.mutate(oauthForm)
              }}
            >
              <div className="space-y-1">
                <label className="text-xs text-text-secondary">Tesla Client ID</label>
                <input
                  className="w-full rounded border border-border bg-bg-base px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-500"
                  value={oauthForm.clientId}
                  onChange={(e) => setOAuthForm((f) => ({ ...f, clientId: e.target.value }))}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  autoComplete="off"
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-text-secondary">Tesla Client Secret</label>
                <input
                  type="password"
                  className="w-full rounded border border-border bg-bg-base px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-500"
                  value={oauthForm.clientSecret}
                  onChange={(e) => setOAuthForm((f) => ({ ...f, clientSecret: e.target.value }))}
                  placeholder="ta-xxxxxxxxxxxxxxxxxxxx"
                  autoComplete="new-password"
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-text-secondary">Redirect URI</label>
                <input
                  className="w-full rounded border border-border bg-bg-base px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-500"
                  value={oauthForm.redirectUri}
                  onChange={(e) => setOAuthForm((f) => ({ ...f, redirectUri: e.target.value }))}
                  placeholder="https://voltcraft.ph4.fr/api/auth/tesla/callback"
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-text-secondary">Région</label>
                <select
                  className="w-full rounded border border-border bg-bg-base px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-500"
                  value={oauthForm.region}
                  onChange={(e) => setOAuthForm((f) => ({ ...f, region: e.target.value as 'na' | 'eu' | 'cn' }))}
                >
                  <option value="eu">EU (Europe)</option>
                  <option value="na">NA (Amérique du Nord)</option>
                  <option value="cn">CN (Chine)</option>
                </select>
              </div>
              {oauthMutation.isError && (
                <p className="text-xs text-error">Erreur lors de la sauvegarde: {(oauthMutation.error as Error).message}</p>
              )}
              <div className="flex gap-2">
                <Button type="submit" size="sm" loading={oauthMutation.isPending}>
                  Enregistrer
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setShowOAuthForm(false)}>
                  Annuler
                </Button>
              </div>
            </form>
          )}

          {oauthSaveSuccess && (
            <div className="bg-success/10 border border-success/30 rounded-lg p-2 flex gap-2 mb-3">
              <CheckCircle2 size={14} className="text-success flex-shrink-0 mt-0.5" />
              <p className="text-xs text-success">Configuration OAuth enregistrée. Tu peux maintenant te connecter.</p>
            </div>
          )}

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

        {displayedHealth?.partnerRegistrationRequired && (
          <div className="bg-warning/10 border border-warning/30 rounded-lg p-3 space-y-2">
            <p className="text-sm font-medium text-text-primary">Étape restante côté Tesla Developer</p>
            <p className="text-sm text-text-secondary">
              L&apos;OAuth utilisateur fonctionne. Le blocage restant est l&apos;enregistrement partner Fleet de ton application pour la région EU.
            </p>
            <p className="text-sm text-text-secondary">
              1. Vérifie que cette URL répond publiquement: {displayedHealth.partnerPublicKeyUrl ?? 'URL de clé partner indisponible'}
            </p>
            <p className="text-sm text-text-secondary">
              2. Ouvre le portail Tesla Developer et finalise la registration partner pour le domaine public de Voltcraft.
            </p>
            <a
              href={teslaDeveloperPortalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-accent-500 hover:underline"
            >
              Ouvrir Tesla Developer
            </a>
          </div>
        )}

        {/* Status Messages */}
        {error && !displayedHealth?.partnerRegistrationRequired && (
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
