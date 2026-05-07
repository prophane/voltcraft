import type { FastifyInstance, FastifyRequest } from 'fastify'
import { randomBytes } from 'node:crypto'
import { UnauthorizedError } from '../../common/errors/app-error.js'
import { AuthRepository } from './auth.repository.js'
import { AuthService } from './auth.service.js'
import { loginSchema, registerSchema } from './auth.schemas.js'
import { ok } from '../../common/http/response.js'
import { env } from '../../config/env.js'
import { bootstrapTeslaInventory } from '../../providers/tesla/tesla-bootstrap.service.js'
import { AppError } from '../../common/errors/app-error.js'

const COOKIE_NAME = 'voltcraft_session'
const TESLA_OAUTH_STATE_COOKIE = 'voltcraft_tesla_oauth_state'
const TESLA_OAUTH_RETURN_COOKIE = 'voltcraft_tesla_oauth_return'

type TeslaRegion = 'na' | 'eu' | 'cn'

const REGION_AUDIENCE: Record<TeslaRegion, string> = {
  na: 'https://fleet-api.prd.na.vn.cloud.tesla.com',
  eu: 'https://fleet-api.prd.eu.vn.cloud.tesla.com',
  cn: 'https://fleet-api.prd.cn.vn.cloud.tesla.cn',
}

const TESLA_FLEET_AUTH_URL = 'https://fleet-auth.prd.vn.cloud.tesla.com/oauth2/v3/token'

interface TeslaOAuthTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in?: number
}

function inferRegionFromToken(token: string): TeslaRegion {
  try {
    const payloadPart = token.split('.')[1]
    if (!payloadPart) return env.TESLA_REGION
    const padded = payloadPart.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (payloadPart.length % 4)) % 4)
    const payload = JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as { ou_code?: string }
    const ou = payload.ou_code?.toLowerCase()
    if (ou === 'eu' || ou === 'na' || ou === 'cn') return ou
    return env.TESLA_REGION
  } catch {
    return env.TESLA_REGION
  }
}

function audienceForRegion(region: TeslaRegion): string {
  return REGION_AUDIENCE[region] ?? REGION_AUDIENCE.na
}

