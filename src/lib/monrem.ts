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
  // Set on charges of a recurring billing subscription.
  subscription?: { id: string | number; status?: string | null } | null
}

// A recurring billing plan, made in the Merchant Portal (amount in major units).
export type MonremPlan = { id: number; name: string | null; ref_id: string | null; amount: string; currency?: { code: string } | null; billing_frequency: number | null; is_active: boolean }
export type MonremSubscription = { id: string | number; status: string; ref_id?: string; transaction?: MonremTx | null; transactions?: MonremTx[] | null }

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
  // Monrem says why under "messages" (e.g. "Client authentication failed": wrong keys, or live keys on the sandbox).
  const data = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; message?: string; messages?: string }
  const why = data.message ?? data.messages
  if (!res.ok || !data.access_token) throw new MonremError(`Monrem sign-in failed (${res.status})${why ? `: ${why}` : ''}`)
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
      // Every validation error at once, so one failed checkout shows all that is missing.
      const all = data.errors ? Object.values(data.errors).flat().join(' ') : ''
      throw new MonremError(`Monrem: ${all || data.message || `error ${res.status}`}`)
    }
    return data
  }
}

export type CheckoutInput = {
  orderId: string
  amount: number
  // A recurring billing plan's ref_id: the payment starts a subscription.
  recurringRef?: string
  currency: string
  description: string
  ip: string
  refererUrl: string
  returnUrl: string
  callbackUrl: string
  customer: { firstName: string; lastName: string; email: string; phone: string; phoneCode: string }
  billing: { street: string; city: string; postCode: string; state: string; country: string }
}

// A hosted checkout: the customer is sent to hpp_url to pay.
export async function hppCheckout(i: CheckoutInput) {
  const tx = await call<MonremTx>('/v2/hpp/checkout', {
    method: 'POST',
    body: {
      order_id: i.orderId,
      ...(i.recurringRef ? { recurring_billing_reference: i.recurringRef } : { amount: i.amount }),
      currency: i.currency,
      description: i.description.slice(0, 120),
      ip_address: i.ip,
      referer_url: i.refererUrl,
      return_url: i.returnUrl,
      callback_url: i.callbackUrl,
      customer_first_name: i.customer.firstName,
      customer_last_name: i.customer.lastName,
      customer_email: i.customer.email,
      customer_phone: i.customer.phone,
      ...(i.customer.phoneCode ? { customer_phone_code: i.customer.phoneCode } : {}),
      billing_first_name: i.customer.firstName,
      billing_last_name: i.customer.lastName,
      billing_street: i.billing.street,
      billing_city: i.billing.city,
      billing_post_code: i.billing.postCode,
      billing_country: i.billing.country,
      billing_state: i.billing.state,
    },
  })
  if (!tx.hpp_url) throw new MonremError('Monrem did not return a checkout link')
  return tx as MonremTx & { hpp_url: string }
}

// Whether Monrem's payment page may be shown in a frame on our page: its
// X-Frame-Options / frame-ancestors decide (checked once an hour per host).
// MONREM_EMBED=0 always sends the customer to Monrem instead.
const framing = new Map<string, { ok: boolean; until: number }>()
export async function canEmbed(url: string) {
  if (process.env.MONREM_EMBED === '0') return false
  const host = new URL(url).host
  const known = framing.get(host)
  if (known && known.until > Date.now()) return known.ok
  let ok = false
  try {
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(5000) })
    const xfo = (res.headers.get('x-frame-options') ?? '').toLowerCase()
    const ancestors = /frame-ancestors([^;]*)/i.exec(res.headers.get('content-security-policy') ?? '')?.[1].trim().toLowerCase()
    ok = res.ok && !xfo && (ancestors === undefined || ancestors.split(/\s+/).some((s) => s === '*' || s === 'https:' || s.endsWith('loudpilot.app')))
  } catch {
    ok = false
  }
  framing.set(host, { ok, until: Date.now() + 3600_000 })
  return ok
}

// The terminal's recurring billing plans (a few pages at most).
export async function listPlans() {
  const out: MonremPlan[] = []
  for (let page = 1; page <= 5; page++) {
    const r = await call<{ data: MonremPlan[]; meta?: { last_page?: number } }>(`/recurring-billing-plan?page=${page}`)
    out.push(...(r.data ?? []))
    if (!r.meta?.last_page || page >= r.meta.last_page) break
  }
  return out
}

export const getSubscription = (id: string) => call<{ data: MonremSubscription }>(`/recurring-billing-subscription/${encodeURIComponent(id)}`).then((r) => r.data)
export const cancelSubscription = (id: string) => call<{ data: MonremSubscription }>(`/recurring-billing-subscription/${encodeURIComponent(id)}/cancel`, { method: 'POST' }).then((r) => r.data)

// The subscription a first payment started, when its callback didn't say.
export async function findSubscription(orderId: string) {
  for (let page = 1; page <= 3; page++) {
    const r = await call<{ data: MonremSubscription[]; meta?: { last_page?: number } }>(`/recurring-billing-subscription?page=${page}`)
    const hit = (r.data ?? []).find((x) => x.transaction?.order_id === orderId || x.transactions?.some((t) => t.order_id === orderId))
    if (hit) return hit
    if (!r.meta?.last_page || page >= r.meta.last_page) break
  }
  return null
}

export const subscriptionActive = (status: string | null | undefined) => /^active$/i.test(String(status ?? '').trim())

export const txStatus = (orderId: string) => call<MonremTx>(`/status?order_id=${encodeURIComponent(orderId)}`)

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')

// A callback is ours only if its integrity hash matches.
export function validCallback(tx: Partial<MonremTx>) {
  if (!tx.order_id || !tx.status || tx.amount === undefined || !tx.currency || typeof tx.integrity_hash !== 'string') return false
  const want = Buffer.from(sha256(`${tx.order_id}${String(tx.status).toUpperCase()}${tx.amount}${tx.currency}${env().apiPassword}`))
  const got = Buffer.from(tx.integrity_hash.toLowerCase())
  return want.length === got.length && timingSafeEqual(want, got)
}
