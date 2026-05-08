import { logger } from '../config/logger.js'
import { scheduleAutomations, scheduleVehicleSync } from './schedulers/sync.scheduler.js'
import { automationWorker } from './workers/automation.worker.js'
import { vehicleSyncWorker } from './workers/vehicle-sync.worker.js'

let started = false
let scheduleTimer: NodeJS.Timeout | null = null

async function runSchedulingPass() {
  await scheduleAutomations()
  await scheduleVehicleSync()
}

export async function startBackgroundJobs() {
  if (started) return
  started = true

  // Ensure workers are initialized (imports are intentional side effects).
  void automationWorker
  void vehicleSyncWorker

  try {
    await runSchedulingPass()
    logger.info('Background jobs initialized (workers + schedulers)')
  } catch (err) {
    logger.error({ err }, 'Initial background job scheduling failed')
  }

  // Reconcile schedulers periodically (new vehicles/rules, changed states).
  scheduleTimer = setInterval(async () => {
    try {
      await runSchedulingPass()
    } catch (err) {
      logger.error({ err }, 'Periodic background scheduling pass failed')
    }
  }, 5 * 60_000)
}

export async function stopBackgroundJobs() {
  if (scheduleTimer) {
    clearInterval(scheduleTimer)
    scheduleTimer = null
  }

  await Promise.allSettled([
    automationWorker.close(),
    vehicleSyncWorker.close(),
  ])
}
