import { generateKeyPairSync } from 'node:crypto'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import path from 'node:path'
import selfsigned from 'selfsigned'
import { appConfigPath, env } from './env.js'

export type TeslaRegion = 'na' | 'eu' | 'cn'

const ENV_KEYS = {
  token: 'TESLA_TOKEN',
  region: 'TESLA_REGION',
  clientId: 'TESLA_CLIENT_ID',
  clientSecret: 'TESLA_CLIENT_SECRET',
  redirectUri: 'TESLA_REDIRECT_URI',
} as const

export const TESLA_PARTNER_PUBLIC_KEY_ROUTE = '/.well-known/appspecific/com.tesla.3p.public-key.pem'

export function getTeslaCommandProxyTlsPaths() {
  const baseDir = path.resolve(path.dirname(appConfigPath), 'tesla')
  return {
    baseDir,
    publicKeyPath: path.join(baseDir, 'partner-public-key.pem'),
    privateKeyPath: path.join(baseDir, 'partner-private-key.pem'),
    proxyTlsCertPath: path.join(baseDir, 'proxy-tls-cert.pem'),
    proxyTlsKeyPath: path.join(baseDir, 'proxy-tls-key.pem'),
  }
}

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

  await ensureTeslaCommandProxyAssets().catch(() => {
    // Best effort: OAuth config should still be saved even if key generation fails.
  })

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

export async function ensureTeslaPartnerKeyPair(): Promise<{ publicKeyPath: string; privateKeyPath: string }> {
  const { baseDir, publicKeyPath, privateKeyPath } = getTeslaCommandProxyTlsPaths()
  const hasPublic = await canRead(publicKeyPath)
  const hasPrivate = await canRead(privateKeyPath)

  if (hasPublic && hasPrivate) {
    return { publicKeyPath, privateKeyPath }
  }

  await mkdir(baseDir, { recursive: true })

  const { publicKey, privateKey } = generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  })

  await writeFile(publicKeyPath, publicKey, 'utf8')
  await writeFile(privateKeyPath, privateKey, 'utf8')

  return { publicKeyPath, privateKeyPath }
}

export async function ensureTeslaCommandProxyTlsCert(): Promise<{ certPath: string; keyPath: string }> {
  const { baseDir, proxyTlsCertPath, proxyTlsKeyPath } = getTeslaCommandProxyTlsPaths()
  const hasCert = await canRead(proxyTlsCertPath)
  const hasKey = await canRead(proxyTlsKeyPath)

  if (hasCert && hasKey) {
    return { certPath: proxyTlsCertPath, keyPath: proxyTlsKeyPath }
  }

  await mkdir(baseDir, { recursive: true })

  const attrs = [{ name: 'commonName', value: 'vehicle-command' }]
  const generated = await selfsigned.generate(attrs, {
    algorithm: 'sha256',
    keySize: 2048,
    notAfterDate: new Date(Date.now() + 3650 * 24 * 60 * 60 * 1000),
    extensions: [
      { name: 'basicConstraints', cA: true },
      { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
      { name: 'extKeyUsage', serverAuth: true },
      {
        name: 'subjectAltName',
        altNames: [
          { type: 2, value: 'vehicle-command' },
          { type: 2, value: 'localhost' },
        ],
      },
    ],
  })

  await writeFile(proxyTlsCertPath, generated.cert, 'utf8')
  await writeFile(proxyTlsKeyPath, generated.private, 'utf8')

  return { certPath: proxyTlsCertPath, keyPath: proxyTlsKeyPath }
}

export async function ensureTeslaCommandProxyAssets(): Promise<void> {
  await ensureTeslaPartnerKeyPair()
  await ensureTeslaCommandProxyTlsCert()
}

export async function readTeslaPartnerPublicKey(): Promise<string | null> {
  const { publicKeyPath } = getTeslaCommandProxyTlsPaths()
  if (!(await canRead(publicKeyPath))) {
    return null
  }
  return readFile(publicKeyPath, 'utf8')
}

export function getTeslaPartnerPublicKeyUrl(): string | null {
  try {
    const redirectUrl = new URL(env.TESLA_REDIRECT_URI)
    return new URL(TESLA_PARTNER_PUBLIC_KEY_ROUTE, redirectUrl.origin).toString()
  } catch {
    return null
  }
}
