import { z } from 'zod'

export const createAutomationSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  trigger: z.enum([
    'schedule_recurring',
    'schedule_once',
    'arrive_home',
    'battery_below',
    'battery_above',
    'charging_complete',
  ]),
  triggerConfig: z.record(z.unknown()).default({}),
  action: z.enum([
    'start_climate',
    'stop_climate',
    'set_charge_limit',
    'start_charge',
    'stop_charge',
    'notify',
  ]),
  actionConfig: z.record(z.unknown()).default({}),
})

export const updateAutomationSchema = createAutomationSchema.partial().extend({
  enabled: z.boolean().optional(),
})

export type CreateAutomationInput = z.infer<typeof createAutomationSchema>
export type UpdateAutomationInput = z.infer<typeof updateAutomationSchema>
