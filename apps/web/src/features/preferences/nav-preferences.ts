import { useEffect, useMemo, useState } from 'react'
import {
  MENU_ICON_REGISTRY,
  NAV_ITEMS,
  type MenuIconName,
  type NavItemDefinition,
  type NavItemKey,
} from '@/components/layout/nav-config'

const STORAGE_KEY = 'voltcraft.nav.preferences.v1'

type StoredPrefs = {
  hiddenKeys: NavItemKey[]
  iconByKey: Partial<Record<NavItemKey, MenuIconName>>
}

const DEFAULT_PREFS: StoredPrefs = {
  hiddenKeys: [],
  iconByKey: {},
}

function isNavItemKey(value: string): value is NavItemKey {
  return NAV_ITEMS.some((item) => item.key === value)
}

function isMenuIconName(value: string): value is MenuIconName {
  return value in MENU_ICON_REGISTRY
}

function readPrefs(): StoredPrefs {
  if (typeof window === 'undefined') return DEFAULT_PREFS
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_PREFS
    const parsed = JSON.parse(raw) as StoredPrefs
    const hiddenKeys = (parsed.hiddenKeys ?? []).filter((k): k is NavItemKey => isNavItemKey(String(k)))
    const iconByKey = Object.fromEntries(
      Object.entries(parsed.iconByKey ?? {}).filter(([k, v]) => isNavItemKey(k) && isMenuIconName(String(v))),
    ) as Partial<Record<NavItemKey, MenuIconName>>
    return { hiddenKeys, iconByKey }
  } catch {
    return DEFAULT_PREFS
  }
}

function persistPrefs(next: StoredPrefs) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
}

export type ResolvedNavItem = NavItemDefinition & {
  iconName: MenuIconName
  hidden: boolean
}

export function useNavPreferences() {
  const [prefs, setPrefs] = useState<StoredPrefs>(DEFAULT_PREFS)

  useEffect(() => {
    setPrefs(readPrefs())
  }, [])

  const resolvedItems = useMemo<ResolvedNavItem[]>(() => {
    return NAV_ITEMS.map((item) => ({
      ...item,
      iconName: prefs.iconByKey[item.key] ?? item.defaultIcon,
      hidden: prefs.hiddenKeys.includes(item.key),
    }))
  }, [prefs.hiddenKeys, prefs.iconByKey])

  const visibleItems = useMemo(() => resolvedItems.filter((item) => !item.hidden), [resolvedItems])

  const setHidden = (key: NavItemKey, hidden: boolean) => {
    setPrefs((current) => {
      const hiddenKeys = hidden
        ? Array.from(new Set([...current.hiddenKeys, key]))
        : current.hiddenKeys.filter((k) => k !== key)
      const next = { ...current, hiddenKeys }
      persistPrefs(next)
      return next
    })
  }

  const setIcon = (key: NavItemKey, iconName: MenuIconName) => {
    setPrefs((current) => {
      const iconByKey = { ...current.iconByKey, [key]: iconName }
      const next = { ...current, iconByKey }
      persistPrefs(next)
      return next
    })
  }

  const reset = () => {
    setPrefs(DEFAULT_PREFS)
    persistPrefs(DEFAULT_PREFS)
  }

  return {
    resolvedItems,
    visibleItems,
    prefs,
    setHidden,
    setIcon,
    reset,
  }
}
