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

  const [registerPartnerResult, setRegisterPartnerResult] = useState<{ ok: boolean; message: string } | null>(null)

  const oauthMutation = useMutation({
    mutationFn: (data: TeslaOAuthConfig) => settingsApi.updateTeslaOAuth(data),
    onSuccess: () => {
      setOAuthSaveSuccess(true)
      setShowOAuthForm(false)
      setTimeout(() => setOAuthSaveSuccess(false), 4000)
      void refetchTeslaHealth()
    },
  })

  const registerPartnerMutation = useMutation({
    mutationFn: (domain: string) => settingsApi.registerTeslaPartner(domain),
    onSuccess: (data) => {
      const msg = (data as { data?: { message?: string } })?.data?.message ?? 'Partner enregistré avec succès.'
      setRegisterPartnerResult({ ok: true, message: msg })
      void refetchTeslaHealth()
    },
    onError: (err) => {
      setRegisterPartnerResult({ ok: false, message: err instanceof Error ? err.message : 'Erreur inconnue' })
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

        {/* Virtual key installation — required for commands on recent vehicles */}
        {displayedHealth?.virtualKeyInstallUrl && displayedHealth.connected && (
          <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 space-y-2">
            <p className="text-sm font-medium text-text-primary">⚠️ Clé virtuelle — étape requise pour les commandes</p>
            <p className="text-xs text-text-secondary">
              Tesla exige qu'une <strong>clé virtuelle</strong> de l'application soit installée sur le véhicule
              pour autoriser les commandes (verrou, climatisation, charge…). Cette installation se fait
              une seule fois depuis le téléphone lié au véhicule.
            </p>
            <ol className="text-xs text-text-secondary space-y-1 list-decimal list-inside">
              <li>Ouvre ce lien sur ton téléphone (avec l'appli Tesla installée)</li>
              <li>Accepte l'ajout de la clé de l'application Voltcraft</li>
              <li>Confirme sur l'écran tactile du véhicule si demandé</li>
            </ol>
            <a
              href={displayedHealth.virtualKeyInstallUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block mt-1 rounded-lg bg-warning/20 border border-warning/40 px-3 py-2 text-xs font-medium text-text-primary hover:bg-warning/30 transition-colors break-all"
            >
              🔑 {displayedHealth.virtualKeyInstallUrl}
            </a>
          </div>
        )}

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

        {/* Partner registration block — shown when OAuth works but partner not registered */}
        {displayedHealth?.partnerRegistrationRequired && (
          <div className="bg-warning/10 border border-warning/30 rounded-lg p-3 space-y-3">
            <p className="text-sm font-medium text-text-primary">Enregistrement Partner Fleet requis</p>
            <p className="text-xs text-text-secondary">
              L'OAuth utilisateur fonctionne. Tesla exige que ton application soit enregistrée comme partenaire Fleet pour pouvoir accéder aux véhicules.
              Cette étape est automatique — elle appelle <code className="text-accent-400">POST /api/1/partner_accounts</code> avec un token applicatif.
            </p>
            {displayedHealth.partnerPublicKeyUrl && (
              <p className="text-xs text-text-muted">
                Clé publique servie sur: <a href={displayedHealth.partnerPublicKeyUrl} target="_blank" rel="noopener noreferrer" className="text-accent-500 hover:underline break-all">{displayedHealth.partnerPublicKeyUrl}</a>
              </p>
            )}

            {registerPartnerResult && (
              <div className={`rounded p-2 flex gap-2 text-xs ${registerPartnerResult.ok ? 'bg-success/10 text-success' : 'bg-error/10 text-error'}`}>
                {registerPartnerResult.ok
                  ? <CheckCircle2 size={13} className="flex-shrink-0 mt-0.5" />
                  : <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />}
                {registerPartnerResult.message}
              </div>
            )}

            <Button
              size="sm"
              variant="secondary"
              loading={registerPartnerMutation.isPending}
              onClick={() => {
                setRegisterPartnerResult(null)
                registerPartnerMutation.mutate(window.location.hostname)
              }}
            >
              Enregistrer le partner Tesla Fleet
            </Button>
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
