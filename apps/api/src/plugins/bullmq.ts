import fp from 'fastify-plugin'
import { Queue } from 'bullmq'
import { Redis } from 'ioredis'
import { env } from '../config/env.js'

export type QueueName = 'vehicle-sync' | 'automation' | 'mqtt-republish'

const queues: Map<QueueName, Queue> = new Map()

export function getQueue(name: QueueName): Queue {
  const q = queues.get(name)
  if (!q) throw new Error(`Queue "${name}" not registered`)
  return q
}

declare module 'fastify' {
  interface FastifyInstance {
    getQueue: (name: QueueName) => Queue
  }
}

export const bullmqPlugin = fp(async (app) => {
  const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null })

  const queueNames: QueueName[] = ['vehicle-sync', 'automation', 'mqtt-republish']
  for (const name of queueNames) {
    queues.set(name, new Queue(name, { connection }))
  }

  app.decorate('getQueue', getQueue)

  app.addHook('onClose', async () => {
    for (const q of queues.values()) await q.close()
    await connection.quit()
  })
})
