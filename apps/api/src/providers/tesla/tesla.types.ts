// Tesla Fleet API response types (simplified, non-exhaustive)
export interface TeslaVehicleData {
  id: number
  vehicle_id: number
  vin: string
  display_name: string
  state: string // 'online' | 'asleep' | 'offline'
  charge_state: TeslaChargeState
  climate_state: TeslaClimateState
  drive_state: TeslaDriveState
  location_data?: TeslaLocationData
  vehicle_state: TeslaVehicleState
}

export interface TeslaChargeState {
  battery_level: number
  battery_range: number
  charge_limit_soc: number
  charging_state: string
  conn_charge_cable?: string | null
  charge_energy_added?: number | null
  charge_rate: number
  charge_amps: number
  charger_voltage: number
  time_to_full_charge: number
  charge_port_door_open: boolean
}

export interface TeslaClimateState {
  is_climate_on: boolean
  inside_temp: number | null
  outside_temp: number | null
  seat_heater_left: number
  cabin_overheat_protection?: string | null
}

export interface TeslaDriveState {
  speed: number | null
  power: number | null
  shift_state?: string | null
  latitude: number | null
  longitude: number | null
  heading: number | null
  native_latitude?: number | null
  native_longitude?: number | null
  native_heading?: number | null
  timestamp: number
}

export interface TeslaLocationData {
  latitude?: number | null
  longitude?: number | null
  heading?: number | null
  native_latitude?: number | null
  native_longitude?: number | null
  native_heading?: number | null
}

export interface TeslaVehicleState {
  locked: boolean
  ft: number  // frunk: 0=closed
  rt: number  // trunk: 0=closed
  odometer: number
  tpms_pressure_fl?: number | null
  tpms_pressure_fr?: number | null
  tpms_pressure_rl?: number | null
  tpms_pressure_rr?: number | null
}

export interface TeslaCommandResponse {
  result: boolean
  reason?: string
}
