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
      const latitude = driveState.latitude ?? driveState.native_latitude ?? locationData.latitude ?? locationData.native_latitude ?? null
      const longitude = driveState.longitude ?? driveState.native_longitude ?? locationData.longitude ?? locationData.native_longitude ?? null
      const headingRaw = driveState.heading ?? driveState.native_heading ?? locationData.heading ?? locationData.native_heading ?? null
      const previousSnapshot = await this.vehicleRepo.getLatestSnapshot(vehicle.id)
      const movedKm = this.computeDistanceKm(
        previousSnapshot?.latitude ?? null,
        previousSnapshot?.longitude ?? null,
        latitude,
        longitude,
      )
      const inferredDrivingFromMotion = movedKm >= 0.05 && data.state !== 'asleep' && data.state !== 'offline'
      const isDrivingNow = (driveState.speed ?? 0) > 0 || shiftState === 'd' || shiftState === 'r' || inferredDrivingFromMotion

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

  private computeDistanceKm(
    lat1: number | null,
    lon1: number | null,
    lat2: number | null,
    lon2: number | null,
  ): number {
    if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return 0

    const toRad = (d: number) => d * (Math.PI / 180)
    const dLat = toRad(lat2 - lat1)
    const dLon = toRad(lon2 - lon1)
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return 6371 * c
  }

  private async computeTripLiveMetrics(vehicleId: string, startedAt: Date, currentOdometer: number | null) {
    const snapshots = await this.db.vehicleStateSnapshot.findMany({
      where: { vehicleId, capturedAt: { gte: startedAt } },
      orderBy: { capturedAt: 'asc' },
      select: {
        capturedAt: true,
        odometer: true,
        latitude: true,
        longitude: true,
        power: true,
      },
    })

    if (snapshots.length === 0) {
      return {
        distanceKm: null as number | null,
        energyUsedKwh: null as number | null,
        avgConsumptionKwh100: null as number | null,
      }
    }

    let distanceKm: number | null = null
    const firstWithOdometer = snapshots.find((s) => s.odometer != null)
    if (currentOdometer != null && firstWithOdometer?.odometer != null) {
      const delta = currentOdometer - firstWithOdometer.odometer
      if (delta > 0) distanceKm = Math.round(delta * 100) / 100
    }

    if (distanceKm == null) {
      let gpsKm = 0
      for (let i = 1; i < snapshots.length; i++) {
        const segKm = this.computeDistanceKm(
          snapshots[i - 1]?.latitude ?? null,
          snapshots[i - 1]?.longitude ?? null,
          snapshots[i]?.latitude ?? null,
          snapshots[i]?.longitude ?? null,
        )
        if (segKm >= 0.03) gpsKm += segKm
      }
      if (gpsKm > 0) distanceKm = Math.round(gpsKm * 100) / 100
    }

    let energyKwh = 0
    for (let i = 1; i < snapshots.length; i++) {
      const prev = snapshots[i - 1]
      const curr = snapshots[i]
      if (!prev || !curr) continue

      const dtHours = (curr.capturedAt.getTime() - prev.capturedAt.getTime()) / 3_600_000
      if (dtHours <= 0 || dtHours > 0.5) continue

      const pPrev = Math.max(0, prev.power ?? 0)
      const pCurr = Math.max(0, curr.power ?? 0)
      energyKwh += ((pPrev + pCurr) / 2) * dtHours
    }
    const energyUsedKwh = energyKwh > 0 ? Math.round(energyKwh * 100) / 100 : null

    const avgConsumptionKwh100 =
      distanceKm != null && distanceKm > 0 && energyUsedKwh != null
        ? Math.round(((energyUsedKwh / distanceKm) * 100) * 10) / 10
        : null

    return { distanceKm, energyUsedKwh, avgConsumptionKwh100 }
  }

  private async updateTripTracking(vehicleId: string, snapshot: {
    isDriving: boolean
    isCharging: boolean
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

      const live = await this.computeTripLiveMetrics(vehicleId, openTrip.startedAt, snapshot.odometer)

      if (snapshot.speed != null && (openTrip.maxSpeedKmh == null || snapshot.speed > openTrip.maxSpeedKmh)) {
        await this.db.trip.update({
          where: { id: openTrip.id },
          data: {
            maxSpeedKmh: snapshot.speed,
            distanceKm: live.distanceKm,
            energyUsedKwh: live.energyUsedKwh,
            avgConsumptionKwh100: live.avgConsumptionKwh100,
            durationMin: Math.max(1, Math.round((Date.now() - openTrip.startedAt.getTime()) / 60_000)),
            endLatitude: snapshot.latitude,
            endLongitude: snapshot.longitude,
            endBatteryLevel: snapshot.batteryLevel,
          },
        })
      } else {
        await this.db.trip.update({
          where: { id: openTrip.id },
          data: {
            distanceKm: live.distanceKm,
            energyUsedKwh: live.energyUsedKwh,
            avgConsumptionKwh100: live.avgConsumptionKwh100,
            durationMin: Math.max(1, Math.round((Date.now() - openTrip.startedAt.getTime()) / 60_000)),
            endLatitude: snapshot.latitude,
            endLongitude: snapshot.longitude,
            endBatteryLevel: snapshot.batteryLevel,
          },
        })
      }
      return
    }

    if (!openTrip) {
      // Recovery path: if we missed live "driving" state but the vehicle clearly moved
      // between the last two snapshots, persist a closed trip segment.
      const recent = await this.db.vehicleStateSnapshot.findMany({
        where: { vehicleId },
        orderBy: { capturedAt: 'desc' },
        take: 2,
        select: {
          capturedAt: true,
          latitude: true,
          longitude: true,
          batteryLevel: true,
          odometer: true,
          isCharging: true,
        },
      })

      if (recent.length < 2) return

      const current = recent[0]
      const previous = recent[1]
      if (!current || !previous) return
      if (current.isCharging || previous.isCharging || snapshot.isCharging) return

      const spanMinutes = (current.capturedAt.getTime() - previous.capturedAt.getTime()) / 60_000
      if (spanMinutes <= 0 || spanMinutes > 720) return

      let distanceKm: number | null = null
      if (current.odometer != null && previous.odometer != null) {
        const odoDelta = current.odometer - previous.odometer
        if (odoDelta > 0) distanceKm = Math.round(odoDelta * 100) / 100
      }

      if (distanceKm == null) {
        const movedKm = this.computeDistanceKm(
          previous.latitude ?? null,
          previous.longitude ?? null,
          current.latitude ?? null,
          current.longitude ?? null,
        )
        if (movedKm >= 0.3) {
          distanceKm = Math.round(movedKm * 100) / 100
        }
      }

      if (distanceKm == null || distanceKm < 0.3) return

      const alreadySaved = await this.db.trip.findFirst({
        where: {
          vehicleId,
          startedAt: previous.capturedAt,
          endedAt: current.capturedAt,
        },
        select: { id: true },
      })
      if (alreadySaved) return

      const recoveredStartedAt =
        spanMinutes > 120
          ? new Date(current.capturedAt.getTime() - 30 * 60_000)
          : previous.capturedAt

      const live = await this.computeTripLiveMetrics(vehicleId, previous.capturedAt, current.odometer)

      await this.db.trip.create({
        data: {
          vehicleId,
          startedAt: recoveredStartedAt,
          endedAt: current.capturedAt,
          durationMin: Math.max(1, Math.round(spanMinutes)),
          distanceKm: live.distanceKm ?? distanceKm,
          energyUsedKwh: live.energyUsedKwh,
          avgConsumptionKwh100: live.avgConsumptionKwh100,
          startLatitude: previous.latitude,
          startLongitude: previous.longitude,
          endLatitude: current.latitude,
          endLongitude: current.longitude,
          startBatteryLevel: previous.batteryLevel,
          endBatteryLevel: current.batteryLevel,
          maxSpeedKmh: snapshot.speed ?? null,
        },
      })
      return
    }

    const endedAt = new Date()
    const durationMin = Math.max(1, Math.round((endedAt.getTime() - openTrip.startedAt.getTime()) / 60_000))

    const live = await this.computeTripLiveMetrics(vehicleId, openTrip.startedAt, snapshot.odometer)

    await this.db.trip.update({
      where: { id: openTrip.id },
      data: {
        endedAt,
        durationMin,
        distanceKm: live.distanceKm,
        energyUsedKwh: live.energyUsedKwh,
        avgConsumptionKwh100: live.avgConsumptionKwh100,
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
