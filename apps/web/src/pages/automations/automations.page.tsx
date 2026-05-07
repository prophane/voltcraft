import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { automationsApi } from '@/features/vehicle/api'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CardSkeleton } from '@/components/ui/skeleton'
import { Plus, Trash2, Play, Pause, CheckCircle, XCircle } from 'lucide-react'
import { formatDate } from '@/lib/utils'

export function AutomationsPage() {
  const qc = useQueryClient()
  const { data: rules, isLoading } = useQuery({
    queryKey: ['automations'],
    queryFn: automationsApi.list,
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      automationsApi.update(id, { enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['automations'] }),
  })

  const deleteMutation = useMutation({
    mutationFn: automationsApi.delete,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['automations'] }),
  })

  const TRIGGER_LABELS: Record<string, string> = {
    schedule_recurring: 'Planification récurrente',
    schedule_once: 'Heure précise',
    arrive_home: 'Arrivée à domicile',
    battery_below: 'Batterie sous seuil',
    battery_above: 'Batterie au-dessus seuil',
    charging_complete: 'Recharge terminée',
  }

  const ACTION_LABELS: Record<string, string> = {
    start_climate: '🌡 Démarrer clim',
    stop_climate: '❄ Arrêter clim',
    set_charge_limit: '⚡ Limite charge',
    start_charge: '▶ Démarrer recharge',
    stop_charge: '■ Arrêter recharge',
    notify: '🔔 Notification',
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-text-primary">Automatisations</h1>
        <Button size="sm" variant="primary">
          <Plus size={14} /> Nouvelle règle
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <CardSkeleton key={i} />)}</div>
      ) : (rules as Record<string, unknown>[] | undefined ?? []).length === 0 ? (
        <Card className="text-center py-12 text-text-muted">
          Aucune automatisation configurée
        </Card>
      ) : (
        <div className="space-y-3">
          {(rules as Record<string, unknown>[]).map((rule) => (
            <Card key={rule['id'] as string} className={!rule['enabled'] ? 'opacity-60' : ''}>
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {rule['lastStatus'] === 'success'
                      ? <CheckCircle size={14} className="text-success flex-shrink-0" />
                      : rule['lastStatus'] === 'failed'
                      ? <XCircle size={14} className="text-error flex-shrink-0" />
                      : null}
                    <p className="text-sm font-medium text-text-primary truncate">{rule['name'] as string}</p>
                  </div>
                  <p className="text-xs text-text-muted">
                    {TRIGGER_LABELS[rule['trigger'] as string] ?? rule['trigger'] as string}
                    {' → '}
                    {ACTION_LABELS[rule['action'] as string] ?? rule['action'] as string}
                  </p>
                  {rule['lastExecutedAt'] && (
                    <p className="text-xs text-text-muted mt-1">
                      Dernière exécution: {formatDate(rule['lastExecutedAt'] as string)}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={toggleMutation.isPending}
                    onClick={() => toggleMutation.mutate({ id: rule['id'] as string, enabled: !rule['enabled'] })}
                  >
                    {rule['enabled'] ? <Pause size={14} /> : <Play size={14} />}
                    {rule['enabled'] ? 'Pause' : 'Activer'}
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    loading={deleteMutation.isPending}
                    onClick={() => deleteMutation.mutate(rule['id'] as string)}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
