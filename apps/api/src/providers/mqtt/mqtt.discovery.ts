import type { MqttClient } from 'mqtt'
import { mqttTopics } from '@voltcraft/shared'

interface SensorConfig {
  name: string
  objectId: string
  stateTopic: string
  unitOfMeasurement?: string
  deviceClass?: string
  valueTemplate?: string
  icon?: string
}

interface BinarySensorConfig {
  name: string
  objectId: string
  stateTopic: string
  deviceClass?: string
  payloadOn?: string
  payloadOff?: string
}

interface DeviceInfo {
  identifiers: string[]
  name: string
  model: string
  manufacturer: string
}

export class MqttDiscovery {
  constructor(private readonly client: MqttClient) {}

  publishDiscovery(vin: string, displayName: string, model: string): void {
    const device: DeviceInfo = {
      identifiers: [`voltcraft_${vin}`],
      name: displayName,
      model: model || 'Tesla',
      manufacturer: 'Tesla',
    }

    const sensors: SensorConfig[] = [
      {
        name: 'Battery Level',
        objectId: 'battery_level',
        stateTopic: mqttTopics.batteryLevel(vin),
        unitOfMeasurement: '%',
        deviceClass: 'battery',
        icon: 'mdi:battery',
      },
      {
        name: 'Estimated Range',
        objectId: 'estimated_range',
        stateTopic: mqttTopics.estimatedRange(vin),
        unitOfMeasurement: 'km',
        deviceClass: 'distance',
        icon: 'mdi:map-marker-distance',
      },
      {
        name: 'Inside Temperature',
        objectId: 'inside_temp',
        stateTopic: mqttTopics.insideTemp(vin),
        unitOfMeasurement: '°C',
        deviceClass: 'temperature',
      },
      {
        name: 'Outside Temperature',
        objectId: 'outside_temp',
        stateTopic: mqttTopics.outsideTemp(vin),
        unitOfMeasurement: '°C',
        deviceClass: 'temperature',
      },
      {
        name: 'Vehicle State',
        objectId: 'vehicle_state',
        stateTopic: mqttTopics.state(vin),
        icon: 'mdi:car',
      },
      {
        name: 'Last Seen',
        objectId: 'last_seen',
        stateTopic: mqttTopics.lastSeen(vin),
        deviceClass: 'timestamp',
        icon: 'mdi:clock-outline',
      },
    ]

    const binarySensors: BinarySensorConfig[] = [
      {
        name: 'Locked',
        objectId: 'is_locked',
        stateTopic: mqttTopics.isLocked(vin),
        deviceClass: 'lock',
        payloadOn: 'true',
        payloadOff: 'false',
      },
      {
        name: 'Charging',
        objectId: 'is_charging',
        stateTopic: mqttTopics.isCharging(vin),
        deviceClass: 'battery_charging',
        payloadOn: 'true',
        payloadOff: 'false',
      },
      {
        name: 'Climate On',
        objectId: 'climate_on',
        stateTopic: mqttTopics.climateOn(vin),
        payloadOn: 'true',
        payloadOff: 'false',
      },
      {
        name: 'At Home',
        objectId: 'at_home',
        stateTopic: mqttTopics.atHome(vin),
        deviceClass: 'presence',
        payloadOn: 'true',
        payloadOff: 'false',
      },
    ]

    for (const sensor of sensors) {
      const topic = mqttTopics.haDiscovery('sensor', vin, sensor.objectId)
      this.client.publish(
        topic,
        JSON.stringify({ ...sensor, device, unique_id: `voltcraft_${vin}_${sensor.objectId}` }),
        { retain: true, qos: 1 },
      )
    }

    for (const bs of binarySensors) {
      const topic = mqttTopics.haDiscovery('binary_sensor', vin, bs.objectId)
      this.client.publish(
        topic,
        JSON.stringify({ ...bs, device, unique_id: `voltcraft_${vin}_${bs.objectId}` }),
        { retain: true, qos: 1 },
      )
    }
  }
}
