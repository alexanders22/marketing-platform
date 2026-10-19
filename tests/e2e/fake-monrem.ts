import { createHash } from 'node:crypto'
import { createServer, type Server } from 'node:http'

// A stand-in for Monrem's gateway: token, hosted checkout, status, and a
// payment page that approves or declines and then calls back like Monrem.
// The dev server talks to it when .env has
//   MONREM_API_URL=http://127.0.0.1:18996  MONREM_CLIENT_ID=1  MONREM_CLIENT_SECRET=secret
//   MONREM_USERNAME=terminal  MONREM_PASSWORD=pass  MONREM_API_PASSWORD=fake-api-password

export const FAKE_MONREM_PORT = 18996
const BASE = `http://127.0.0.1:${FAKE_MONREM_PORT}`
export const FAKE_API_PASSWORD = 'fake-api-password'

type Order = { order_id: string; transaction_id: string; amount: number; currency: string; status: string; callback_url: string; return_url: string; body: Record<string, unknown>; subscription?: string }
type Sub = { id: string; ref_id: string; status: string; first: Order; renewals: Order[] }

// Recurring billing plans as made in the Merchant Portal (amount in major units).
export const FAKE_PLANS = [
  { id: 1, name: 'Starter monthly', ref_id: 'ref-starter-m', amount: '29.00', currency: { code: 'USD' }, billing_frequency: 1, is_active: true },
  { id: 2, name: 'Starter yearly (old price)', ref_id: 'ref-starter-y-old', amount: '199.00', currency: { code: 'USD' }, billing_frequency: 12, is_active: true },
]

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')
export const signed = (o: { order_id: string; status: string; amount: number; currency: string }, password = FAKE_API_PASSWORD) => ({
  ...o,
  hash: sha256(o.order_id + password),
  integrity_hash: sha256(`${o.order_id}${o.status}${o.amount}${o.currency}${password}`),
})

