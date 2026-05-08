import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Activity, AlertTriangle, CheckCircle2, Clock3, Database, Radio, Server, Wifi } from 'lucide-react'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { diagnosticsApi } from '@/features/vehicle/api'

function StatusPill({ status }: { status: string }) {
  const tone = status === 'ok' || status === 'healthy' || status === 'connected'
    ? 'text-success border-success/30 bg-success/10'
    : status === 'disabled'
      ? 'text-text-muted border-border-subtle bg-bg-overlay/70'
      : 'text-warning border-warning/30 bg-warning/10'

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${tone}`}>
      {status}
    </span>
  )
}

function ServiceRow({ label, status, icon: Icon }: { label: string; status: string; icon: typeof Server }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border-subtle bg-bg-overlay/50 px-3 py-2.5">
      <div className="flex items-center gap-2 text-sm text-text-secondary">
        <Icon size={16} className="text-text-muted" />
        <span>{label}</span>
      </div>
      <StatusPill status={status} />
    </div>
  )
}

export function DiagnosticsPage() {
  const { data: diag } = useQuery({
    queryKey: ['diagnostics'],
    queryFn: diagnosticsApi.status,
    refetchInterval: 30_000,
  })

  const { data: usage } = useQuery({
    queryKey: ['diagnostics', 'api-usage'],
    queryFn: diagnosticsApi.apiUsage,
    refetchInterval: 60_000,
  })

  const { data: teslaConnection } = useQuery({
    queryKey: ['diagnostics', 'tesla-connection'],
    queryFn: diagnosticsApi.teslaConnection,
    refetchInterval: 60_000,
  })

  const d = (diag ?? {}) as {
    status?: string
    services?: { db?: string; redis?: string; mqtt?: string }
    timestamp?: string
    uptime?: number
  }

  const u = (usage ?? {}) as { todayCount?: number; totalCount?: number }

  const t = (teslaConnection ?? {}) as {
    connected?: boolean
    oauthConfigured?: boolean
    tokenConfigured?: boolean
    accountConfigured?: boolean
    apiReachable?: boolean
    region?: string
    dbVehicleCount?: number
    apiVehicleCount?: number
    partnerPublicKeyConfigured?: boolean
    partnerPublicKeyUrl?: string
    virtualKeyInstallUrl?: string
    partnerRegistrationRequired?: boolean
    error?: string
  }

  const uptimeLabel = useMemo(() => {
    const sec = Number(d.uptime ?? 0)
    if (!sec || Number.isNaN(sec)) return '—'
    const h = Math.floor(sec / 3600)
    const m = Math.floor((sec % 3600) / 60)
    return `${h}h ${m}m`
  }, [d.uptime])

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="rounded-2xl border border-border-subtle bg-gradient-to-br from-bg-surface via-bg-surface to-bg-overlay p-5 lg:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl lg:text-3xl font-semibold text-text-primary">Diagnostic</h1>
            <p className="mt-1 text-sm text-text-muted">Vue de santé système, Fleet API et télémétrie.</p>
          </div>
          <StatusPill status={d.status ?? 'unknown'} />
        </div>

        <div className="mt-5 grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card className="p-4">
            <p className="text-xs uppercase tracking-wide text-text-muted">API calls aujourd'hui</p>
            <p className="mt-2 text-2xl font-semibold text-text-primary">{u.todayCount ?? 0}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs uppercase tracking-wide text-text-muted">API calls total</p>
            <p className="mt-2 text-2xl font-semibold text-text-primary">{u.totalCount ?? 0}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs uppercase tracking-wide text-text-muted">Uptime API</p>
            <p className="mt-2 text-2xl font-semibold text-text-primary">{uptimeLabel}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs uppercase tracking-wide text-text-muted">Région Tesla</p>
            <p className="mt-2 text-2xl font-semibold text-text-primary uppercase">{t.region ?? '—'}</p>
          </Card>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-1">
          <CardHeader><CardTitle>Santé services</CardTitle></CardHeader>
          <div className="px-6 pb-6 space-y-2">
            <ServiceRow label="PostgreSQL" status={d.services?.db ?? 'unknown'} icon={Database} />
            <ServiceRow label="Redis" status={d.services?.redis ?? 'unknown'} icon={Server} />
            <ServiceRow label="MQTT" status={d.services?.mqtt ?? 'unknown'} icon={Radio} />
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Connexion Tesla</CardTitle></CardHeader>
          <div className="px-6 pb-6 space-y-3">
            <div className="grid sm:grid-cols-2 gap-2">
              <ServiceRow label="Fleet API connectée" status={t.connected ? 'connected' : 'disconnected'} icon={Wifi} />
              <ServiceRow label="OAuth configuré" status={t.oauthConfigured ? 'ok' : 'missing'} icon={Activity} />
              <ServiceRow label="Token présent" status={t.tokenConfigured ? 'ok' : 'missing'} icon={Clock3} />
              <ServiceRow label="Compte lié" status={t.accountConfigured ? 'ok' : 'missing'} icon={CheckCircle2} />
            </div>

            <div className="rounded-lg border border-border-subtle bg-bg-overlay/40 p-3 text-sm text-text-secondary">
              <p>Véhicules DB: <span className="text-text-primary font-medium">{t.dbVehicleCount ?? 0}</span></p>
              <p>Véhicules Fleet API: <span className="text-text-primary font-medium">{t.apiVehicleCount ?? 0}</span></p>
              <p>Clé partner: <span className="text-text-primary font-medium">{t.partnerPublicKeyConfigured ? 'Configurée' : 'Manquante'}</span></p>
              {t.partnerPublicKeyUrl && <p className="break-all">URL clé: {t.partnerPublicKeyUrl}</p>}
            </div>

            {t.error && (
              <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-text-secondary flex gap-2">
                <AlertTriangle size={16} className="mt-0.5 text-warning" />
                <span>{t.error}</span>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}
