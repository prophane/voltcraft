import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import {
  MENU_ICON_REGISTRY,
  NAV_ITEMS,
  type MenuIconName,
  type NavItemDefinition,
  type NavItemKey,
} from '@/components/layout/nav-config'

const STORAGE_KEY = 'voltcraft.nav.preferences.v1'
const NAV_PREFS_CHANGE_EVENT = 'voltcraft:nav-preferences-changed'

type StoredPrefs = {
  hiddenKeys: NavItemKey[]
  iconByKey: Partial<Record<NavItemKey, MenuIconName>>
}

export type NavPreferences = StoredPrefs

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
  window.dispatchEvent(new Event(NAV_PREFS_CHANGE_EVENT))
}

function subscribePrefs(onStoreChange: () => void) {
  if (typeof window === 'undefined') return () => {}
  const handleStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) onStoreChange()
  }
  window.addEventListener('storage', handleStorage)
  window.addEventListener(NAV_PREFS_CHANGE_EVENT, onStoreChange)
  return () => {
    window.removeEventListener('storage', handleStorage)
    window.removeEventListener(NAV_PREFS_CHANGE_EVENT, onStoreChange)
  }
}

export function getNavPreferences() {
  return readPrefs()
}

export function setNavPreferences(next: StoredPrefs) {
  persistPrefs(next)
}

export function resetNavPreferences() {
  setNavPreferences(DEFAULT_PREFS)
}

export type ResolvedNavItem = NavItemDefinition & {
  iconName: MenuIconName
  hidden: boolean
}

export function useNavPreferences() {
  const prefs = useSyncExternalStore(subscribePrefs, readPrefs, () => DEFAULT_PREFS)

  const resolvedItems = useMemo<ResolvedNavItem[]>(() => {
    return NAV_ITEMS.map((item) => ({
      ...item,
      iconName: prefs.iconByKey[item.key] ?? item.defaultIcon,
      hidden: prefs.hiddenKeys.includes(item.key),
    }))
  }, [prefs.hiddenKeys, prefs.iconByKey])

  const visibleItems = useMemo(() => resolvedItems.filter((item) => !item.hidden), [resolvedItems])

  const setHidden = (key: NavItemKey, hidden: boolean) => {
    const hiddenKeys = hidden
      ? Array.from(new Set([...prefs.hiddenKeys, key]))
      : prefs.hiddenKeys.filter((k) => k !== key)
    setNavPreferences({ ...prefs, hiddenKeys })
  }

  const setIcon = (key: NavItemKey, iconName: MenuIconName) => {
    setNavPreferences({
      ...prefs,
      iconByKey: { ...prefs.iconByKey, [key]: iconName },
    })
  }

  const reset = () => {
    resetNavPreferences()
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