export function startFakeMonrem() {
  const orders = new Map<string, Order>()
  const callbacks: { order_id: string; status: string; code: number }[] = []
  const subs = new Map<string, Sub>()
  const cancelled: string[] = []
  let n = 0
  // Monrem's page refuses frames on 127.0.0.1 and allows them on localhost, so
  // a test picks the flow by the host the checkout link uses.
  let framing = false

  const txOf = (o: Order) => ({
    ...signed({ order_id: o.order_id, status: o.status, amount: o.amount, currency: o.currency }),
    transaction_id: o.transaction_id,
    ...(o.subscription ? { subscription: { id: o.subscription, status: subs.get(o.subscription)?.status } } : {}),
  })
  const subJson = (x: Sub) => ({ id: x.id, ref_id: x.ref_id, status: x.status, transaction: txOf(x.first), transactions: [x.first, ...x.renewals].map(txOf) })
  const callback = async (o: Order) => {
    const res = await fetch(o.callback_url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...txOf(o), status_description: o.status === 'APPROVED' ? 'Success' : 'Do not honour' }) })
    callbacks.push({ order_id: o.order_id, status: o.status, code: res.status })
  }

  const server: Server = createServer(async (req, res) => {
    const url = new URL(req.url!, BASE)
    const chunks: Buffer[] = []
    for await (const c of req) chunks.push(c as Buffer)
    const body = chunks.length ? (JSON.parse(Buffer.concat(chunks).toString()) as Record<string, unknown>) : {}
    const json = (code: number, data: unknown) => (res.writeHead(code, { 'content-type': 'application/json' }), res.end(JSON.stringify(data)))
    const authed = req.headers.authorization === 'Bearer fake-monrem-token'

    if (req.method === 'POST' && url.pathname === '/oauth/token') {
      if (body.client_secret !== 'secret' || body.password !== 'pass') return json(401, { message: 'Unauthenticated.' })
      return json(200, { token_type: 'Bearer', expires_in: 31536000, access_token: 'fake-monrem-token', refresh_token: 'r' })
    }
    if (req.method === 'POST' && url.pathname === '/v2/hpp/checkout') {
      if (!authed) return json(401, { message: 'Unauthenticated.' })
      for (const f of ['order_id', 'currency', 'description', 'ip_address', 'referer_url', 'return_url', 'customer_first_name', 'customer_last_name', 'customer_email', 'customer_phone', 'billing_first_name', 'billing_last_name', 'billing_street', 'billing_city', 'billing_post_code', 'billing_state', 'billing_country']) if (!body[f]) return json(422, { message: 'Invalid', errors: { [f]: [`The ${f.replace(/_/g, ' ')} field is required when customer token is not present.`] } })
      for (const f of ['customer_first_name', 'customer_last_name', 'billing_first_name', 'billing_last_name']) if (!/^[A-Za-z ]+$/.test(String(body[f]))) return json(422, { message: 'Invalid', errors: { [f]: ['Must contain only letters and spaces'] } })
      const plan = body.recurring_billing_reference ? FAKE_PLANS.find((x) => x.ref_id === body.recurring_billing_reference) : null
      if (body.recurring_billing_reference && !plan) return json(422, { message: 'Invalid', errors: { recurring_billing_reference: ['Unknown plan'] } })
      const o: Order = {
        order_id: String(body.order_id),
        transaction_id: `GWS${Date.now()}-${++n}`,
        amount: plan ? Math.round(parseFloat(plan.amount) * 100) : Number(body.amount),
        currency: String(body.currency),
        status: 'PENDING',
        callback_url: String(body.callback_url),
        return_url: String(body.return_url),
        body,
      }
      orders.set(o.order_id, o)
      return json(200, { ...txOf(o), hpp_url: `${framing ? `http://localhost:${FAKE_MONREM_PORT}` : BASE}/pay/${o.order_id}` })
    }
    if (req.method === 'GET' && url.pathname === '/status') {
      if (!authed) return json(401, { message: 'Unauthenticated.' })
      const o = orders.get(url.searchParams.get('order_id') ?? '')
      if (!o) return json(422, { message: 'Not found', errors: { order_id: ['Unknown order'] } })
      return json(200, { ...txOf(o), status_description: o.status === 'APPROVED' ? 'Success' : 'Pending', transaction_type: 'purchase' })
    }
    if (req.method === 'GET' && url.pathname === '/recurring-billing-plan') {
      if (!authed) return json(401, { message: 'Unauthenticated.' })
      return json(200, { data: FAKE_PLANS, links: {}, meta: { current_page: 1, last_page: 1 } })
    }
    if (req.method === 'GET' && url.pathname === '/recurring-billing-subscription') {
      if (!authed) return json(401, { message: 'Unauthenticated.' })
      return json(200, { data: [...subs.values()].map(subJson), links: {}, meta: { current_page: 1, last_page: 1 } })
    }
    const sub = url.pathname.match(/^\/recurring-billing-subscription\/([^/]+)(\/cancel)?$/)
    if (sub) {
      if (!authed) return json(401, { message: 'Unauthenticated.' })
      const x = subs.get(sub[1])
      if (!x) return json(404, { message: 'Not found' })
      if (sub[2] && req.method === 'POST') {
        x.status = 'cancelled'
        cancelled.push(x.id)
      }
      return json(200, { data: subJson(x) })
    }
    // The hosted payment page.
    const pay = url.pathname.match(/^\/pay\/([^/]+)(?:\/(approve|decline|silent))?$/)
    if (pay) {
      const o = orders.get(pay[1])
      if (!o) return json(404, { message: 'Unknown order' })
      if (!pay[2]) {
        res.writeHead(200, { 'content-type': 'text/html', ...(req.headers.host?.startsWith('localhost') ? {} : { 'x-frame-options': 'DENY' }) })
        return res.end(
          `<!doctype html><title>Monrem checkout</title><h1>Pay ${(o.amount / 100).toFixed(2)} ${o.currency}</h1><p>${o.body.description}</p>` +
            `<a href="/pay/${o.order_id}/approve">Pay now</a> <a href="/pay/${o.order_id}/decline">Decline</a> <a href="/pay/${o.order_id}/silent">Pay without callback</a>`,
        )
      }
      // Approved or declined; "silent" approves but the callback never arrives.
      o.status = pay[2] === 'decline' ? 'DECLINED' : 'APPROVED'
      // A recurring plan's first payment starts the subscription.
      if (o.status === 'APPROVED' && o.body.recurring_billing_reference) {
        const id = `sub-${Date.now()}-${++n}`
        subs.set(id, { id, ref_id: String(o.body.recurring_billing_reference), status: 'active', first: o, renewals: [] })
        o.subscription = id
      }
      if (pay[2] !== 'silent') await callback(o)
      res.writeHead(302, { location: o.return_url })
      return res.end()
    }
    json(404, { message: `fake-monrem: no route ${req.method} ${url.pathname}` })
  })

  // Monrem charging the next cycle on its own (a new order id of its own).
  const renew = async (subId: string, { notify = true, status = 'APPROVED' } = {}) => {
    const x = subs.get(subId)!
    const o: Order = { ...x.first, order_id: `RB${Date.now()}${++n}`, transaction_id: `GWS${Date.now()}-${++n}`, status, subscription: subId }
    x.renewals.push(o)
    orders.set(o.order_id, o)
    if (notify) await callback(o)
    return o
  }

  return {
    orders,
    callbacks,
    callback,
    subs,
    cancelled,
    renew,
    allowFraming: (on: boolean) => void (framing = on),
    listen: () => new Promise<void>((resolve, reject) => (server.once('error', reject), server.listen(FAKE_MONREM_PORT, '127.0.0.1', () => resolve()))),
    close: () => new Promise<void>((r) => server.close(() => r())),
  }
}
