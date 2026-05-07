import crypto from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'

/**
 * Encrypt a plain text token for DB storage.
 * Key must be 32 bytes (64-char hex).
 */
export function encryptToken(plaintext: string, keyHex: string): string {
  const key = Buffer.from(keyHex, 'hex')
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  // Format: iv:tag:data (all hex)
  return [iv.toString('hex'), tag.toString('hex'), encrypted.toString('hex')].join(':')
}

export function decryptToken(stored: string, keyHex: string): string {
  const [ivHex, tagHex, dataHex] = stored.split(':')
  if (!ivHex || !tagHex || !dataHex) throw new Error('Invalid token format')
  const key = Buffer.from(keyHex, 'hex')
  const iv = Buffer.from(ivHex, 'hex')
  const tag = Buffer.from(tagHex, 'hex')
  const data = Buffer.from(dataHex, 'hex')
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)
  return decipher.update(data) + decipher.final('utf8')
}
