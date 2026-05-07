import { FastifyInstance } from 'fastify'
import { setupSchema, AuthSetupService } from './auth.setup.service.js'
import { AuthService } from './auth.service.js'
import { AuthRepository } from './auth.repository.js'

export async function registerSetupRoutes(app: FastifyInstance) {
  // GET /setup - Vérifier l'état du setup
  app.get('/setup', async (request, reply) => {
    const setupRequired = await AuthSetupService.isSetupRequired(app)
    return reply.send({
      setupRequired,
      teslaDeveloperUrl: 'https://developer.tesla.com/',
    })
  })

  // POST /setup - Effectuer le setup initial
  app.post('/setup', async (request, reply) => {
    try {
      // Vérifier que c'est le premier lancement
      const setupRequired = await AuthSetupService.isSetupRequired(app)
      if (!setupRequired) {
        return reply.status(409).send({
          error: 'Setup already completed',
          message: 'An admin user already exists',
        })
      }

      // Valider le payload
      const payload = setupSchema.parse(request.body)

      // 1. Créer l'utilisateur admin
      const hashedPassword = AuthService.hashPassword(payload.password)
      const user = await AuthRepository.createUser(app.prisma, {
        email: payload.email,
        passwordHash: hashedPassword,
        name: 'Admin',
        role: 'ADMIN',
      })

      // 2. Créer la session
      const sessionToken = AuthService.generateToken()
      const session = await AuthRepository.createSession(app.prisma, {
        userId: user.id,
        token: sessionToken,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      })

      // 3. Enregistrer les paramètres (Tesla, MQTT, etc.)
      if (payload.teslaClientId) {
        // Store encrypted Tesla credentials
        const encryptedSecret = AuthService.encryptToken(payload.teslaClientSecret || '')
        // Will be saved to user settings or env
        app.log.info('Tesla credentials registered (will be used for API calls)')
      }

      // 4. Enregistrer les préférences utilisateur
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

      app.log.info(`Setup completed: user ${user.email} created`)

      return reply.status(201).send({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
        },
        session: {
          token: sessionToken,
          expiresAt: session.expiresAt,
        },
        message: 'Setup completed successfully',
      })
    } catch (error) {
      app.log.error(error)
      if (error instanceof Error && error.message.includes('Unique constraint')) {
        return reply.status(409).send({
          error: 'User already exists',
          message: 'An account with this email already exists',
        })
      }
      return reply.status(400).send({
        error: 'Setup failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  })
}
