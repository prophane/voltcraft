import { Queue } from 'bullmq'
import { Redis } from 'ioredis'
import { PrismaClient } from '@prisma/client'
import { AutomationsRepository } from '../../modules/automations/automations.repository.js'
import { env } from '../../config/env.js'
import { logger } from '../../config/logger.js'
import { TeslaEcoPolicyService } from '../../providers/tesla/tesla-eco-policy.service.js'

const db = new PrismaClient()
const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null })
const automationsRepo = new AutomationsRepository(db)
const ecoPolicy = new TeslaEcoPolicyService(redis)
const vehicleSyncQueue = new Queue('vehicle-sync', { connection: redis })
const automationQueue = new Queue('automation', { connection: redis })

/**
 * Schedule all enabled recurring automations.
 * Called once on startup and then re-scheduled via cron if needed.
 */
export async function scheduleAutomations(): Promise<void> {
  const rules = await automationsRepo.getEnabledRules()
  const recurring = rules.filter((r) => r.trigger === 'schedule_recurring')

  for (const rule of recurring) {
    const cfg = rule.triggerConfig as Record<string, string>
    const cron = cfg['cron']
    if (!cron) continue

    await automationQueue.upsertJobScheduler(
      `automation-${rule.id}`,
      { pattern: cron },
      { name: 'automation', data: { ruleId: rule.id } },
    )
    logger.info({ ruleId: rule.id, cron }, 'Automation scheduled')
  }
}

/**
 * Schedule periodic vehicle sync for all active vehicles.
 */
export async function scheduleVehicleSync(): Promise<void> {
  const vehicles = await db.vehicle.findMany({
    where: { isActive: true, deletedAt: null },
    include: { teslaAccount: true },
  })

  for (const vehicle of vehicles) {
    const snapshot = await db.vehicleStateSnapshot.findFirst({
      where: { vehicleId: vehicle.id },
      orderBy: { capturedAt: 'desc' },
    })

    const state = snapshot?.vehicleState ?? 'unknown'
    const intervalMs = ecoPolicy.getPollInterval(state, env.ECO_MODE_ENABLED)

    await vehicleSyncQueue.upsertJobScheduler(
      `sync-${vehicle.id}`,
      { every: intervalMs },
      { name: 'vehicle-sync', data: { vehicleId: vehicle.id } },
    )

    logger.info({ vehicleId: vehicle.id, state, intervalMs, ecoMode: env.ECO_MODE_ENABLED }, 'Vehicle sync scheduled')
  }
}
