import type { FastifyInstance } from 'fastify'
import { setupSchema } from './auth.setup.service.js'
import { AuthService } from './auth.service.js'
import { AuthRepository } from './auth.repository.js'
import { persistTeslaConfig, persistTeslaOAuthConfig } from '../../config/tesla-config.js'
import { bootstrapTeslaInventory } from '../../providers/tesla/tesla-bootstrap.service.js'

const COOKIE_NAME = 'voltcraft_session'

export async function registerSetupRoutes(app: FastifyInstance) {
  // POST /setup - Effectuer le setup initial (premier lancement)
  app.post('/setup', async (request, reply) => {
    const repo = new AuthRepository(app.prisma)
    const service = new AuthService(repo)

    // Vérifier que c'est le premier lancement
    const required = await service.isSetupRequired()
    if (!required) {
      return reply.status(409).send({
        success: false,
        error: { code: 'CONFLICT', message: 'Setup already completed' },
      })
    }

    // Valider le payload
    const payload = setupSchema.parse(request.body)

    let bootstrapResult: { vehiclesCount: number } | null = null

    if (payload.teslaClientId && payload.teslaClientSecret && payload.teslaRedirectUri) {
      await persistTeslaOAuthConfig({
        clientId: payload.teslaClientId,
        clientSecret: payload.teslaClientSecret,
        redirectUri: payload.teslaRedirectUri,
      })
    }

    if (payload.teslaToken) {
      await persistTeslaConfig({
        token: payload.teslaToken,
        region: payload.teslaRegion ?? 'na',
      })

      bootstrapResult = await bootstrapTeslaInventory(app.prisma, {
        token: payload.teslaToken,
        region: payload.teslaRegion ?? 'na',
      })
    }

    // If AUTH_DISABLED, just save Tesla token and return success
    if (process.env.AUTH_DISABLED === 'true') {
      app.log.info('Setup in AUTH_DISABLED mode: Tesla token configured')
      return reply.status(201).send({
        success: true,
        message: 'Setup completed',
        vehiclesDetected: bootstrapResult?.vehiclesCount ?? 0,
      })
    }

    // 1. Créer l'utilisateur admin (normal auth mode)
    if (!payload.email || !payload.password) {
      return reply.status(400).send({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'Email and password required in auth mode' },
      })
    }

    const user = await service.register({
      email: payload.email,
      password: payload.password,
      name: 'Admin',
    })

    // 2. Créer les paramètres utilisateur initiaux
    await app.prisma.userSettings.create({
      data: {
        userId: user.id,
        distanceUnit: 'km',
        temperatureUnit: 'celsius',
        pricePerKwh: 0.15,
        ecoModeEnabled: true,
        mqttEnabled: payload.mqttEnabled ?? false,
      },
    })

    // 3. Ouvrir la session
    const session = await service.login(
      { email: payload.email, password: payload.password },
      { ip: request.ip, ua: request.headers['user-agent'] as string | undefined },
    )

    reply.setCookie(COOKIE_NAME, session.token, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
    })

    app.log.info(`Setup completed: admin user ${user.email} created`)

    return reply.status(201).send({
      success: true,
      user: session.user,
      expiresAt: session.expiresAt,
    })
  })
}
