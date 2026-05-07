import type { VehicleRepository } from './vehicle.repository.js'
import type { TeslaEcoPolicyService } from '../../providers/tesla/tesla-eco-policy.service.js'
import type { TeslaSyncService } from '../../providers/tesla/tesla-sync.service.js'
import { NotFoundError } from '../../common/errors/app-error.js'

export class VehicleService {
  constructor(
    private readonly repo: VehicleRepository,
    private readonly ecoPolicy: TeslaEcoPolicyService,
    private readonly syncService: TeslaSyncService,
  ) {}

  async getCurrentVehicle(userId: string) {
    const vehicle = await this.repo.findActive(userId)
    if (!vehicle) throw new NotFoundError('Vehicle')
    const snapshot = await this.repo.getLatestSnapshot(vehicle.id)
    return {
      id: vehicle.id,
      vin: vehicle.vin,
      displayName: vehicle.displayName,
      model: vehicle.model,
      year: vehicle.year,
      color: vehicle.color,
      state: snapshot?.vehicleState ?? 'unknown',
      lastSeenAt: snapshot?.capturedAt ?? null,
      isCached: true,
    }
  }

  async getVehicleState(userId: string) {
    const vehicle = await this.repo.findActive(userId)
    if (!vehicle) throw new NotFoundError('Vehicle')

    // Check eco policy: return cached if within TTL
    const cached = await this.ecoPolicy.getCachedState(vehicle.id)
    if (cached) return { ...cached, isCached: true }

    // Fetch fresh from Tesla
    const fresh = await this.syncService.syncVehicleState(vehicle)
    return { ...fresh, isCached: false }
  }

  async getVehicleLocation(userId: string) {
    const vehicle = await this.repo.findActive(userId)
    if (!vehicle) throw new NotFoundError('Vehicle')

    const snapshot = await this.repo.getLatestSnapshot(vehicle.id)
    if (!snapshot?.latitude || !snapshot?.longitude) {
      return null
    }
    return {
      latitude: snapshot.latitude,
      longitude: snapshot.longitude,
      heading: snapshot.heading,
      capturedAt: snapshot.capturedAt,
      isCached: true,
    }
  }

  async forceSync(userId: string) {
    const vehicle = await this.repo.findActive(userId)
    if (!vehicle) throw new NotFoundError('Vehicle')
    const state = await this.syncService.syncVehicleState(vehicle, { force: true })
    return state
  }
}
