import type { FastifyInstance, FastifyRequest } from 'fastify'
import { UnauthorizedError } from '../../common/errors/app-error.js'
import { AuthRepository } from './auth.repository.js'
import { AuthService } from './auth.service.js'
import { loginSchema, registerSchema } from './auth.schemas.js'
import { ok } from '../../common/http/response.js'

const COOKIE_NAME = 'voltcraft_session'

export async function authRoutes(app: FastifyInstance) {
  const repo = new AuthRepository(app.prisma)
  const service = new AuthService(repo)

  // ── Setup check ─────────────────────────────────────────────
  app.get('/setup', { schema: { tags: ['auth'] } }, async () => {
    const required = await service.isSetupRequired()
    return ok({ setupRequired: required })
  })

  // ── Register (first user only) ───────────────────────────────
  app.post('/register', { schema: { tags: ['auth'] } }, async (req, reply) => {
    const input = registerSchema.parse(req.body)
    const required = await service.isSetupRequired()
    if (!required) {
      return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Setup already done' } })
    }
    const user = await service.register(input)
    return reply.status(201).send(ok({ id: user.id, email: user.email, name: user.name }))
  })

  // ── Login ────────────────────────────────────────────────────
  app.post('/login', { schema: { tags: ['auth'] } }, async (req, reply) => {
    const input = loginSchema.parse(req.body)
    const result = await service.login(input, {
      ip: req.ip,
      ua: req.headers['user-agent'],
    })
    reply.setCookie(COOKIE_NAME, result.token, {
      httpOnly: true,
      secure: false, // handled by external proxy
      sameSite: 'lax',
      path: '/',
      expires: result.expiresAt,
    })
    return ok(result)
  })

  // ── Session ──────────────────────────────────────────────────
  app.get('/session', { schema: { tags: ['auth'] } }, async (req, reply) => {
    const token = req.cookies[COOKIE_NAME]
    if (!token) throw new UnauthorizedError()
    const session = await service.validateSession(token)
    return ok({
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        role: session.user.role,
      },
    })
  })

  // ── Logout ───────────────────────────────────────────────────
  app.post('/logout', { schema: { tags: ['auth'] } }, async (req, reply) => {
    const token = req.cookies[COOKIE_NAME]
    if (token) await service.logout(token)
    reply.clearCookie(COOKIE_NAME)
    return ok({ loggedOut: true })
  })
}

// ── Shared auth guard (used in other route files) ────────────────
export async function requireAuth(req: FastifyRequest): Promise<string> {
  const cookie = req.cookies['voltcraft_session']
  if (!cookie) throw new UnauthorizedError()
  return cookie
}
