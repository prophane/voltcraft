// MQTT topic builder for Voltcraft
// Base: voltcraft/<vin>/<domain>/<entity>

export const MQTT_BASE = 'voltcraft'

export const mqttTopics = {
  // State topics
  state: (vin: string) => `${MQTT_BASE}/${vin}/state`,
  batteryLevel: (vin: string) => `${MQTT_BASE}/${vin}/battery/level`,
  estimatedRange: (vin: string) => `${MQTT_BASE}/${vin}/battery/range`,
  isLocked: (vin: string) => `${MQTT_BASE}/${vin}/security/locked`,
  isCharging: (vin: string) => `${MQTT_BASE}/${vin}/charge/active`,
  chargeState: (vin: string) => `${MQTT_BASE}/${vin}/charge/state`,
  climateOn: (vin: string) => `${MQTT_BASE}/${vin}/climate/active`,
  insideTemp: (vin: string) => `${MQTT_BASE}/${vin}/climate/inside_temp`,
  outsideTemp: (vin: string) => `${MQTT_BASE}/${vin}/climate/outside_temp`,
  latitude: (vin: string) => `${MQTT_BASE}/${vin}/location/latitude`,
  longitude: (vin: string) => `${MQTT_BASE}/${vin}/location/longitude`,
  atHome: (vin: string) => `${MQTT_BASE}/${vin}/location/at_home`,
  lastSeen: (vin: string) => `${MQTT_BASE}/${vin}/meta/last_seen`,

  // Command topics (subscribed by Voltcraft, published by HA)
  commandLock: (vin: string) => `${MQTT_BASE}/${vin}/command/lock`,
  commandUnlock: (vin: string) => `${MQTT_BASE}/${vin}/command/unlock`,
  commandClimateOn: (vin: string) => `${MQTT_BASE}/${vin}/command/climate_on`,
  commandClimateOff: (vin: string) => `${MQTT_BASE}/${vin}/command/climate_off`,
  commandStartCharge: (vin: string) => `${MQTT_BASE}/${vin}/command/start_charge`,
  commandStopCharge: (vin: string) => `${MQTT_BASE}/${vin}/command/stop_charge`,
  commandWake: (vin: string) => `${MQTT_BASE}/${vin}/command/wake`,

  // Home Assistant discovery prefix
  haDiscovery: (component: string, vin: string, objectId: string) =>
    `homeassistant/${component}/voltcraft_${vin}/${objectId}/config`,
}
