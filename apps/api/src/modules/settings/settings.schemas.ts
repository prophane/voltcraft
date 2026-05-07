import { z } from 'zod'

export const updateSettingsSchema = z.object({
  distanceUnit: z.enum(['km', 'miles']).optional(),
  temperatureUnit: z.enum(['celsius', 'fahrenheit']).optional(),
  pricePerKwh: z.number().min(0).max(10).optional(),
  currency: z.string().length(3).optional(),
  homeLatitude: z.number().optional(),
  homeLongitude: z.number().optional(),
  homeRadiusM: z.number().min(50).max(5000).optional(),
  timezone: z.string().optional(),
  ecoModeEnabled: z.boolean().optional(),
  mqttEnabled: z.boolean().optional(),
  mqttBroker: z.string().optional(),
  mqttPort: z.number().min(1).max(65535).optional(),
  mqttUsername: z.string().optional(),
  mqttPassword: z.string().optional(),
})
