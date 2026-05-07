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
}
