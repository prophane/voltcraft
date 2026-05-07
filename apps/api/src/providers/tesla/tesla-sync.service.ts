import type { PrismaClient, TeslaAccount, Vehicle } from '@prisma/client'
import type { TeslaClient } from './tesla.client.js'
import type { VehicleRepository } from '../../modules/vehicle/vehicle.repository.js'
import type { TeslaEcoPolicyService } from './tesla-eco-policy.service.js'

export class TeslaSyncService {
  constructor(
    private readonly client: TeslaClient,
    private readonly vehicleRepo: VehicleRepository,
    private readonly ecoPolicy: TeslaEcoPolicyService,
    private readonly db: PrismaClient,
  ) {}

  async syncVehicleState(
    vehicle: Vehicle & { teslaAccount: TeslaAccount },
    opts: { force?: boolean } = {},
  ) {
    // ── Eco lock: prevent concurrent syncs ───────────────────
    if (!opts.force) {
      const locked = !(await this.ecoPolicy.acquireSyncLock(vehicle.id))
      if (locked) {
        const cached = await this.ecoPolicy.getCachedState(vehicle.id)
        if (cached) return cached
      }
    }

    try {
      const data = await this.client.getVehicleData(vehicle.teslaAccount, vehicle.vin)

      const isAsleep = data.state === 'asleep' || data.state === 'offline'
      const snapshot = {
        vehicleState: data.state,
        odometer: data.vehicle_state.odometer,

        batteryLevel: data.charge_state.battery_level,
        batteryRange: data.charge_state.battery_range * 1.609344, // miles → km
        chargeLimitSoc: data.charge_state.charge_limit_soc,
        chargeState: data.charge_state.charging_state,
        isCharging: data.charge_state.charging_state === 'Charging',
        isPluggedIn: data.charge_state.charge_port_door_open,
        chargeRate: data.charge_state.charge_rate * 1.609344,
        chargeAmps: data.charge_state.charge_amps,
        chargeVoltage: data.charge_state.charger_voltage,
        timeToFullCharge: data.charge_state.time_to_full_charge,

        climateOn: data.climate_state.is_climate_on,
        insideTemp: data.climate_state.inside_temp,
        outsideTemp: data.climate_state.outside_temp,
        isSeatHeaterOn: data.climate_state.seat_heater_left > 0,

        isLocked: data.vehicle_state.locked,
        isTrunkOpen: data.vehicle_state.rt > 0,
        isFrunkOpen: data.vehicle_state.ft > 0,

        isDriving: (data.drive_state.speed ?? 0) > 0,
        speed: data.drive_state.speed,
        power: data.drive_state.power,

        latitude: data.drive_state.latitude,
        longitude: data.drive_state.longitude,
        heading: data.drive_state.heading,
        atHome: false, // computed by home geofence check elsewhere
      }

      await this.vehicleRepo.createSnapshot(vehicle.id, snapshot as never)
      await this.ecoPolicy.setCachedState(vehicle.id, snapshot as never, isAsleep)
      await this.vehicleRepo.updateLastSync(vehicle.teslaAccountId)

      return snapshot
    } finally {
      await this.ecoPolicy.releaseSyncLock(vehicle.id)
    }
  }
}
