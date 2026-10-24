import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

// AES-256-GCM for third-party tokens at rest (social / ad account OAuth).
// Format: base64(iv[12] | tag[16] | ciphertext).

// The server key, checked: never fall back to signing with "undefined".
function rawKey() {
  const raw = process.env.KHMA_ENCRYPTION_KEY
  if (!raw) throw new Error('KHMA_ENCRYPTION_KEY is not set')
  if (Buffer.from(raw, 'base64').length !== 32) throw new Error('KHMA_ENCRYPTION_KEY must be 32 bytes, base64')
  return raw
}

const key = () => Buffer.from(rawKey(), 'base64')

// HMAC key for one purpose ("signed", "media", "cron"), derived from the
// server key. The string form is what signed links, sealed values and the
// cron secret have always used, so they stay valid.
export const purposeKey = (purpose: string) => `${purpose}:${rawKey()}`

export function encrypt(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString('base64')
}

export function decrypt(payload: string): string {
  const buf = Buffer.from(payload, 'base64')
  if (buf.length < 28) throw new Error('Encrypted value is too short')
  const decipher = createDecipheriv('aes-256-gcm', key(), buf.subarray(0, 12), { authTagLength: 16 })
  decipher.setAuthTag(buf.subarray(12, 28))
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString('utf8')
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

// Partner API key: "lp_live_" + 40 url-safe chars. Only the hash is stored.
export function generateApiKey(): { key: string; prefix: string; keyHash: string } {
  const key = `lp_live_${randomBytes(30).toString('base64url')}`
  return { key, prefix: key.slice(0, 12), keyHash: sha256(key) }
}
