import 'dotenv/config'
import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  API_PORT: z.coerce.number().default(3001),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  SESSION_SECRET: z.string().min(16).default('voltcraft_session_secret_change_in_production'),
  ENCRYPTION_KEY: z.string().min(16).default('voltcraft_encryption_key_change_in_production_!!'),

  // Tesla credentials — optional at startup, configured via setup wizard
  TESLA_CLIENT_ID: z.string().default(''),
  TESLA_CLIENT_SECRET: z.string().default(''),
  TESLA_REDIRECT_URI: z.string().default(''),
  TESLA_REGION: z.enum(['na', 'eu', 'cn']).default('na'),

  MQTT_BROKER: z.string().default('localhost'),
  MQTT_PORT: z.coerce.number().default(1883),
  MQTT_USERNAME: z.string().default(''),
  MQTT_PASSWORD: z.string().default(''),
  MQTT_CLIENT_ID: z.string().default('voltcraft'),

  ECO_MODE_ENABLED: z
    .string()
    .transform((v) => v !== 'false')
    .default('true'),
  TIMEZONE: z.string().default('Europe/Paris'),
})

// Validate on startup — crash fast on missing config
const parsed = envSchema.safeParse(process.env)
if (!parsed.success) {
  console.error('❌ Invalid environment configuration:')
  console.error(parsed.error.flatten().fieldErrors)
  process.exit(1)
}

export const env = parsed.data

export type Env = typeof env
