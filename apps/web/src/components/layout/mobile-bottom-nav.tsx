import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Route, Battery, Bot, Ellipsis } from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { to: '/',            label: 'Dashboard',   icon: LayoutDashboard },
  { to: '/trips',       label: 'Trips',       icon: Route },
  { to: '/charges',     label: 'Charging',    icon: Battery },
  { to: '/automations', label: 'Automations', icon: Bot },
  { to: '/settings',    label: '...',         icon: Ellipsis },
]

export function MobileBottomNav() {
  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-bg-surface border-t border-border-subtle flex items-center px-1 pb-safe">
      {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) =>
            cn(
              'flex-1 min-w-0 flex flex-col items-center gap-1 py-2 px-1 text-[10px] font-medium transition-colors',
              isActive ? 'text-accent-400' : 'text-text-muted',
            )
          }
        >
          <Icon size={18} />
          <span className="max-w-full truncate">{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
