import { Routes, Route, Navigate } from 'react-router-dom'
import { MainLayout } from '@/components/layout/main-layout'
import { DashboardPage } from '@/pages/dashboard/dashboard.page'
import { CommandsPage } from '@/pages/commands/commands.page'
import { TripsPage } from '@/pages/trips/trips.page'
import { ChargesPage } from '@/pages/charges/charges.page'
import { StatsPage } from '@/pages/stats/stats.page'
import { AutomationsPage } from '@/pages/automations/automations.page'
import { SettingsPage } from '@/pages/settings/settings.page'
import { AppHealthPage } from '@/pages/app-health/app-health.page'
import { VehicleHealthPage } from '@/pages/vehicle-health/vehicle-health.page'
import { AnalyticsPage } from '@/pages/analytics/analytics.page'
import { LoginPage } from '@/pages/login/login.page'
import { SetupWizardPage } from '@/pages/setup/setup-wizard.page'
import { useAuthStore } from '@/features/auth/store'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api-client'

const FORCE_NO_AUTH = import.meta.env.VITE_FORCE_NO_AUTH === 'true'

function ProtectedRoutes({ authDisabled }: { authDisabled: boolean }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  if (!authDisabled && !isAuthenticated) return <Navigate to="/login" replace />
  return (
    <MainLayout>
      <Routes>
        <Route index element={<DashboardPage />} />
        <Route path="commands" element={<CommandsPage />} />
        <Route path="trips" element={<TripsPage />} />
        <Route path="charges" element={<ChargesPage />} />
        <Route path="stats" element={<StatsPage />} />
        <Route path="app-health" element={<AppHealthPage />} />
        <Route path="vehicle-health" element={<VehicleHealthPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="automations" element={<AutomationsPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Routes>
    </MainLayout>
  )
}

export function AppRouter() {
  if (typeof window !== 'undefined' && window.location.pathname === '/auth/tesla/callback') {
    const target = `/api/auth/tesla/callback${window.location.search}`
    window.location.replace(target)
    return (
      <div className="min-h-screen bg-bg-base flex items-center justify-center">
        <div className="text-text-secondary">Finalizing Tesla OAuth...</div>
      </div>
    )
  }

  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const [setupRequired, setSetupRequired] = useState<boolean | null>(null)
  const [authDisabled, setAuthDisabled] = useState(FORCE_NO_AUTH)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const checkSetup = async () => {
      if (FORCE_NO_AUTH) {
        setAuthDisabled(true)
        setSetupRequired(false)
        setLoading(false)
        return
      }

      try {
        // Single call to /config gets both authDisabled AND setupRequired
        const configRes = await api.get<{
          authDisabled: boolean
          setupRequired: boolean
        }>('/config')
        setAuthDisabled(configRes.authDisabled ?? false)
        setSetupRequired(configRes.setupRequired ?? false)
      } catch (err) {
        console.error('Failed to check setup/config:', err)
        // Behind some reverse proxies, /config can fail while auth is managed upstream.
        // Default to no-auth mode to avoid forcing the local login screen.
        setSetupRequired(false)
        setAuthDisabled(true)
      } finally {
        setLoading(false)
      }
    }
    checkSetup()
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-bg-base flex items-center justify-center">
        <div className="text-text-secondary">Initializing...</div>
      </div>
    )
  }

  return (
    <Routes>
      {setupRequired && <Route path="/*" element={<SetupWizardPage onSetupComplete={() => setSetupRequired(false)} />} />}
      {!setupRequired && !authDisabled && !isAuthenticated && <Route path="/*" element={<LoginPage />} />}
      {!setupRequired && (authDisabled || isAuthenticated) && <Route path="/*" element={<ProtectedRoutes authDisabled={authDisabled} />} />}
    </Routes>
  )
}
