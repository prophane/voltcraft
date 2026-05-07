import crypto from 'node:crypto'
import type { AuthRepository } from './auth.repository.js'
import { UnauthorizedError, ConflictError } from '../../common/errors/app-error.js'
import type { LoginInput, RegisterInput } from './auth.schemas.js'
import { env } from '../../config/env.js'

const SESSION_TTL_DAYS = 30

function hashPassword(password: string): string {
  // PBKDF2 — no external dep, good enough for local single-user app
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.pbkdf2Sync(password, salt, 310_000, 32, 'sha256').toString('hex')
  return `${salt}:${hash}`
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const candidate = crypto.pbkdf2Sync(password, salt, 310_000, 32, 'sha256').toString('hex')
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(candidate, 'hex'))
}

function generateToken(): string {
  return crypto.randomBytes(48).toString('hex')
}

export class AuthService {
  constructor(private readonly repo: AuthRepository) {}

  async register(input: RegisterInput) {
    const existing = await this.repo.findUserByEmail(input.email)
    if (existing) throw new ConflictError('Email already registered')

    const passwordHash = hashPassword(input.password)
    return this.repo.createUser({ ...input, passwordHash })
  }

  async login(input: LoginInput, meta?: { ip?: string; ua?: string }) {
    const user = await this.repo.findUserByEmail(input.email)
    if (!user || !verifyPassword(input.password, user.passwordHash)) {
      throw new UnauthorizedError('Invalid email or password')
    }

    const token = generateToken()
    const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000)
    const session = await this.repo.createSession(user.id, token, expiresAt, meta)

    return {
      token: session.token,
      expiresAt: session.expiresAt,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    }
  }

  async validateSession(token: string) {
    if (env.AUTH_DISABLED && token === 'SYSTEM_AUTH_DISABLED') {
      const user = await this.repo.ensureSystemUser()
      return {
        id: 'SYSTEM_AUTH_DISABLED',
        userId: user.id,
        token,
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        createdAt: new Date(),
        ipAddress: null,
        userAgent: null,
        user,
      }
    }

    const session = await this.repo.findSession(token)
    if (!session) throw new UnauthorizedError('Session not found')
    if (session.expiresAt < new Date()) {
      await this.repo.deleteSession(token)
      throw new UnauthorizedError('Session expired')
    }
    return session
  }

  async logout(token: string) {
    await this.repo.deleteSession(token)
  }

  async isSetupRequired() {
    const count = await this.repo.countUsers()
    return count === 0
  }
}
