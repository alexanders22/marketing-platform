import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'

// Small tamper-proof tokens (connect links, OAuth state) signed with the
// server key. Not encrypted: never put secrets inside.

const mac = (data: string) => createHmac('sha256', `signed:${process.env.KHMA_ENCRYPTION_KEY}`).update(data).digest('base64url')

export function seal(payload: Record<string, unknown>, ttlSeconds: number) {
  const data = Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds })).toString('base64url')
  return `${data}.${mac(data)}`
}

export function unseal<T extends Record<string, unknown>>(token: string | null | undefined): (T & { exp: number }) | null {
  if (!token) return null
  const [data, sig] = token.split('.')
  if (!data || !sig) return null
  const a = Buffer.from(sig)
  const b = Buffer.from(mac(data))
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const v = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'))
    return typeof v.exp === 'number' && v.exp >= Date.now() / 1000 ? v : null
  } catch {
    return null
  }
}
