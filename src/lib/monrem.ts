import 'server-only'
import { createHash, timingSafeEqual } from 'node:crypto'

// Monrem (monrem.ge) card payments through the hosted checkout (HPP).
// Terminal credentials (Merchant Portal → Terminals → Credentials) get a
// long-lived Bearer token; the terminal's API password signs callbacks:
//   integrity_hash = sha256(order_id + status + amount + currency + api_password)
// Amounts are integer minor units (cents).

const API = () => (process.env.MONREM_API_URL || 'https://sandbox.monrem.ge/api').replace(/\/$/, '')
const env = () => ({
  clientId: process.env.MONREM_CLIENT_ID || '',
  clientSecret: process.env.MONREM_CLIENT_SECRET || '',
  username: process.env.MONREM_USERNAME || '',
  password: process.env.MONREM_PASSWORD || '',
  apiPassword: process.env.MONREM_API_PASSWORD || '',
})

export const monremEnabled = () => Object.values(env()).every(Boolean)
// Prices are set in USD; GEL is charged at the day's rate when the terminal takes lari.
export const monremCurrency = () => ((process.env.MONREM_CURRENCY || 'USD').toUpperCase() === 'GEL' ? 'GEL' : 'USD')

export type MonremTx = {
  order_id: string
  transaction_id?: string | null
  amount: number
  currency: string
  status: string
  status_code?: number | string | null
  status_description?: string | null
  hash?: string | null
  integrity_hash?: string | null
  hpp_url?: string | null
}

export class MonremError extends Error {}

let token: { value: string; until: number } | null = null

async function accessToken(fresh = false) {
  if (!fresh && token && token.until > Date.now()) return token.value
  const e = env()
  const res = await fetch(`${API()}/oauth/token`, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({ grant_type: 'password', client_id: Number(e.clientId) || e.clientId, client_secret: e.clientSecret, username: e.username, password: e.password }),
    signal: AbortSignal.timeout(20_000),
  })
  const data = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; message?: string }
  if (!res.ok || !data.access_token) throw new MonremError(`Monrem sign-in failed (${res.status})${data.message ? `: ${data.message}` : ''}`)
  // Tokens live about a year; renew a day early.
  token = { value: data.access_token, until: Date.now() + Math.max(60, (data.expires_in ?? 3600) - 86_400) * 1000 }
  return token.value
}

async function call<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${API()}${path}`, {
      method: init.method ?? 'GET',
      headers: { accept: 'application/json', 'content-type': 'application/json', authorization: `Bearer ${await accessToken(attempt > 0)}` },
      ...(init.body ? { body: JSON.stringify(init.body) } : {}),
      signal: AbortSignal.timeout(30_000),
    })
    // An expired or revoked token: sign in again once.
    if (res.status === 401 && attempt === 0) continue
    const data = (await res.json().catch(() => ({}))) as T & { message?: string; errors?: Record<string, string[]> }
    if (!res.ok) {
      const first = data.errors ? Object.values(data.errors).flat()[0] : undefined
      throw new MonremError(`Monrem: ${first ?? data.message ?? `error ${res.status}`}`)
    }
    return data
  }
}

export type CheckoutInput = {
  orderId: string
  amount: number
  currency: string
  description: string
  ip: string
  refererUrl: string
  returnUrl: string
  callbackUrl: string
  customer: { firstName: string; lastName: string; email: string; country?: string | null }
}

// A hosted checkout: the customer is sent to hpp_url to pay.
export async function hppCheckout(i: CheckoutInput) {
  const tx = await call<MonremTx>('/v2/hpp/checkout', {
    method: 'POST',
    body: {
      order_id: i.orderId,
      amount: i.amount,
      currency: i.currency,
      description: i.description.slice(0, 120),
      ip_address: i.ip,
      referer_url: i.refererUrl,
      return_url: i.returnUrl,
      callback_url: i.callbackUrl,
      customer_first_name: i.customer.firstName,
      customer_last_name: i.customer.lastName,
      customer_email: i.customer.email,
      billing_first_name: i.customer.firstName,
      billing_last_name: i.customer.lastName,
      ...(i.customer.country ? { billing_country: i.customer.country } : {}),
    },
  })
  if (!tx.hpp_url) throw new MonremError('Monrem did not return a checkout link')
  return tx as MonremTx & { hpp_url: string }
}

export const txStatus = (orderId: string) => call<MonremTx>(`/status?order_id=${encodeURIComponent(orderId)}`)

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')

// A callback is ours only if its integrity hash matches.
export function validCallback(tx: Partial<MonremTx>) {
  if (!tx.order_id || !tx.status || tx.amount === undefined || !tx.currency || typeof tx.integrity_hash !== 'string') return false
  const want = Buffer.from(sha256(`${tx.order_id}${String(tx.status).toUpperCase()}${tx.amount}${tx.currency}${env().apiPassword}`))
  const got = Buffer.from(tx.integrity_hash.toLowerCase())
  return want.length === got.length && timingSafeEqual(want, got)
}
