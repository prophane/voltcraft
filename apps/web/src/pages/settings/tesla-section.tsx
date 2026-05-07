import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api-client'
import { AlertCircle, CheckCircle2, Zap } from 'lucide-react'

export function TeslaSettingsSection() {
  const [teslaToken, setTeslaToken] = useState('')
  const [teslaRegion, setTeslaRegion] = useState<'na' | 'eu' | 'cn'>('na')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

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
            onChange={(e) => setTeslaRegion(e.target.value as any)}
            className="w-full bg-bg-overlay border border-border rounded-lg px-3 py-2.5 text-sm text-text-primary focus:border-accent-500 focus:ring-1 focus:ring-accent-500 outline-none"
          >
            <option value="na">North America</option>
            <option value="eu">Europe</option>
            <option value="cn">China</option>
          </select>
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
