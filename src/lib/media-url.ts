import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { appUrl } from './mail'

// Short-lived public links to private media, for networks that fetch the
// image themselves (Facebook, Instagram). The signature covers id + expiry.

const sign = (id: string, exp: number) =>
  createHmac('sha256', `media:${process.env.KHMA_ENCRYPTION_KEY}`).update(`${id}.${exp}`).digest('base64url')

export function signedMediaUrl(id: string, ttlSeconds = 3600) {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds
  return `${appUrl()}/media/${id}?exp=${exp}&sig=${sign(id, exp)}`
}

export function validMediaSignature(id: string, exp: string | null, sig: string | null) {
  if (!exp || !sig || !/^\d+$/.test(exp)) return false
  const e = Number(exp)
  if (e < Date.now() / 1000) return false
  const expected = Buffer.from(sign(id, e))
  const given = Buffer.from(sig)
  return given.length === expected.length && timingSafeEqual(given, expected)
}
