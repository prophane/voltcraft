import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { commandsApi } from '@/features/vehicle/api'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDate } from '@/lib/utils'
import {
  Lock, Unlock, Volume2, Lightbulb, Thermometer,
  Zap, ZapOff, Play, Square, BellRing,
} from 'lucide-react'

interface CommandDef {
  label: string
  description: string
  icon: React.ReactNode
  mutationFn: () => Promise<unknown>
  variant?: 'primary' | 'secondary' | 'danger'
  requiresConfirm?: boolean
}

export function CommandsPage() {
  const qc = useQueryClient()
  const [confirming, setConfirming] = useState<string | null>(null)

  const { data: history } = useQuery({
    queryKey: ['commands', 'history'],
    queryFn: commandsApi.getHistory,
  })

  const makeMutation = (fn: () => Promise<unknown>) =>
    useMutation({ // eslint-disable-line react-hooks/rules-of-hooks
      mutationFn: fn,
      onSuccess: () => qc.invalidateQueries({ queryKey: ['vehicle', 'commands'] }),
    })

  const commands: CommandDef[] = [
    { label: 'Verrouiller',    description: 'Verrouille toutes les portes',     icon: <Lock size={18} />,        mutationFn: commandsApi.lock,         requiresConfirm: false },
    { label: 'Déverrouiller',  description: 'Déverrouille les portes',          icon: <Unlock size={18} />,      mutationFn: commandsApi.unlock,       requiresConfirm: true },
    { label: 'Klaxon',         description: 'Fait klaxonner le véhicule',       icon: <Volume2 size={18} />,     mutationFn: commandsApi.honk,         requiresConfirm: false },
    { label: 'Flash phares',   description: 'Active les phares brièvement',     icon: <Lightbulb size={18} />,   mutationFn: commandsApi.flash,        requiresConfirm: false },
    { label: 'Clim démarrer',  description: 'Active la climatisation',          icon: <Thermometer size={18} />, mutationFn: commandsApi.climateStart, requiresConfirm: false },
    { label: 'Clim arrêter',   description: 'Arrête la climatisation',          icon: <ZapOff size={18} />,      mutationFn: commandsApi.climateStop,  requiresConfirm: false },
    { label: 'Démarrer charge',description: 'Lance la recharge',                icon: <Play size={18} />,        mutationFn: commandsApi.chargeStart,  requiresConfirm: false },
    { label: 'Arrêter charge', description: 'Arrête la recharge',               icon: <Square size={18} />,      mutationFn: commandsApi.chargeStop,   requiresConfirm: true },
    { label: 'Réveiller',      description: 'Réveille le véhicule',             icon: <Zap size={18} />,         mutationFn: commandsApi.wake,         variant: 'primary', requiresConfirm: false },
  ]

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-text-primary">Commandes</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {commands.map((cmd) => {
          const mutation = makeMutation(cmd.mutationFn)
          const isConfirming = confirming === cmd.label

          return (
            <Card key={cmd.label} className="flex flex-col gap-4">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-bg-overlay text-text-secondary">
                  {cmd.icon}
                </div>
                <div>
                  <p className="font-medium text-text-primary text-sm">{cmd.label}</p>
                  <p className="text-xs text-text-muted mt-0.5">{cmd.description}</p>
                </div>
              </div>

              {isConfirming ? (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="danger"
                    loading={mutation.isPending}
                    onClick={() => { mutation.mutate(); setConfirming(null) }}
                  >Confirmer</Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>Annuler</Button>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant={cmd.variant ?? 'secondary'}
                  loading={mutation.isPending}
                  onClick={() => cmd.requiresConfirm ? setConfirming(cmd.label) : mutation.mutate()}
                >
                  Exécuter
                </Button>
              )}

              {mutation.isSuccess && (
                <p className="text-xs text-success">✓ Commande envoyée</p>
              )}
              {mutation.isError && (
                <p className="text-xs text-error">✗ {(mutation.error as Error).message}</p>
              )}
            </Card>
          )
        })}
      </div>

      {/* History */}
      <Card>
        <CardHeader><CardTitle>Historique récent</CardTitle></CardHeader>
        <div className="space-y-2">
          {(history as Record<string, string>[] | undefined)?.slice(0, 10).map((log) => (
            <div key={log['id']} className="flex items-center justify-between py-2 border-b border-border-subtle last:border-0">
              <div className="flex items-center gap-3">
                <BellRing size={12} className="text-text-muted" />
                <span className="text-sm text-text-primary">{log['command']}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded ${log['status'] === 'SUCCESS' ? 'text-success bg-success-bg' : 'text-error bg-error-bg'}`}>
                  {log['status']}
                </span>
              </div>
              <span className="text-xs text-text-muted">{formatDate(log['executedAt'] ?? '')}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
