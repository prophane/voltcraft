import type { MqttClient } from 'mqtt'
import { mqttTopics } from '@voltcraft/shared'

type CommandHandler = (command: string) => Promise<void>

/**
 * Listens to MQTT command topics and dispatches them to the command handler.
 * Allows Home Assistant to send commands to Voltcraft.
 */
export class MqttCommandListener {
  constructor(
    private readonly client: MqttClient,
    private readonly handler: CommandHandler,
  ) {}

  subscribe(vin: string): void {
    const commands = [
      mqttTopics.commandLock(vin),
      mqttTopics.commandUnlock(vin),
      mqttTopics.commandClimateOn(vin),
      mqttTopics.commandClimateOff(vin),
      mqttTopics.commandStartCharge(vin),
      mqttTopics.commandStopCharge(vin),
      mqttTopics.commandWake(vin),
    ]

    for (const topic of commands) {
      this.client.subscribe(topic, { qos: 1 })
    }

    this.client.on('message', (topic, _payload) => {
      const command = this.topicToCommand(vin, topic)
      if (command) {
        this.handler(command).catch((err) => {
          console.error(`MQTT command error (${command}):`, err)
        })
      }
    })
  }

  private topicToCommand(vin: string, topic: string): string | null {
    const map: Record<string, string> = {
      [mqttTopics.commandLock(vin)]: 'lock',
      [mqttTopics.commandUnlock(vin)]: 'unlock',
      [mqttTopics.commandClimateOn(vin)]: 'climate_start',
      [mqttTopics.commandClimateOff(vin)]: 'climate_stop',
      [mqttTopics.commandStartCharge(vin)]: 'charge_start',
      [mqttTopics.commandStopCharge(vin)]: 'charge_stop',
      [mqttTopics.commandWake(vin)]: 'wake',
    }
    return map[topic] ?? null
  }
}
