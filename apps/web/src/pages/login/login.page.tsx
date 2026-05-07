import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/features/auth/store'
import { api } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Zap } from 'lucide-react'

export function LoginPage() {
  const navigate = useNavigate()
  const setUser = useAuthStore((s) => s.setUser)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  const loginMutation = useMutation({
    mutationFn: () => api.post<{ user: { id: string; email: string; name: string } }>('/auth/login', { email, password }),
    onSuccess: (data) => {
      setUser(data.user)
      navigate('/')
    },
    onError: (err: Error) => {
      setError(err.message)
    },
  })

  return (
    <div className="min-h-screen bg-bg-base flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-8">
        {/* Logo */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-accent-500 mb-4 shadow-glow">
            <Zap size={28} className="text-white" />
          </div>
          <h1 className="text-3xl font-bold text-text-primary">Voltcraft</h1>
          <p className="text-text-secondary text-sm mt-1">Tesla Fleet Companion · Self-hosted</p>
        </div>

        {/* Form */}
        <div className="card p-6 space-y-4">
          <div>
            <label className="stat-label block mb-1.5">Email</label>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-bg-overlay border border-border rounded-lg px-3 py-2.5 text-sm text-text-primary placeholder-text-muted focus:border-accent-500 focus:ring-1 focus:ring-accent-500 transition-colors outline-none"
              placeholder="admin@voltcraft.local"
            />
          </div>

          <div>
            <label className="stat-label block mb-1.5">Mot de passe</label>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && loginMutation.mutate()}
              className="w-full bg-bg-overlay border border-border rounded-lg px-3 py-2.5 text-sm text-text-primary placeholder-text-muted focus:border-accent-500 focus:ring-1 focus:ring-accent-500 transition-colors outline-none"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-xs text-error bg-error-bg border border-error/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <Button
            variant="primary"
            size="lg"
            className="w-full"
            loading={loginMutation.isPending}
            onClick={() => loginMutation.mutate()}
            disabled={!email || !password}
          >
            Se connecter
          </Button>
        </div>

        <p className="text-center text-xs text-text-muted">
          Tesla® is a trademark of Tesla, Inc.<br />
          Voltcraft is independent and not affiliated with Tesla.
        </p>
      </div>
    </div>
  )
}
