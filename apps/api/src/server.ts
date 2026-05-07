import { buildApp } from './app.js'
import { env } from './config/env.js'
import { logger } from './config/logger.js'

async function start() {
  const app = await buildApp()

  try {
    await app.listen({ port: env.API_PORT, host: '0.0.0.0' })
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
  process.exit(0)
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

start()
