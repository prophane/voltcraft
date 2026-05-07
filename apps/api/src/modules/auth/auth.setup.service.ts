import { randomBytes } from 'crypto'
import { z } from 'zod'

export const setupSchema = z.object({
  email: z.string().email().optional(),
  password: z.string().min(8).optional(),
  teslaToken: z.string().optional(),
  teslaRegion: z.enum(['na', 'eu', 'cn']).optional(),
  mqttEnabled: z.boolean().optional(),
})

export type SetupPayload = z.infer<typeof setupSchema>

export class AuthSetupService {
  static generateSecret(length: number = 32): string {
    return randomBytes(length).toString('hex')
  }
}
