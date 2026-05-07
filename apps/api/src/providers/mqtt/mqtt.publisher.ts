import type { MqttClient } from 'mqtt'
import { mqttTopics } from '@voltcraft/shared'

export class MqttPublisher {
  constructor(private readonly client: MqttClient) {}

  private publish(topic: string, payload: unknown): void {
    if (!this.client.connected) return
    const message = typeof payload === 'string' ? payload : JSON.stringify(payload)
    this.client.publish(topic, message, { retain: true, qos: 1 }, (err) => {
      if (err) console.warn(`MQTT publish failed: ${topic}`, err.message)
    })
  }

  publishVehicleState(vin: string, snapshot: Record<string, unknown>): void {
    this.publish(mqttTopics.state(vin), snapshot['vehicleState'])
    this.publish(mqttTopics.batteryLevel(vin), snapshot['batteryLevel'])
    this.publish(mqttTopics.estimatedRange(vin), snapshot['batteryRange'])
    this.publish(mqttTopics.isLocked(vin), snapshot['isLocked'] ? 'true' : 'false')
    this.publish(mqttTopics.isCharging(vin), snapshot['isCharging'] ? 'true' : 'false')
    this.publish(mqttTopics.chargeState(vin), snapshot['chargeState'])
    this.publish(mqttTopics.climateOn(vin), snapshot['climateOn'] ? 'true' : 'false')
    this.publish(mqttTopics.lastSeen(vin), new Date().toISOString())

    if (snapshot['insideTemp'] !== null) this.publish(mqttTopics.insideTemp(vin), snapshot['insideTemp'])
    if (snapshot['outsideTemp'] !== null) this.publish(mqttTopics.outsideTemp(vin), snapshot['outsideTemp'])
    if (snapshot['latitude'] !== null) {
      this.publish(mqttTopics.latitude(vin), snapshot['latitude'])
      this.publish(mqttTopics.longitude(vin), snapshot['longitude'])
    }
    this.publish(mqttTopics.atHome(vin), snapshot['atHome'] ? 'true' : 'false')
  }
}
