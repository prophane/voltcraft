import type { LucideIcon } from 'lucide-react'
import {
  Activity,
  BarChart3,
  Battery,
  Bot,
  Car,
  Compass,
  Gauge,
  HeartPulse,
  LayoutDashboard,
  Route,
  Settings,
  SlidersHorizontal,
  TrendingUp,
  Zap,
} from 'lucide-react'

export type NavItemKey =
  | 'dashboard'
  | 'commands'
  | 'trips'
  | 'charges'
  | 'stats'
  | 'diagnostics'
  | 'app-health'
  | 'vehicle-health'
  | 'analytics'
  | 'automations'
  | 'settings'

export type MenuIconName =
  | 'layout-dashboard'
  | 'zap'
  | 'route'
  | 'battery'
  | 'bar-chart'
  | 'activity'
  | 'bot'
  | 'settings'
  | 'compass'
  | 'gauge'
  | 'sliders'
  | 'heart-pulse'
  | 'car'
  | 'trending-up'

export const MENU_ICON_REGISTRY: Record<MenuIconName, { label: string; icon: LucideIcon }> = {
  'layout-dashboard': { label: 'Dashboard', icon: LayoutDashboard },
  zap: { label: 'Eclair', icon: Zap },
  route: { label: 'Trajet', icon: Route },
  battery: { label: 'Batterie', icon: Battery },
  'bar-chart': { label: 'Graphique', icon: BarChart3 },
  activity: { label: 'Activite', icon: Activity },
  bot: { label: 'Robot', icon: Bot },
  settings: { label: 'Reglages', icon: Settings },
  compass: { label: 'Boussole', icon: Compass },
  gauge: { label: 'Jauge', icon: Gauge },
  sliders: { label: 'Curseurs', icon: SlidersHorizontal },
  'heart-pulse': { label: 'Sante App', icon: HeartPulse },
  car: { label: 'Vehicule', icon: Car },
  'trending-up': { label: 'Analyses', icon: TrendingUp },
}

export interface NavItemDefinition {
  key: NavItemKey
  to: string
  label: string
  defaultIcon: MenuIconName
  mobilePrimary: boolean
}

export const NAV_ITEMS: NavItemDefinition[] = [
  { key: 'dashboard', to: '/', label: 'Dashboard', defaultIcon: 'layout-dashboard', mobilePrimary: true },
  { key: 'commands', to: '/commands', label: 'Commandes', defaultIcon: 'zap', mobilePrimary: false },
  { key: 'trips', to: '/trips', label: 'Trajets', defaultIcon: 'route', mobilePrimary: true },
  { key: 'charges', to: '/charges', label: 'Recharges', defaultIcon: 'battery', mobilePrimary: true },
  { key: 'stats', to: '/stats', label: 'Statistiques', defaultIcon: 'bar-chart', mobilePrimary: false },
  { key: 'app-health', to: '/app-health', label: 'Santé App', defaultIcon: 'heart-pulse', mobilePrimary: false },
  { key: 'vehicle-health', to: '/vehicle-health', label: 'Santé Véhicule', defaultIcon: 'car', mobilePrimary: false },
  { key: 'analytics', to: '/analytics', label: 'Analyses', defaultIcon: 'trending-up', mobilePrimary: false },
  { key: 'automations', to: '/automations', label: 'Automatisations', defaultIcon: 'bot', mobilePrimary: true },
  { key: 'settings', to: '/settings', label: 'Parametres', defaultIcon: 'settings', mobilePrimary: false },
]
