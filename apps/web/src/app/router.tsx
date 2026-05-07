import { Routes, Route, Navigate } from 'react-router-dom'
import { MainLayout } from '@/components/layout/main-layout'
import { DashboardPage } from '@/pages/dashboard/dashboard.page'
import { CommandsPage } from '@/pages/commands/commands.page'
import { TripsPage } from '@/pages/trips/trips.page'
import { ChargesPage } from '@/pages/charges/charges.page'
import { StatsPage } from '@/pages/stats/stats.page'
import { AutomationsPage } from '@/pages/automations/automations.page'
import { SettingsPage } from '@/pages/settings/settings.page'
import { LoginPage } from '@/pages/login/login.page'
import { SetupWizardPage } from '@/pages/setup/setup-wizard.page'
import { useAuthStore } from '@/features/auth/store'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api-client'

function ProtectedRoutes() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return (
    <MainLayout>
      <Routes>
        <Route index element={<DashboardPage />} />
        <Route path="commands" element={<CommandsPage />} />
        <Route path="trips" element={<TripsPage />} />
        <Route path="charges" element={<ChargesPage />} />
        <Route path="stats" element={<StatsPage />} />
        <Route path="automations" element={<AutomationsPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Routes>
    </MainLayout>
  )
}

export function AppRouter() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const [setupRequired, setSetupRequired] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const checkSetup = async () => {
      try {
        const response = await api.get<{ setupRequired: boolean }>('/auth/setup')
        setSetupRequired(response.setupRequired)
      } catch {
        // If request fails, assume setup not required
        setSetupRequired(false)
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
      {setupRequired && <Route path="/*" element={<SetupWizardPage />} />}
      {!setupRequired && !isAuthenticated && <Route path="/*" element={<LoginPage />} />}
      {!setupRequired && isAuthenticated && <Route path="/*" element={<ProtectedRoutes />} />}
    </Routes>
  )
}
