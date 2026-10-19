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

type Order = { order_id: string; transaction_id: string; amount: number; currency: string; status: string; callback_url: string; return_url: string; body: Record<string, unknown> }

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')
export const signed = (o: { order_id: string; status: string; amount: number; currency: string }, password = FAKE_API_PASSWORD) => ({
  ...o,
  hash: sha256(o.order_id + password),
  integrity_hash: sha256(`${o.order_id}${o.status}${o.amount}${o.currency}${password}`),
})

export function startFakeMonrem() {
  const orders = new Map<string, Order>()
  const callbacks: { order_id: string; status: string; code: number }[] = []
  let n = 0

  const txOf = (o: Order) => signed({ order_id: o.order_id, status: o.status, amount: o.amount, currency: o.currency })
  const callback = async (o: Order) => {
    const res = await fetch(o.callback_url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...txOf(o), transaction_id: o.transaction_id, status_description: o.status === 'APPROVED' ? 'Success' : 'Do not honour' }) })
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
      for (const f of ['order_id', 'currency', 'description', 'ip_address', 'referer_url', 'return_url']) if (!body[f]) return json(422, { message: 'Invalid', errors: { [f]: [`The ${f} field is required.`] } })
      const o: Order = {
        order_id: String(body.order_id),
        transaction_id: `GWS${++n}`,
        amount: Number(body.amount),
        currency: String(body.currency),
        status: 'PENDING',
        callback_url: String(body.callback_url),
        return_url: String(body.return_url),
        body,
      }
      orders.set(o.order_id, o)
      return json(200, { ...txOf(o), transaction_id: o.transaction_id, hpp_url: `${BASE}/pay/${o.order_id}` })
    }
    if (req.method === 'GET' && url.pathname === '/status') {
      if (!authed) return json(401, { message: 'Unauthenticated.' })
      const o = orders.get(url.searchParams.get('order_id') ?? '')
      if (!o) return json(422, { message: 'Not found', errors: { order_id: ['Unknown order'] } })
      return json(200, { order_id: o.order_id, transaction_id: o.transaction_id, amount: o.amount, currency: o.currency, status: o.status, status_description: o.status === 'APPROVED' ? 'Success' : 'Pending', transaction_type: 'purchase' })
    }
    // The hosted payment page.
    const pay = url.pathname.match(/^\/pay\/([^/]+)(?:\/(approve|decline|silent))?$/)
    if (pay) {
      const o = orders.get(pay[1])
      if (!o) return json(404, { message: 'Unknown order' })
      if (!pay[2]) {
        res.writeHead(200, { 'content-type': 'text/html' })
        return res.end(
          `<!doctype html><title>Monrem checkout</title><h1>Pay ${(o.amount / 100).toFixed(2)} ${o.currency}</h1><p>${o.body.description}</p>` +
            `<a href="/pay/${o.order_id}/approve">Pay now</a> <a href="/pay/${o.order_id}/decline">Decline</a> <a href="/pay/${o.order_id}/silent">Pay without callback</a>`,
        )
      }
      // Approved or declined; "silent" approves but the callback never arrives.
      o.status = pay[2] === 'decline' ? 'DECLINED' : 'APPROVED'
      if (pay[2] !== 'silent') await callback(o)
      res.writeHead(302, { location: o.return_url })
      return res.end()
    }
    json(404, { message: `fake-monrem: no route ${req.method} ${url.pathname}` })
  })

  return {
    orders,
    callbacks,
    callback,
    listen: () => new Promise<void>((resolve, reject) => (server.once('error', reject), server.listen(FAKE_MONREM_PORT, '127.0.0.1', () => resolve()))),
    close: () => new Promise<void>((r) => server.close(() => r())),
  }
}
