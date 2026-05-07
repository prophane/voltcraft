import type { PrismaClient } from '@prisma/client'
import type { RegisterInput } from './auth.schemas.js'

export class AuthRepository {
  constructor(private readonly db: PrismaClient) {}

  async findUserByEmail(email: string) {
    return this.db.user.findUnique({ where: { email } })
  }

  async findUserById(id: string) {
    return this.db.user.findUnique({ where: { id } })
  }

  async createUser(input: RegisterInput & { passwordHash: string }) {
    return this.db.user.create({
      data: {
        email: input.email,
        name: input.name,
        passwordHash: input.passwordHash,
      },
    })
  }

  async createSession(userId: string, token: string, expiresAt: Date, meta?: { ip?: string; ua?: string }) {
    return this.db.session.create({
      data: {
        userId,
        token,
        expiresAt,
        ipAddress: meta?.ip,
        userAgent: meta?.ua,
      },
    })
  }

  async findSession(token: string) {
    return this.db.session.findUnique({
      where: { token },
      include: { user: true },
    })
  }

  async deleteSession(token: string) {
    return this.db.session.deleteMany({ where: { token } })
  }

  async deleteExpiredSessions() {
    return this.db.session.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    })
  }

  async countUsers() {
    return this.db.user.count()
  }
}
