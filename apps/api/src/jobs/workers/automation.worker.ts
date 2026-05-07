import { Worker } from 'bullmq'
import Redis from 'ioredis'
import { PrismaClient } from '@prisma/client'
import { AutomationsRepository } from '../../modules/automations/automations.repository.js'
import { TeslaClient } from '../../providers/tesla/tesla.client.js'
import { TeslaCommandService } from '../../providers/tesla/tesla-command.service.js'
import { VehicleRepository } from '../../modules/vehicle/vehicle.repository.js'
import type { CommandName } from '@voltcraft/shared'
import { env } from '../../config/env.js'
import { logger } from '../../config/logger.js'

const db = new PrismaClient()
const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null })
const automationsRepo = new AutomationsRepository(db)
const teslaClient = new TeslaClient(db, redis)
const commandService = new TeslaCommandService(teslaClient, redis)
const vehicleRepo = new VehicleRepository(db)

const ACTION_TO_COMMAND: Record<string, CommandName> = {
  start_climate: 'climate_start',
  stop_climate: 'climate_stop',
  set_charge_limit: 'set_charge_limit',
  start_charge: 'charge_start',
  stop_charge: 'charge_stop',
}

export const automationWorker = new Worker(
  'automation',
  async (job) => {
    const { ruleId } = job.data as { ruleId: string }
    const start = Date.now()

    const rules = await automationsRepo.getEnabledRules()
    const rule = rules.find((r) => r.id === ruleId)
    if (!rule) {
      logger.warn({ ruleId }, 'Automation rule not found or disabled')
      return
    }

    logger.info({ ruleId, action: rule.action }, 'Automation executing')

    try {
      if (rule.action === 'notify') {
        // Notification only: log it
        await db.notificationLog.create({
          data: {
            userId: rule.vehicle.teslaAccount.userId,
            title: (rule.actionConfig as Record<string, string>)['title'] ?? 'Voltcraft Automation',
            body: (rule.actionConfig as Record<string, string>)['message'] ?? rule.name,
            type: 'info',
          },
        })
      } else {
        const command = ACTION_TO_COMMAND[rule.action]
        if (!command) throw new Error(`Unknown action: ${rule.action}`)

        const vehicle = await vehicleRepo.findById(rule.vehicleId)
        if (!vehicle) throw new Error('Vehicle not found')

        await commandService.send(
          vehicle.vin,
          rule.vehicle.teslaAccount,
          command,
          rule.actionConfig as Record<string, unknown>,
        )
      }

      const duration = Date.now() - start
      await automationsRepo.logExecution(ruleId, true, 'OK', undefined, duration)
      await automationsRepo.update(ruleId, {
        lastExecutedAt: new Date(),
        lastStatus: 'success',
        executionCount: { increment: 1 },
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      const duration = Date.now() - start
      await automationsRepo.logExecution(ruleId, false, undefined, msg, duration)
      await automationsRepo.update(ruleId, { lastStatus: 'failed' })
      throw err
    }
  },
  { connection: redis, concurrency: 5 },
)

automationWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'Automation job failed')
})
