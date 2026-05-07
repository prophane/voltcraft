import type { Prisma, PrismaClient } from '@prisma/client'

export class SettingsRepository {
  constructor(private readonly db: PrismaClient) {}

  async findByUserId(userId: string) {
    return this.db.userSettings.upsert({
      where: { userId },
      create: { userId },
      update: {},
    })
  }

  async update(userId: string, data: Prisma.UserSettingsUpdateInput) {
    return this.db.userSettings.update({
      where: { userId },
      data,
    })
  }
}
