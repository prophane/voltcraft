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
