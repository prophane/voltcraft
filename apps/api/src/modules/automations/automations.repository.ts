import type { PrismaClient } from '@prisma/client'
import type { Prisma } from '@prisma/client'

export class AutomationsRepository {
  constructor(private readonly db: PrismaClient) {}

  async findAll(vehicleId: string) {
    return this.db.automationRule.findMany({
      where: { vehicleId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    })
  }

  async findById(id: string, vehicleId: string) {
    return this.db.automationRule.findFirst({
      where: { id, vehicleId, deletedAt: null },
    })
  }

  async create(vehicleId: string, data: {
    name: string
    description?: string
    trigger: string
    triggerConfig: Prisma.InputJsonValue
    action: string
    actionConfig: Prisma.InputJsonValue
  }) {
    return this.db.automationRule.create({
      data: { vehicleId, ...data },
    })
  }

  async update(id: string, data: Prisma.AutomationRuleUpdateInput) {
    return this.db.automationRule.update({ where: { id }, data })
  }

  async softDelete(id: string) {
    return this.db.automationRule.update({
      where: { id },
      data: { deletedAt: new Date(), enabled: false },
    })
  }

  async getExecutions(ruleId: string, limit = 50) {
    return this.db.automationExecutionLog.findMany({
      where: { ruleId },
      orderBy: { executedAt: 'desc' },
      take: limit,
    })
  }

  async logExecution(ruleId: string, success: boolean, output?: string, error?: string, durationMs?: number) {
    return this.db.automationExecutionLog.create({
      data: { ruleId, success, output, error, durationMs },
    })
  }

  async getEnabledRules() {
    return this.db.automationRule.findMany({
      where: { enabled: true, deletedAt: null },
      include: { vehicle: { include: { teslaAccount: true } } },
    })
  }
}
