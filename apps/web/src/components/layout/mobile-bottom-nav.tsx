import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { Ellipsis, LogOut, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/features/auth/store'
import { api } from '@/lib/api-client'
import { MENU_ICON_REGISTRY } from './nav-config'
import { useNavPreferences, type ResolvedNavItem } from '@/features/preferences/nav-preferences'

const MOBILE_PRIMARY_LIMIT = 4
const MOBILE_PRIMARY_PRIORITY: Array<ResolvedNavItem['key']> = ['dashboard', 'trips', 'charges', 'app-health']

function isResolvedNavItem(item: ResolvedNavItem | undefined): item is ResolvedNavItem {
  return item != null
}

export function MobileBottomNav() {
  const location = useLocation()
  const logout = useAuthStore((s) => s.logout)
  const { visibleItems } = useNavPreferences()
  const [moreOpen, setMoreOpen] = useState(false)
  const navBottomOffset = 'calc(env(safe-area-inset-bottom, 0px) + 0.5rem)'
  const sheetBottomOffset = 'calc(env(safe-area-inset-bottom, 0px) + 4.75rem)'

  const visibleByKey = new Map(visibleItems.map((item) => [item.key, item]))

  const prioritizedPrimaryItems = MOBILE_PRIMARY_PRIORITY
    .map((key) => visibleByKey.get(key))
    .filter(isResolvedNavItem)

  const fallbackPrimaryItems = visibleItems.filter(
    (item) => item.mobilePrimary && !prioritizedPrimaryItems.some((primary) => primary.key === item.key),
  )

  const primaryItems = [...prioritizedPrimaryItems, ...fallbackPrimaryItems]
    .slice(0, MOBILE_PRIMARY_LIMIT)

  const moreItems = visibleItems.filter((item) => !primaryItems.some((primary) => primary.key === item.key))

  const isMoreActive = moreItems.some((item) => location.pathname === item.to)

  const handleLogout = async () => {
    await api.post('/auth/logout')
    logout()
    setMoreOpen(false)
  }

  return (
    <>
      {moreOpen && (
        <div className="lg:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-[1px]" onClick={() => setMoreOpen(false)}>
          <div className="absolute inset-x-0 mx-3 surface-premium p-3" style={{ bottom: sheetBottomOffset }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2 px-1">
              <p className="text-sm font-medium text-text-primary">More</p>
              <button type="button" className="text-text-muted hover:text-text-primary" onClick={() => setMoreOpen(false)}>
                <X size={16} />
              </button>
            </div>

            <div className="space-y-1">
              {moreItems.map(({ key, to, label, iconName }) => {
                const Icon = MENU_ICON_REGISTRY[iconName].icon
                return (
                <NavLink
                  key={key}
                  to={to}
                  onClick={() => setMoreOpen(false)}
                  className={({ isActive }) => cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                    isActive ? 'bg-accent-500/10 text-accent-400' : 'text-text-secondary hover:text-text-primary hover:bg-bg-overlay',
                  )}
                >
                  <Icon size={15} />
                  {label}
                </NavLink>
                )
              })}

              <button
                type="button"
                onClick={handleLogout}
                className="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-text-secondary hover:text-error hover:bg-error-bg transition-colors"
              >
                <LogOut size={15} />
                Deconnexion
              </button>
            </div>
          </div>
        </div>
      )}

      <nav className="lg:hidden fixed inset-x-3 z-40 flex items-center rounded-2xl border border-border-subtle bg-bg-surface/95 px-1 shadow-elevated backdrop-blur-sm" style={{ bottom: navBottomOffset }}>
        {primaryItems.map(({ key, to, label, iconName }) => {
          const Icon = MENU_ICON_REGISTRY[iconName].icon
          return (
          <NavLink
            key={key}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              cn(
                'flex-1 min-w-0 flex flex-col items-center gap-1 py-3 px-1 text-[10px] font-medium transition-colors',
                isActive ? 'text-accent-400' : 'text-text-muted',
              )
            }
          >
            <Icon size={18} />
            <span className="max-w-full truncate">{label}</span>
          </NavLink>
          )
        })}

        {moreItems.length > 0 && (
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className={cn(
              'flex-1 min-w-0 flex flex-col items-center gap-1 py-3 px-1 text-[10px] font-medium transition-colors',
              isMoreActive || moreOpen ? 'text-accent-400' : 'text-text-muted',
            )}
          >
            <Ellipsis size={18} />
            <span className="max-w-full truncate">...</span>
          </button>
        )}
      </nav>
    </>
  )
}
