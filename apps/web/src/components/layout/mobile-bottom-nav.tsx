import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Zap, Route, Battery, BarChart3 } from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { to: '/',         label: 'Home',       icon: LayoutDashboard },
  { to: '/commands', label: 'Commandes',  icon: Zap },
  { to: '/trips',    label: 'Trajets',    icon: Route },
  { to: '/charges',  label: 'Recharges',  icon: Battery },
  { to: '/stats',    label: 'Stats',      icon: BarChart3 },
]

export function MobileBottomNav() {
  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-bg-surface border-t border-border-subtle flex items-center justify-around px-2 pb-safe">
      {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) =>
            cn(
              'flex flex-col items-center gap-1 py-3 px-3 text-xs font-medium transition-colors',
              isActive ? 'text-accent-400' : 'text-text-muted',
            )
          }
        >
          <Icon size={20} />
          {label}
        </NavLink>
      ))}
    </nav>
  )
}
