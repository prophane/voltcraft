import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Zap, Route, Battery, BarChart3,
  Bot, Settings, LogOut,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/features/auth/store'
import { api } from '@/lib/api-client'

const NAV_ITEMS = [
  { to: '/',            label: 'Dashboard',      icon: LayoutDashboard },
  { to: '/commands',    label: 'Commandes',       icon: Zap },
  { to: '/trips',       label: 'Trajets',         icon: Route },
  { to: '/charges',     label: 'Recharges',       icon: Battery },
  { to: '/stats',       label: 'Statistiques',    icon: BarChart3 },
  { to: '/automations', label: 'Automatisations', icon: Bot },
  { to: '/settings',    label: 'Paramètres',      icon: Settings },
]

export function Sidebar() {
  const logout = useAuthStore((s) => s.logout)

  const handleLogout = async () => {
    await api.post('/auth/logout')
    logout()
  }

  return (
    <aside className="hidden lg:flex flex-col w-64 min-h-screen bg-bg-surface border-r border-border-subtle py-6 px-3 fixed left-0 top-0 bottom-0 z-30">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-3 mb-8">
        <div className="w-8 h-8 rounded-lg bg-accent-500 flex items-center justify-center">
          <Zap size={16} className="text-white" />
        </div>
        <span className="text-lg font-semibold text-text-primary tracking-tight">Voltcraft</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 flex flex-col gap-0.5">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 group',
                isActive
                  ? 'bg-accent-500/10 text-accent-400 border border-accent-500/20'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-elevated',
              )
            }
          >
            <Icon size={16} className="flex-shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Logout */}
      <button
        onClick={handleLogout}
        className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-text-secondary hover:text-error hover:bg-error-bg transition-all duration-150 mt-4"
      >
        <LogOut size={16} />
        Déconnexion
      </button>
    </aside>
  )
}
