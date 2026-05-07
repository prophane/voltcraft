import { access, readFile, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import path from 'node:path'
import { env } from './env.js'

export type TeslaRegion = 'na' | 'eu' | 'cn'

const ENV_KEYS = {
  token: 'TESLA_TOKEN',
  region: 'TESLA_REGION',
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