export async function authRoutes(app: FastifyInstance) {
  const repo = new AuthRepository(app.prisma)
  const service = new AuthService(repo)

  const oauthCookieSameSite = env.NODE_ENV === 'production' ? 'none' : 'lax'

  app.get('/tesla/connect', { schema: { tags: ['auth'] } }, async (req, reply) => {
    app.log.info({ path: '/api/auth/tesla/connect' }, 'Tesla OAuth connect requested')

    if (!env.TESLA_CLIENT_ID || !env.TESLA_CLIENT_SECRET) {
      throw new AppError('TESLA_OAUTH_NOT_CONFIGURED', 'TESLA_CLIENT_ID / TESLA_CLIENT_SECRET are not configured on server', 400)
    }

    const query = req.query as { returnTo?: string } | undefined
    const returnTo = query?.returnTo && query.returnTo.startsWith('/') ? query.returnTo : '/settings'

    const state = randomBytes(16).toString('hex')
    reply.setCookie(TESLA_OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: oauthCookieSameSite,
      path: '/',
      maxAge: 10 * 60,
    })
    reply.setCookie(TESLA_OAUTH_RETURN_COOKIE, returnTo, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: oauthCookieSameSite,
      path: '/',
      maxAge: 10 * 60,
    })

    const scopes = [
      'openid',
      'email',
      'offline_access',
      'vehicle_device_data',
      'vehicle_cmds',
    ].join(' ')

    const authorizeUrl = new URL('https://auth.tesla.com/oauth2/v3/authorize')
    authorizeUrl.searchParams.set('client_id', env.TESLA_CLIENT_ID)
    authorizeUrl.searchParams.set('redirect_uri', env.TESLA_REDIRECT_URI)
    authorizeUrl.searchParams.set('response_type', 'code')
    authorizeUrl.searchParams.set('scope', scopes)
    authorizeUrl.searchParams.set('state', state)

    return reply.redirect(authorizeUrl.toString())
  })

  app.get('/tesla/callback', { schema: { tags: ['auth'] } }, async (req, reply) => {
    app.log.info({ path: '/api/auth/tesla/callback' }, 'Tesla OAuth callback requested')

    const query = req.query as { code?: string; state?: string; error?: string; error_description?: string }
    const returnTo = req.cookies[TESLA_OAUTH_RETURN_COOKIE] ?? '/settings'

    const cleanupCookies = () => {
      reply.clearCookie(TESLA_OAUTH_STATE_COOKIE, { path: '/' })
      reply.clearCookie(TESLA_OAUTH_RETURN_COOKIE, { path: '/' })
    }

    if (query.error) {
      cleanupCookies()
      const reason = encodeURIComponent(query.error_description || query.error)
      return reply.redirect(`${returnTo}?tesla_oauth=error&reason=${reason}`)
    }

    if (!query.code || !query.state) {
      cleanupCookies()
      return reply.redirect(`${returnTo}?tesla_oauth=error&reason=missing_code_or_state`)
    }

    const expectedState = req.cookies[TESLA_OAUTH_STATE_COOKIE]
    const stateIsValid = Boolean(expectedState && expectedState === query.state)
    if (!stateIsValid) {
      if (!env.AUTH_DISABLED) {
        cleanupCookies()
        return reply.redirect(`${returnTo}?tesla_oauth=error&reason=invalid_state`)
      }
      app.log.warn({
        expectedStatePresent: Boolean(expectedState),
      }, 'Tesla OAuth state validation bypassed in AUTH_DISABLED mode')
    }

    try {
      const requestedRegion = env.TESLA_REGION as TeslaRegion
      const body = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: env.TESLA_CLIENT_ID,
        client_secret: env.TESLA_CLIENT_SECRET,
        code: query.code,
        audience: audienceForRegion(requestedRegion),
        redirect_uri: env.TESLA_REDIRECT_URI,
      })

      const tokenRes = await fetch(TESLA_FLEET_AUTH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
        signal: AbortSignal.timeout(20_000),
      })

      if (!tokenRes.ok) {
        const details = await tokenRes.text().catch(() => '')
        throw new AppError(
          'TESLA_TOKEN_EXCHANGE_FAILED',
          `Tesla token exchange failed (${tokenRes.status})${details ? `: ${details.slice(0, 220)}` : ''}`,
          502,
        )
      }

      const tokenJson = (await tokenRes.json()) as TeslaOAuthTokenResponse
      if (!tokenJson.access_token) {
        throw new AppError('TESLA_TOKEN_EXCHANGE_FAILED', 'Tesla token exchange returned no access_token', 502)
      }

      const region = inferRegionFromToken(tokenJson.access_token)
      await bootstrapTeslaInventory(app.prisma, {
        token: tokenJson.access_token,
        region,
        refreshToken: tokenJson.refresh_token,
        tokenExpiry: tokenJson.expires_in ? new Date(Date.now() + tokenJson.expires_in * 1000) : undefined,
      })

      app.log.info({ region }, 'Tesla OAuth callback completed successfully')

      cleanupCookies()
      return reply.redirect(`${returnTo}?tesla_oauth=success`)
    } catch (error) {
      app.log.error({ err: error }, 'Tesla OAuth callback failed')
      cleanupCookies()
      const reason = encodeURIComponent(error instanceof Error ? error.message : 'oauth_callback_failed')
      return reply.redirect(`${returnTo}?tesla_oauth=error&reason=${reason}`)
    }
  })

  // ── Setup check ─────────────────────────────────────────────
  app.get('/setup', { schema: { tags: ['auth'] } }, async () => {
    // If AUTH_DISABLED, setup is never required
    if (env.AUTH_DISABLED) {
      return ok({ setupRequired: false })
    }
    const required = await service.isSetupRequired()
    return ok({ setupRequired: required })
  })

  // ── Register (first user only) ───────────────────────────────
  app.post('/register', { schema: { tags: ['auth'] } }, async (req, reply) => {
    if (env.AUTH_DISABLED) {
      return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Auth disabled' } })
    }
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
    // If AUTH_DISABLED, accept any login and return a system user session
    if (env.AUTH_DISABLED) {
      const fakeToken = 'SYSTEM_AUTH_DISABLED'
      reply.setCookie(COOKIE_NAME, fakeToken, {
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        path: '/',
      })
      return ok({
        token: fakeToken,
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
        user: { id: 'system', email: 'system@disabled', name: 'System', role: 'ADMIN' },
      })
    }

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
  app.get('/session', { schema: { tags: ['auth'] } }, async (req) => {
    // If AUTH_DISABLED, always return a system session
    if (env.AUTH_DISABLED) {
      return ok({
        user: {
          id: 'system',
          email: 'system@disabled',
          name: 'System',
          role: 'ADMIN',
        },
      })
    }

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
    if (!env.AUTH_DISABLED) {
      const token = req.cookies[COOKIE_NAME]
      if (token) await service.logout(token)
    }
    reply.clearCookie(COOKIE_NAME)
    return ok({ loggedOut: true })
  })
}

// ── Shared auth guard (used in other route files) ────────────────
export async function requireAuth(req: FastifyRequest): Promise<string> {
  // If AUTH_DISABLED, any request is authorized
  if (env.AUTH_DISABLED) {
    return 'SYSTEM_AUTH_DISABLED'
  }

  const cookie = req.cookies['voltcraft_session']
  if (!cookie) throw new UnauthorizedError()
  return cookie
}
