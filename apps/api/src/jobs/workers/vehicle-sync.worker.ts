import { Worker } from 'bullmq'
import Redis from 'ioredis'
import { PrismaClient } from '@prisma/client'
import { TeslaClient } from '../../providers/tesla/tesla.client.js'
import { TeslaEcoPolicyService } from '../../providers/tesla/tesla-eco-policy.service.js'
import { TeslaSyncService } from '../../providers/tesla/tesla-sync.service.js'
import { VehicleRepository } from '../../modules/vehicle/vehicle.repository.js'
import { MqttPublisher } from '../../providers/mqtt/mqtt.publisher.js'
import { env } from '../../config/env.js'
import { logger } from '../../config/logger.js'
import mqtt from 'mqtt'

const db = new PrismaClient()
const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null })
const mqttClient = mqtt.connect(`mqtt://${env.MQTT_BROKER}:${env.MQTT_PORT}`, {
  clientId: `${env.MQTT_CLIENT_ID}-worker`,
  username: env.MQTT_USERNAME || undefined,
  password: env.MQTT_PASSWORD || undefined,
})

const teslaClient = new TeslaClient(db, redis)
const ecoPolicy = new TeslaEcoPolicyService(redis)
const vehicleRepo = new VehicleRepository(db)
const syncService = new TeslaSyncService(teslaClient, vehicleRepo, ecoPolicy, db)
const publisher = new MqttPublisher(mqttClient)

export const vehicleSyncWorker = new Worker(
  'vehicle-sync',
  async (job) => {
    const { vehicleId } = job.data as { vehicleId: string }
    logger.info({ vehicleId }, 'Vehicle sync job started')

    const vehicle = await vehicleRepo.findById(vehicleId)
    if (!vehicle) {
      logger.warn({ vehicleId }, 'Vehicle not found, skipping sync')
      return
    }

    try {
      const snapshot = await syncService.syncVehicleState(vehicle as never)
      publisher.publishVehicleState(vehicle.vin, snapshot as never)
      logger.info({ vehicleId, state: snapshot['vehicleState'] }, 'Sync complete')
    } catch (err) {
      logger.error({ err, vehicleId }, 'Sync failed')
      throw err // BullMQ will retry
    }
  },
  {
    connection: redis,
    concurrency: 3,
    limiter: { max: 10, duration: 60_000 }, // max 10 syncs/min across all vehicles
  },
)

vehicleSyncWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'Vehicle sync job failed')
})
