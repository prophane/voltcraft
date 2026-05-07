import fp from 'fastify-plugin'
import { Redis } from 'ioredis'
import { env } from '../config/env.js'

declare module 'fastify' {
  interface FastifyInstance {
    redis: Redis
  }
}

export const redisPlugin = fp(async (app) => {
  const redis = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => Math.min(times * 200, 3000),
    lazyConnect: false,
  })

  redis.on('error', (err) => app.log.error({ err }, 'Redis error'))
  redis.on('ready', () => app.log.info('Redis connected'))

  app.decorate('redis', redis)
  app.addHook('onClose', async () => { await redis.quit() })
})
