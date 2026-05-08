import { z } from 'zod'

export const chargeLimitSchema = z.object({
  percent: z.number().int().min(50).max(100),
})

export type ChargeLimitInput = z.infer<typeof chargeLimitSchema>

export const cabinOverheatProtectionSchema = z.object({
  on: z.boolean(),
  fanOnly: z.boolean().optional().default(false),
})

export type CabinOverheatProtectionInput = z.infer<typeof cabinOverheatProtectionSchema>

export const setTemperatureSchema = z.object({
  driverTemp: z.number().min(15).max(30),
  passengerTemp: z.number().min(15).max(30).optional(),
})

export const seatLevelSchema = z.object({
  seat: z.number().int().min(0).max(10),
  level: z.number().int().min(0).max(3),
})

export const speedLimitSetSchema = z.object({
  limitMph: z.number().int().min(50).max(120),
})

export const pinSchema = z.object({
  pin: z.string().regex(/^\d{4}$/),
})

export const valetSchema = z.object({
  pin: z.string().regex(/^\d{4}$/).optional(),
})

export const softwareUpdateScheduleSchema = z.object({
  offsetSec: z.number().int().min(0).max(24 * 60 * 60).default(0),
})

export const windowCloseSchema = z.object({
  lat: z.number().min(-90).max(90).optional(),
  lon: z.number().min(-180).max(180).optional(),
})

export const navigationGpsSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  order: z.number().int().min(1).max(10).optional(),
})
