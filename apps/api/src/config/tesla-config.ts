import { access, readFile, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import path from 'node:path'
import { env } from './env.js'

export type TeslaRegion = 'na' | 'eu' | 'cn'

const ENV_KEYS = {
  token: 'TESLA_TOKEN',
  region: 'TESLA_REGION',
  clientId: 'TESLA_CLIENT_ID',
  clientSecret: 'TESLA_CLIENT_SECRET',
  redirectUri: 'TESLA_REDIRECT_URI',
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
  const candidates = [
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

export async function persistTeslaConfig(input: {
  token: string
  region: TeslaRegion
}): Promise<{ envPath: string; persistedToFile: boolean }> {
  const token = input.token.replace(/\s+/g, '').trim()
  const region = input.region

  process.env[ENV_KEYS.token] = token
  process.env[ENV_KEYS.region] = region
  env.TESLA_TOKEN = token
  env.TESLA_REGION = region

  const envPath = await resolveEnvFilePath()

  try {
    const current = (await canRead(envPath)) ? await readFile(envPath, 'utf8') : ''
    let next = upsertEnvLine(current, ENV_KEYS.token, token)
    next = upsertEnvLine(next, ENV_KEYS.region, region)
    await writeFile(envPath, next, 'utf8')
    return { envPath, persistedToFile: true }
  } catch {
    return { envPath, persistedToFile: false }
  }
}

export async function persistTeslaOAuthConfig(input: {
  clientId: string
  clientSecret: string
  redirectUri: string
}): Promise<{ envPath: string; persistedToFile: boolean }> {
  const clientId = input.clientId.trim()
  const clientSecret = input.clientSecret.trim()
  const redirectUri = input.redirectUri.trim()

  process.env[ENV_KEYS.clientId] = clientId
  process.env[ENV_KEYS.clientSecret] = clientSecret
  process.env[ENV_KEYS.redirectUri] = redirectUri
  env.TESLA_CLIENT_ID = clientId
  env.TESLA_CLIENT_SECRET = clientSecret
  env.TESLA_REDIRECT_URI = redirectUri

  const envPath = await resolveEnvFilePath()

  try {
    const current = (await canRead(envPath)) ? await readFile(envPath, 'utf8') : ''
    let next = upsertEnvLine(current, ENV_KEYS.clientId, clientId)
    next = upsertEnvLine(next, ENV_KEYS.clientSecret, clientSecret)
    next = upsertEnvLine(next, ENV_KEYS.redirectUri, redirectUri)
    await writeFile(envPath, next, 'utf8')
    return { envPath, persistedToFile: true }
  } catch {
    return { envPath, persistedToFile: false }
  }
}
