import { FastifyInstance } from 'fastify'
import { randomBytes } from 'crypto'
import { z } from 'zod'

export const setupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  teslaClientId: z.string().optional(),
  teslaClientSecret: z.string().optional(),
  teslaRedirectUri: z.string().url().optional(),
  teslaRegion: z.enum(['US', 'EU', 'CN']).optional(),
  mqttEnabled: z.boolean().optional(),
})

export type SetupPayload = z.infer<typeof setupSchema>

export class AuthSetupService {
  static generateSecret(length: number = 32): string {
    return randomBytes(length).toString('hex')
  }

  static async isSetupRequired(app: FastifyInstance): Promise<boolean> {
    const userCount = await app.prisma.user.count()
    return userCount === 0
  }

  static async performSetup(app: FastifyInstance, payload: SetupPayload): Promise<void> {
    // 1. Vérifier que c'est le premier lancement
    const userCount = await app.prisma.user.count()
    if (userCount > 0) {
      throw new Error('Setup already completed')
    }

    // 2. Créer l'utilisateur admin
    const { user: authService } = await app.register(async (fastify) => {
      const { AuthService } = await import('./auth.service.js')
      return { user: AuthService }
    })

    // (import will happen via direct require in route, bypassing circular dependency)
    // For now, we'll handle this in the route directly

    // 3. Enregistrer la config Tesla (optionnel)
    if (payload.teslaClientId && payload.teslaClientSecret) {
      await app.prisma.userSettings.create({
        data: {
          userId: '', // Will be set after user creation
          distanceUnit: 'km',
          temperatureUnit: 'celsius',
          pricePerKwh: 0.15,
          ecoModeEnabled: true,
          mqttEnabled: payload.mqttEnabled ?? false,
        },
      })
    }
  }
}
