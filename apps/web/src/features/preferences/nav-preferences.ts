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
  orderedKeys: NavItemKey[]
}

export type NavPreferences = StoredPrefs

const DEFAULT_PREFS: StoredPrefs = {
  hiddenKeys: [],
  iconByKey: {},
  orderedKeys: [],
}

function normalizeOrderedKeys(keys: NavItemKey[]): NavItemKey[] {
  const unique: NavItemKey[] = []
  for (const key of keys) {
    if (!isNavItemKey(key) || unique.includes(key)) continue
    unique.push(key)
  }

  for (const item of NAV_ITEMS) {
    if (!unique.includes(item.key)) unique.push(item.key)
  }

  return unique
}

let cachedPrefsRaw: string | null = null
let cachedPrefs: StoredPrefs = DEFAULT_PREFS

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
    if (!raw) {
      cachedPrefsRaw = null
      cachedPrefs = DEFAULT_PREFS
      return DEFAULT_PREFS
    }
    if (raw === cachedPrefsRaw) {
      return cachedPrefs
    }
    const parsed = JSON.parse(raw) as StoredPrefs
    const hiddenKeys = (parsed.hiddenKeys ?? []).filter((k): k is NavItemKey => isNavItemKey(String(k)))
    const iconByKey = Object.fromEntries(
      Object.entries(parsed.iconByKey ?? {}).filter(([k, v]) => isNavItemKey(k) && isMenuIconName(String(v))),
    ) as Partial<Record<NavItemKey, MenuIconName>>
    const orderedKeys = normalizeOrderedKeys(
      (parsed.orderedKeys ?? []).map((k) => String(k)).filter(isNavItemKey),
    )
    cachedPrefsRaw = raw
    cachedPrefs = { hiddenKeys, iconByKey, orderedKeys }
    return cachedPrefs
  } catch {
    return DEFAULT_PREFS
  }
}

function persistPrefs(next: StoredPrefs) {
  if (typeof window === 'undefined') return
  const serialized = JSON.stringify(next)
  cachedPrefsRaw = serialized
  cachedPrefs = next
  window.localStorage.setItem(STORAGE_KEY, serialized)
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
    const byKey = new Map(NAV_ITEMS.map((item) => [item.key, item]))
    const orderedKeys = normalizeOrderedKeys(prefs.orderedKeys)
    return orderedKeys
      .map((key) => byKey.get(key))
      .filter((item): item is NavItemDefinition => item != null)
      .map((item) => ({
      ...item,
      iconName: prefs.iconByKey[item.key] ?? item.defaultIcon,
      hidden: prefs.hiddenKeys.includes(item.key),
    }))
  }, [prefs.hiddenKeys, prefs.iconByKey, prefs.orderedKeys])

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

  const moveItem = (key: NavItemKey, direction: 'up' | 'down') => {
    const ordered = normalizeOrderedKeys(prefs.orderedKeys)
    const index = ordered.indexOf(key)
    if (index < 0) return
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= ordered.length) return
    const next = [...ordered]
    const current = next[index]
    next[index] = next[targetIndex] as NavItemKey
    next[targetIndex] = current as NavItemKey
    setNavPreferences({
      ...prefs,
      orderedKeys: next,
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
    moveItem,
    reset,
  }
}
