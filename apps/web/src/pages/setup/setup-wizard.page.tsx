import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/features/auth/store'
import { api } from '@/lib/api-client'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Zap, CheckCircle2, ArrowRight } from 'lucide-react'

type Step = 'admin' | 'tesla' | 'optional' | 'complete'

export function SetupWizardPage() {
  const navigate = useNavigate()
  const setUser = useAuthStore((s) => s.setUser)
  const [step, setStep] = useState<Step>('admin')
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    passwordConfirm: '',
    teslaClientId: '',
    teslaClientSecret: '',
    teslaRedirectUri: 'http://localhost:3000/auth/callback',
    teslaRegion: 'US' as const,
    mqttEnabled: false,
  })
  const [error, setError] = useState<string | null>(null)

  const setupMutation = useMutation({
    mutationFn: () =>
      api.post<{ user: { id: string; email: string; name: string }; session: { token: string } }>(
        '/auth/setup',
        {
          email: formData.email,
          password: formData.password,
          teslaClientId: formData.teslaClientId || undefined,
          teslaClientSecret: formData.teslaClientSecret || undefined,
          teslaRedirectUri: formData.teslaRedirectUri || undefined,
          teslaRegion: formData.teslaRegion,
          mqttEnabled: formData.mqttEnabled,
        }
      ),
    onSuccess: (data) => {
      setUser(data.user)
      setStep('complete')
      setTimeout(() => navigate('/'), 2000)
    },
    onError: (err: Error) => {
      setError(err.message)
    },
  })

  const handleContinue = async () => {
    setError(null)

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
                  <label className="stat-label block mb-1.5">Tesla Client ID</label>
                  <input
                    type="text"
                    value={formData.teslaClientId}
                    onChange={(e) => setFormData({ ...formData, teslaClientId: e.target.value })}
                    className="w-full bg-bg-overlay border border-border rounded-lg px-3 py-2.5 text-sm text-text-primary focus:border-accent-500 focus:ring-1 focus:ring-accent-500 outline-none"
                    placeholder="your-client-id"
                  />
                </div>

                <div>
                  <label className="stat-label block mb-1.5">Tesla Client Secret</label>
                  <input
                    type="password"
                    value={formData.teslaClientSecret}
                    onChange={(e) => setFormData({ ...formData, teslaClientSecret: e.target.value })}
                    className="w-full bg-bg-overlay border border-border rounded-lg px-3 py-2.5 text-sm text-text-primary focus:border-accent-500 focus:ring-1 focus:ring-accent-500 outline-none"
                    placeholder="••••••••"
                  />
                </div>

                <div>
                  <label className="stat-label block mb-1.5">Redirect URI</label>
                  <input
                    type="text"
                    value={formData.teslaRedirectUri}
                    onChange={(e) => setFormData({ ...formData, teslaRedirectUri: e.target.value })}
                    className="w-full bg-bg-overlay border border-border rounded-lg px-3 py-2.5 text-sm text-text-primary focus:border-accent-500 focus:ring-1 focus:ring-accent-500 outline-none"
                    placeholder="http://localhost:3000/auth/callback"
                  />
                  <p className="text-xs text-text-muted mt-1">Must match Tesla app configuration</p>
                </div>

                <div>
                  <label className="stat-label block mb-1.5">Region</label>
                  <select
                    value={formData.teslaRegion}
                    onChange={(e) => setFormData({ ...formData, teslaRegion: e.target.value as any })}
                    className="w-full bg-bg-overlay border border-border rounded-lg px-3 py-2.5 text-sm text-text-primary focus:border-accent-500 focus:ring-1 focus:ring-accent-500 outline-none"
                  >
                    <option value="US">United States</option>
                    <option value="EU">Europe</option>
                    <option value="CN">China</option>
                  </select>
                </div>

                <p className="text-xs text-text-muted">You can configure this later in Settings</p>
              </div>
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
              {step !== 'admin' && (
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
                {step === 'optional' ? 'Complete Setup' : 'Continue'}
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
