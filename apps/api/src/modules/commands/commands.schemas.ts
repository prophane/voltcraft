import { z } from 'zod'

export const chargeLimitSchema = z.object({
  percent: z.number().int().min(50).max(100),
})

export type ChargeLimitInput = z.infer<typeof chargeLimitSchema>
