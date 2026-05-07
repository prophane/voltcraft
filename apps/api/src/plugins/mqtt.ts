import fp from 'fastify-plugin'
import mqtt, { type MqttClient } from 'mqtt'
import { env } from '../config/env.js'

declare module 'fastify' {
  interface FastifyInstance {
    mqtt: MqttClient
  }
}

export const mqttPlugin = fp(async (app) => {
  const brokerUrl = `mqtt://${env.MQTT_BROKER}:${env.MQTT_PORT}`

  const client = mqtt.connect(brokerUrl, {
    clientId: env.MQTT_CLIENT_ID,
    username: env.MQTT_USERNAME || undefined,
    password: env.MQTT_PASSWORD || undefined,
    reconnectPeriod: 5000,
    connectTimeout: 10_000,
    clean: true,
  })

  client.on('connect', () => app.log.info('MQTT broker connected'))
  client.on('error', (err) => app.log.error({ err }, 'MQTT error'))
  client.on('offline', () => app.log.warn('MQTT broker offline'))
  client.on('reconnect', () => app.log.info('MQTT reconnecting...'))

  app.decorate('mqtt', client)
  app.addHook('onClose', async () => {
    await new Promise<void>((resolve) => client.end(false, {}, () => resolve()))
  })
})
