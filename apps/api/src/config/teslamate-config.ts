import { access, readFile, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import path from 'node:path'
import { appConfigPath, env } from './env.js'

const ENV_KEYS = {
  dbName: 'TESLAMATE_DB_NAME',
  dbUser: 'TESLAMATE_DB_USER',
  dbPassword: 'TESLAMATE_DB_PASSWORD',
  encryptionKey: 'TESLAMATE_ENCRYPTION_KEY',
  grafanaUser: 'TESLAMATE_GRAFANA_USER',
  grafanaPassword: 'TESLAMATE_GRAFANA_PASSWORD',
  port: 'TESLAMATE_PORT',
  grafanaPort: 'TESLAMATE_GRAFANA_PORT',
  backendOnly: 'TESLAMATE_BACKEND_ONLY',
} as const

async function canRead(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.R_OK)
    return true
  } catch {
    return false
  }
}

async function resolveEnvFilePath(): Promise<string> {
  const configured = appConfigPath
  const candidates = [
    configured,
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '../.env'),
    path.resolve(process.cwd(), '../../.env'),
  ]

  for (const candidate of candidates) {
    if (await canRead(candidate)) return candidate
  }

  return candidates[0]
}

function upsertEnvLine(content: string, key: string, value: string): string {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(`^${escapedKey}=.*$`, 'm')
  const line = `${key}=${value}`

  if (regex.test(content)) {
    return content.replace(regex, line)
  }

  if (!content.trim()) return `${line}\n`
  return `${content.trimEnd()}\n${line}\n`
}

export async function persistTeslamateConfig(input: {
  dbName?: string
  dbUser?: string
  dbPassword?: string
  encryptionKey?: string
  grafanaUser?: string
  grafanaPassword?: string
  port?: number
  grafanaPort?: number
  backendOnly?: boolean
}): Promise<{ envPath: string; persistedToFile: boolean }> {
  const nextValues: Record<string, string> = {
    [ENV_KEYS.dbName]: (input.dbName ?? env.TESLAMATE_DB_NAME).trim(),
    [ENV_KEYS.dbUser]: (input.dbUser ?? env.TESLAMATE_DB_USER).trim(),
    [ENV_KEYS.dbPassword]: (input.dbPassword ?? env.TESLAMATE_DB_PASSWORD).trim(),
    [ENV_KEYS.encryptionKey]: (input.encryptionKey ?? env.TESLAMATE_ENCRYPTION_KEY).trim(),
    [ENV_KEYS.grafanaUser]: (input.grafanaUser ?? env.TESLAMATE_GRAFANA_USER).trim(),
    [ENV_KEYS.grafanaPassword]: (input.grafanaPassword ?? env.TESLAMATE_GRAFANA_PASSWORD).trim(),
    [ENV_KEYS.port]: String(input.port ?? env.TESLAMATE_PORT),
    [ENV_KEYS.grafanaPort]: String(input.grafanaPort ?? env.TESLAMATE_GRAFANA_PORT),
    [ENV_KEYS.backendOnly]: String(input.backendOnly ?? env.TESLAMATE_BACKEND_ONLY),
  }

  process.env[ENV_KEYS.dbName] = nextValues[ENV_KEYS.dbName]
  process.env[ENV_KEYS.dbUser] = nextValues[ENV_KEYS.dbUser]
  process.env[ENV_KEYS.dbPassword] = nextValues[ENV_KEYS.dbPassword]
  process.env[ENV_KEYS.encryptionKey] = nextValues[ENV_KEYS.encryptionKey]
  process.env[ENV_KEYS.grafanaUser] = nextValues[ENV_KEYS.grafanaUser]
  process.env[ENV_KEYS.grafanaPassword] = nextValues[ENV_KEYS.grafanaPassword]
  process.env[ENV_KEYS.port] = nextValues[ENV_KEYS.port]
  process.env[ENV_KEYS.grafanaPort] = nextValues[ENV_KEYS.grafanaPort]
  process.env[ENV_KEYS.backendOnly] = nextValues[ENV_KEYS.backendOnly]

  env.TESLAMATE_DB_NAME = nextValues[ENV_KEYS.dbName]
  env.TESLAMATE_DB_USER = nextValues[ENV_KEYS.dbUser]
  env.TESLAMATE_DB_PASSWORD = nextValues[ENV_KEYS.dbPassword]
  env.TESLAMATE_ENCRYPTION_KEY = nextValues[ENV_KEYS.encryptionKey]
  env.TESLAMATE_GRAFANA_USER = nextValues[ENV_KEYS.grafanaUser]
  env.TESLAMATE_GRAFANA_PASSWORD = nextValues[ENV_KEYS.grafanaPassword]
  env.TESLAMATE_PORT = Number(nextValues[ENV_KEYS.port])
  env.TESLAMATE_GRAFANA_PORT = Number(nextValues[ENV_KEYS.grafanaPort])
  env.TESLAMATE_BACKEND_ONLY = nextValues[ENV_KEYS.backendOnly] !== 'false'

  const envPath = await resolveEnvFilePath()
  try {
    const current = (await canRead(envPath)) ? await readFile(envPath, 'utf8') : ''
    let next = current
    for (const [key, value] of Object.entries(nextValues)) {
      next = upsertEnvLine(next, key, value)
    }
    await writeFile(envPath, next, 'utf8')
    return { envPath, persistedToFile: true }
  } catch {
    return { envPath, persistedToFile: false }
  }
}
