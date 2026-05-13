import dotenv from 'dotenv'
import { z } from 'zod'

const runtimeConfigPath = process.env['APP_CONFIG_PATH'] || '/app/data/runtime.env'

// Load the repository .env first, then overlay persisted runtime config if present.
dotenv.config()
dotenv.config({ path: runtimeConfigPath, override: true })

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  API_PORT: z.coerce.number().default(3001),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  SESSION_SECRET: z.string().min(16),
  ENCRYPTION_KEY: z.string().min(16),

  // Authentication mode — default disabled (handled by reverse proxy)
  AUTH_DISABLED: z
    .string()
    .transform((v) => v !== 'false')
    .default('true'),

  // Tesla credentials — optional at startup, configured via setup wizard
  TESLA_TOKEN: z.string().default(''),
  TESLA_REGION: z.enum(['na', 'eu', 'cn']).default('na'),
  TESLA_CLIENT_ID: z.string().default(''),
  TESLA_CLIENT_SECRET: z.string().default(''),
  TESLA_REDIRECT_URI: z.string().url().default('http://localhost:3001/api/auth/tesla/callback'),
  TESLA_COMMAND_PROXY_URL: z.string().url().default('https://vehicle-command:4443'),

  TESLAMATE_DB_NAME: z.string().default('teslamate'),
  TESLAMATE_DB_HOST: z.string().default('teslamate-db'),
  TESLAMATE_DB_PORT: z.coerce.number().default(5432),
  TESLAMATE_DB_USER: z.string().default('teslamate'),
  TESLAMATE_DB_PASSWORD: z.string().default(''),
  TESLAMATE_ENCRYPTION_KEY: z.string().default(''),
  TESLAMATE_GRAFANA_USER: z.string().default('admin'),
  TESLAMATE_GRAFANA_PASSWORD: z.string().default(''),
  TESLAMATE_PORT: z.coerce.number().default(4000),
  TESLAMATE_GRAFANA_PORT: z.coerce.number().default(3002),
  TESLAMATE_BACKEND_ONLY: z
    .string()
    .transform((v) => v !== 'false')
    .default('true'),
  TESLAMATE_FORCE_MILES_TO_KM: z
    .string()
    .transform((v) => v !== 'false')
    .default('false'),

  MQTT_ENABLED: z
    .string()
    .transform((v) => v !== 'false')
    .default('true'),
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
export const appConfigPath = runtimeConfigPath
