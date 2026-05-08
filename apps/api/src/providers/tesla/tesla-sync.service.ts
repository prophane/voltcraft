import type { PrismaClient, TeslaAccount, Vehicle } from '@prisma/client'
import type { TeslaClient } from './tesla.client.js'
import type { VehicleRepository } from '../../modules/vehicle/vehicle.repository.js'
import type { TeslaEcoPolicyService } from './tesla-eco-policy.service.js'
import { TeslaApiError } from '../../common/errors/app-error.js'

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

      const chargeState = data.charge_state ?? ({} as Partial<typeof data.charge_state>)
      const climateState = data.climate_state ?? ({} as Partial<typeof data.climate_state>)
      const driveState = data.drive_state ?? ({} as Partial<typeof data.drive_state>)
      const locationData = data.location_data ?? ({} as Partial<NonNullable<typeof data.location_data>>)
      const vehicleState = data.vehicle_state ?? ({} as Partial<typeof data.vehicle_state>)
      const chargeEnergyAddedKwh = chargeState.charge_energy_added ?? null
      const copModeRaw = (climateState.cabin_overheat_protection ?? '').toString().toLowerCase()
      const cabinOverheatProtectionMode =
        copModeRaw.includes('fan') ? 'fan_only'
          : copModeRaw.includes('on') || copModeRaw.includes('a/c') || copModeRaw.includes('ac') ? 'on'
            : 'off'
      const shiftState = (driveState.shift_state ?? '').toString().toLowerCase()
      const isDrivingNow = (driveState.speed ?? 0) > 0 || shiftState === 'd' || shiftState === 'r'
      const latitude = driveState.latitude ?? driveState.native_latitude ?? locationData.latitude ?? locationData.native_latitude ?? null
      const longitude = driveState.longitude ?? driveState.native_longitude ?? locationData.longitude ?? locationData.native_longitude ?? null
      const headingRaw = driveState.heading ?? driveState.native_heading ?? locationData.heading ?? locationData.native_heading ?? null

      const isAsleep = data.state === 'asleep' || data.state === 'offline'
      const snapshotForDb = {
        vehicleState: data.state,
        odometer: vehicleState.odometer ?? null,

        batteryLevel: chargeState.battery_level ?? 0,
        batteryRange: (chargeState.battery_range ?? 0) * 1.609344, // miles → km
        chargeLimitSoc: chargeState.charge_limit_soc ?? null,
        chargeState: chargeState.charging_state ?? null,
        isCharging: chargeState.charging_state === 'Charging',
        isPluggedIn: chargeState.charge_port_door_open ?? false,
        chargeRate: chargeState.charge_rate != null ? chargeState.charge_rate * 1.609344 : null,
        chargeAmps: chargeState.charge_amps ?? null,
        chargeVoltage: chargeState.charger_voltage ?? null,
        timeToFullCharge: chargeState.time_to_full_charge ?? null,

        climateOn: climateState.is_climate_on ?? false,
        insideTemp: climateState.inside_temp ?? null,
        outsideTemp: climateState.outside_temp ?? null,

        isLocked: vehicleState.locked ?? true,
        isTrunkOpen: (vehicleState.rt ?? 0) > 0,
        isFrunkOpen: (vehicleState.ft ?? 0) > 0,

        isDriving: isDrivingNow,
        speed: driveState.speed ?? null,
        power: driveState.power ?? null,

        latitude,
        longitude,
        heading: headingRaw != null ? Math.round(headingRaw) : null,
        atHome: false, // computed by home geofence check elsewhere
      }

      const snapshot = {
        ...snapshotForDb,
        cabinOverheatProtectionMode,
      }

      await this.vehicleRepo.createSnapshot(vehicle.id, snapshotForDb as never)
      await this.ecoPolicy.setCachedState(vehicle.id, snapshot as never, isAsleep)

      // Keep higher-level entities (trips/charge sessions) in sync with telemetry.
      await this.updateTripTracking(vehicle.id, snapshotForDb)
      await this.updateChargeTracking(vehicle.id, {
        ...snapshotForDb,
        chargeEnergyAddedKwh,
      })

      await this.vehicleRepo.updateLastSync(vehicle.teslaAccountId)

      return snapshot
    } finally {
      await this.ecoPolicy.releaseSyncLock(vehicle.id)
    }
  }

  private async updateTripTracking(vehicleId: string, snapshot: {
    isDriving: boolean
    speed: number | null
    latitude: number | null
    longitude: number | null
    odometer: number | null
    batteryLevel: number
  }) {
    const openTrip = await this.db.trip.findFirst({
      where: { vehicleId, endedAt: null },
      orderBy: { startedAt: 'desc' },
    })

    if (snapshot.isDriving) {
      if (!openTrip) {
        await this.db.trip.create({
          data: {
            vehicleId,
            startedAt: new Date(),
            startLatitude: snapshot.latitude,
            startLongitude: snapshot.longitude,
            startBatteryLevel: snapshot.batteryLevel,
            maxSpeedKmh: snapshot.speed ?? null,
          },
        })
        return
      }

      if (snapshot.speed != null && (openTrip.maxSpeedKmh == null || snapshot.speed > openTrip.maxSpeedKmh)) {
        await this.db.trip.update({
          where: { id: openTrip.id },
          data: { maxSpeedKmh: snapshot.speed },
        })
      }
      return
    }

    if (!openTrip) {
      return
    }

    const endedAt = new Date()
    const durationMin = Math.max(1, Math.round((endedAt.getTime() - openTrip.startedAt.getTime()) / 60_000))

    // Estimate trip distance from odometer delta over trip period when available.
    let distanceKm: number | null = openTrip.distanceKm ?? null
    if (snapshot.odometer != null) {
      const firstSnapshot = await this.db.vehicleStateSnapshot.findFirst({
        where: {
          vehicleId,
          capturedAt: { gte: openTrip.startedAt },
          odometer: { not: null },
        },
        orderBy: { capturedAt: 'asc' },
        select: { odometer: true },
      })

      if (firstSnapshot?.odometer != null) {
        const delta = snapshot.odometer - firstSnapshot.odometer
        distanceKm = delta > 0 ? Math.round(delta * 100) / 100 : distanceKm
      }
    }

    await this.db.trip.update({
      where: { id: openTrip.id },
      data: {
        endedAt,
        durationMin,
        distanceKm,
        endLatitude: snapshot.latitude,
        endLongitude: snapshot.longitude,
        endBatteryLevel: snapshot.batteryLevel,
      },
    })
  }

  private async updateChargeTracking(vehicleId: string, snapshot: {
    isCharging: boolean
    chargeState: string | null
    chargeEnergyAddedKwh: number | null
    batteryLevel: number
    chargeLimitSoc: number | null
    latitude: number | null
    longitude: number | null
  }) {
    const openSession = await this.db.chargeSession.findFirst({
      where: { vehicleId, endedAt: null },
      orderBy: { startedAt: 'desc' },
    })

    if (snapshot.isCharging) {
      if (!openSession) {
        await this.db.chargeSession.create({
          data: {
            vehicleId,
            startedAt: new Date(),
            energyAddedKwh: snapshot.chargeEnergyAddedKwh,
            startBatteryLevel: snapshot.batteryLevel,
            chargeLimitSoc: snapshot.chargeLimitSoc,
            latitude: snapshot.latitude,
            longitude: snapshot.longitude,
            chargeType: 'UNKNOWN',
          },
        })
      } else if (snapshot.chargeEnergyAddedKwh != null) {
        await this.db.chargeSession.update({
          where: { id: openSession.id },
          data: {
            energyAddedKwh: snapshot.chargeEnergyAddedKwh,
          },
        })
      }
      return
    }

    if (!openSession) {
      return
    }

    const endedAt = new Date()
    const durationMin = Math.max(1, Math.round((endedAt.getTime() - openSession.startedAt.getTime()) / 60_000))

    await this.db.chargeSession.update({
      where: { id: openSession.id },
      data: {
        endedAt,
        durationMin,
        endBatteryLevel: snapshot.batteryLevel,
        chargeLimitSoc: snapshot.chargeLimitSoc,
      },
    })
  }
}
