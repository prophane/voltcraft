import type { VehicleState, ChargeState } from '../constants/vehicle-states.js'

export interface VehicleSummary {
  id: string
  vin: string
  displayName: string
  state: VehicleState
  lastSeenAt: string // ISO
  isCached: boolean
}

export interface VehicleStateSnapshot {
  vehicleId: string
  capturedAt: string // ISO

  // Battery
  batteryLevel: number       // 0-100
  batteryRange: number       // km
  chargeLimitSoc: number     // 0-100
  chargeState: ChargeState
  isCharging: boolean
  isPluggedIn: boolean
  chargeRate: number         // km/h
  timeToFullCharge: number   // hours

  // Climate
  climateOn: boolean
  insideTemp: number | null  // °C
  outsideTemp: number | null // °C
  isSeatHeaterOn: boolean
  cabinOverheatProtectionMode?: 'off' | 'fan_only' | 'on'

  // Locks
  isLocked: boolean
  isTrunkOpen: boolean
  isFrunkOpen: boolean

  // Drive
  isDriving: boolean
  speed: number | null       // km/h
  power: number | null       // kW

  // Location
  latitude: number | null
  longitude: number | null
  heading: number | null
  atHome: boolean
}

export interface VehicleLocation {
  latitude: number
  longitude: number
  heading: number
  timestamp: string // ISO
}
