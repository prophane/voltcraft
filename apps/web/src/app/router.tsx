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
import { useAuthStore } from '@/features/auth/store'

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
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/*" element={<ProtectedRoutes />} />
    </Routes>
  )
}
