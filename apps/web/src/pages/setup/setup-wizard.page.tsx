import { useState, useEffect } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/features/auth/store'
import { api } from '@/lib/api-client'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Zap, CheckCircle2, ArrowRight } from 'lucide-react'

type Step = 'admin' | 'tesla' | 'optional' | 'complete'
type TeslaRegion = 'na' | 'eu' | 'cn'

interface SetupWizardPageProps {
  onSetupComplete?: () => void
}

export function SetupWizardPage({ onSetupComplete }: SetupWizardPageProps) {
  const navigate = useNavigate()
  const setUser = useAuthStore((s) => s.setUser)
  const [authDisabled, setAuthDisabled] = useState(false)
  const [loadingConfig, setLoadingConfig] = useState(true)
  const [step, setStep] = useState<Step>('admin')
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    passwordConfirm: '',
    teslaToken: '', // Single bearer token field
    teslaRegion: 'na' as TeslaRegion,
    mqttEnabled: false,
  })
  const [error, setError] = useState<string | null>(null)

  // Load config on mount to detect AUTH_DISABLED
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const config = await api.get<{ authDisabled: boolean; setupRequired: boolean }>('/config')
        setAuthDisabled(config.authDisabled ?? false)
        // If auth disabled, skip directly to Tesla setup
        if (config.authDisabled) {
          setStep('tesla')
        }
      } catch (err) {
        console.error('Failed to load config:', err)
        setAuthDisabled(false)
      } finally {
        setLoadingConfig(false)
      }
    }
    loadConfig()
  }, [])

  const setupMutation = useMutation({
    mutationFn: async () => {
      // If auth disabled, only send Tesla token
      if (authDisabled) {
        await api.post<{ success: true }>('/auth/setup', {
          teslaToken: formData.teslaToken,
          teslaRegion: formData.teslaRegion,
        })
        return { success: true as const }
      }
      // Otherwise, send full setup payload with admin account
      const response = await api.post<{ user: { id: string; email: string; name: string }; session: { token: string } }>(
        '/auth/setup',
        {
          email: formData.email,
          password: formData.password,
          teslaToken: formData.teslaToken,
          teslaRegion: formData.teslaRegion,
          mqttEnabled: formData.mqttEnabled,
        }
      )
      return { success: true as const, user: response.user }
    },
    onSuccess: (data) => {
      if (!authDisabled && data.user) {
        setUser(data.user)
      }
      setStep('complete')
      onSetupComplete?.()
      setTimeout(() => navigate('/', { replace: true }), 400)
    },
    onError: (err: Error) => {
      setError(err.message)
    },
  })

  const handleContinue = async () => {
    setError(null)

    // Auth disabled mode: skip admin, go straight to Tesla token
    if (authDisabled) {
      if (step === 'tesla') {
        if (!formData.teslaToken.trim()) {
          setError('Tesla bearer token is required')
          return
        }
        setupMutation.mutate()
      }
      return
    }

    // Normal auth mode: full 3-step wizard
    if (step === 'admin') {
      if (!formData.email || !formData.password) {
        setError('Email and password are required')
        return
      }
      if (formData.password !== formData.passwordConfirm) {
        setError('Passwords do not match')
        return
      }
      if (formData.password.length < 8) {
        setError('Password must be at least 8 characters')
        return
      }
      setStep('tesla')
    } else if (step === 'tesla') {
      setStep('optional')
    } else if (step === 'optional') {
      setupMutation.mutate()
    }
  }

  const teslaDeveloperUrl = 'https://developer.tesla.com/console/am'

  if (loadingConfig) {
    return (
      <div className="min-h-screen bg-bg-base flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-2xl space-y-8">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-accent-500 mb-4 shadow-glow animate-pulse">
              <Zap size={28} className="text-white" />
            </div>
            <p className="text-text-secondary">Loading setup wizard...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-bg-base flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-2xl space-y-8">
        {/* Logo */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-accent-500 mb-4 shadow-glow">
            <Zap size={28} className="text-white" />
          </div>
          <h1 className="text-3xl font-bold text-text-primary">Voltcraft Setup</h1>
          <p className="text-text-secondary text-sm mt-1">
            First-time initialization · Self-hosted Tesla Fleet Companion
          </p>
        </div>

        {/* Progress indicator */}
        {!authDisabled && (
          <div className="flex gap-2 justify-center">
            {(['admin', 'tesla', 'optional'] as const).map((s, i) => (
              <div
                key={s}
                className={`h-2 w-12 rounded-full transition-colors ${
                  step === s
                    ? 'bg-accent-500'
                    : ['admin', 'tesla'].includes(step) && ['admin', 'tesla'].indexOf(step) > i
                    ? 'bg-success'
                    : 'bg-border-subtle'
                }`}
              />
            ))}
          </div>
        )}

        <Card className="p-8 space-y-6">
          {/* Step 1: Admin User */}
          {step === 'admin' && (
            <>
              <div className="space-y-1">
                <h2 className="text-xl font-semibold text-text-primary">Create Admin Account</h2>
                <p className="text-sm text-text-secondary">Set up your first user account</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="stat-label block mb-1.5">Email</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full bg-bg-overlay border border-border rounded-lg px-3 py-2.5 text-sm text-text-primary focus:border-accent-500 focus:ring-1 focus:ring-accent-500 outline-none"
                    placeholder="admin@voltcraft.local"
                  />
                </div>

                <div>
                  <label className="stat-label block mb-1.5">Password</label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full bg-bg-overlay border border-border rounded-lg px-3 py-2.5 text-sm text-text-primary focus:border-accent-500 focus:ring-1 focus:ring-accent-500 outline-none"
                    placeholder="••••••••"
                  />
                  <p className="text-xs text-text-muted mt-1">Min 8 characters</p>
                </div>

                <div>
                  <label className="stat-label block mb-1.5">Confirm Password</label>
                  <input
                    type="password"
                    value={formData.passwordConfirm}
                    onChange={(e) => setFormData({ ...formData, passwordConfirm: e.target.value })}
                    className="w-full bg-bg-overlay border border-border rounded-lg px-3 py-2.5 text-sm text-text-primary focus:border-accent-500 focus:ring-1 focus:ring-accent-500 outline-none"
                    placeholder="••••••••"
                  />
                </div>
              </div>
            </>
          )}

          {/* Step 2: Tesla API Config */}
          {step === 'tesla' && (
            <>
              {authDisabled ? (
                // AUTH_DISABLED: Single token field
                <>
                  <div className="space-y-1">
                    <h2 className="text-xl font-semibold text-text-primary">Configure Tesla Token</h2>
                    <p className="text-sm text-text-secondary">Enter your Tesla API bearer token</p>
                  </div>

                  <div className="bg-bg-overlay border border-border-subtle rounded-lg p-4 space-y-2">
                    <p className="text-xs font-medium text-text-secondary">ℹ️ Get your token from</p>
                    <p className="text-xs text-text-muted">
                      Visit{' '}
                      <a href="https://developer.tesla.com" target="_blank" rel="noopener noreferrer" className="text-accent-500 hover:underline">
                        Tesla Developer Portal
                      </a>{' '}
                      to generate your bearer token.
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="stat-label block mb-1.5">Tesla Bearer Token</label>
                      <textarea
                        value={formData.teslaToken}
                        onChange={(e) => setFormData({ ...formData, teslaToken: e.target.value })}
                        className="w-full bg-bg-overlay border border-border rounded-lg px-3 py-2.5 text-sm text-text-primary focus:border-accent-500 focus:ring-1 focus:ring-accent-500 outline-none font-mono"
                        placeholder="eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
                        rows={8}
                      />
                      <p className="text-xs text-text-muted mt-1">Paste your complete JWT token here</p>
                    </div>

                    <div>
                      <label className="stat-label block mb-1.5">Region</label>
                      <select
                        value={formData.teslaRegion}
                        onChange={(e) => setFormData({ ...formData, teslaRegion: e.target.value as TeslaRegion })}
                        className="w-full bg-bg-overlay border border-border rounded-lg px-3 py-2.5 text-sm text-text-primary focus:border-accent-500 focus:ring-1 focus:ring-accent-500 outline-none"
                      >
                        <option value="na">North America</option>
                        <option value="eu">Europe</option>
                        <option value="cn">China</option>
                      </select>
                    </div>
                  </div>
                </>
              ) : (
                // NORMAL AUTH: Full OAuth fields
                <>
                  <div className="space-y-1">
                    <h2 className="text-xl font-semibold text-text-primary">Tesla Fleet API Setup</h2>
                    <p className="text-sm text-text-secondary">Connect to your Tesla vehicles</p>
                  </div>

                  <div className="bg-bg-overlay border border-border-subtle rounded-lg p-4 space-y-2">
                    <p className="text-xs font-medium text-text-secondary">ℹ️ Need Tesla credentials?</p>
                    <p className="text-xs text-text-muted">
                      Register at{' '}
                      <a href={teslaDeveloperUrl} target="_blank" rel="noopener noreferrer" className="text-accent-500 hover:underline">
                        Tesla Developer Console
                      </a>{' '}
                      to obtain your Client ID and Secret.
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="stat-label block mb-1.5">Tesla Bearer Token (Optional)</label>
                      <textarea
                        value={formData.teslaToken}
                        onChange={(e) => setFormData({ ...formData, teslaToken: e.target.value })}
                        className="w-full bg-bg-overlay border border-border rounded-lg px-3 py-2.5 text-sm text-text-primary focus:border-accent-500 focus:ring-1 focus:ring-accent-500 outline-none font-mono"
                        placeholder="eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
                        rows={4}
                      />
                      <p className="text-xs text-text-muted mt-1">Or use Client ID/Secret below for OAuth</p>
                    </div>

                    <div>
                      <label className="stat-label block mb-1.5">Region</label>
                      <select
                        value={formData.teslaRegion}
                        onChange={(e) => setFormData({ ...formData, teslaRegion: e.target.value as TeslaRegion })}
                        className="w-full bg-bg-overlay border border-border rounded-lg px-3 py-2.5 text-sm text-text-primary focus:border-accent-500 focus:ring-1 focus:ring-accent-500 outline-none"
                      >
                        <option value="na">North America</option>
                        <option value="eu">Europe</option>
                        <option value="cn">China</option>
                      </select>
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          {/* Step 3: Optional Config */}
          {step === 'optional' && (
            <>
              <div className="space-y-1">
                <h2 className="text-xl font-semibold text-text-primary">Optional Configuration</h2>
                <p className="text-sm text-text-secondary">Advanced features (can be changed later)</p>
              </div>

              <div className="space-y-4">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.mqttEnabled}
                    onChange={(e) => setFormData({ ...formData, mqttEnabled: e.target.checked })}
                    className="w-4 h-4 rounded accent-accent-500"
                  />
                  <span className="text-sm text-text-primary">
                    Enable MQTT <span className="text-text-muted">(for Home Assistant integration)</span>
                  </span>
                </label>
              </div>
            </>
          )}

          {/* Step 4: Complete */}
          {step === 'complete' && (
            <div className="text-center space-y-4 py-8">
              <CheckCircle2 size={48} className="text-success mx-auto" />
              <div>
                <h2 className="text-xl font-semibold text-text-primary">Setup Complete!</h2>
                <p className="text-sm text-text-secondary mt-1">Redirecting to dashboard...</p>
              </div>
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="bg-error-bg border border-error/20 rounded-lg px-4 py-3 text-sm text-error">{error}</div>
          )}

          {/* Action buttons */}
          {step !== 'complete' && (
            <div className="flex gap-3 pt-4">
              {step !== 'admin' && !authDisabled && (
                <Button variant="secondary" className="flex-1" onClick={() => setStep(step === 'tesla' ? 'admin' : 'tesla')}>
                  Back
                </Button>
              )}
              <Button
                variant="primary"
                className="flex-1"
                loading={setupMutation.isPending}
                onClick={handleContinue}
              >
                {authDisabled && step === 'tesla'
                  ? 'Complete Setup'
                  : step === 'optional'
                    ? 'Complete Setup'
                    : 'Continue'}
                <ArrowRight size={14} />
              </Button>
            </div>
          )}
        </Card>

        <p className="text-center text-xs text-text-muted">
          Tesla® is a trademark of Tesla, Inc.<br />
          Voltcraft is independent and not affiliated with Tesla.
        </p>
      </div>
    </div>
  )
}
