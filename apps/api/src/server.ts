import { buildApp } from './app.js'
import { env } from './config/env.js'
import { logger } from './config/logger.js'
import { ensureTeslaCommandProxyAssets } from './config/tesla-config.js'
import { startBackgroundJobs, stopBackgroundJobs } from './jobs/runtime.js'

let appInstance: Awaited<ReturnType<typeof buildApp>> | null = null

async function start() {
  await ensureTeslaCommandProxyAssets().catch((error) => {
    logger.warn({ error }, 'Failed to prepare Tesla command proxy assets')
  })

  const app = await buildApp()
  appInstance = app

  try {
    await app.listen({ port: env.API_PORT, host: '0.0.0.0' })
    await startBackgroundJobs()
    logger.info(`🚗 Voltcraft API running on port ${env.API_PORT}`)
    logger.info(`📖 Swagger docs: http://localhost:${env.API_PORT}/docs`)
  } catch (err) {
    logger.error(err, 'Failed to start server')
    process.exit(1)
  }
}

// Graceful shutdown
const shutdown = async () => {
  logger.info('Shutting down gracefully...')
  await stopBackgroundJobs().catch(() => undefined)
  if (appInstance) {
    await appInstance.close().catch(() => undefined)
  }
  process.exit(0)
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

start()
