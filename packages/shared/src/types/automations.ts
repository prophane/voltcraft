import type { AutomationTrigger, AutomationAction } from '../constants/vehicle-states.js'

export interface AutomationRule {
  id: string
  name: string
  enabled: boolean
  trigger: AutomationTrigger
  triggerConfig: Record<string, unknown>
  action: AutomationAction
  actionConfig: Record<string, unknown>
  createdAt: string
  lastExecutedAt: string | null
  executionCount: number
}

export interface AutomationExecutionLog {
  id: string
  ruleId: string
  executedAt: string
  success: boolean
  output?: string
  error?: string
}
