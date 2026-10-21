// Data endpoint for the Gzavnili website assistant: Loudpilot asks it about a
// parcel, it reads the Brave database (read-only user, one view) and answers
// with the parcel's status. Runs next to Loudpilot under PM2; see README.md.
//
//   BRAVE_DATABASE_URL=postgres://loudpilot_ro:…@host:5432/brave \
//   LOUDPILOT_SECRET=lpsec_… PORT=4100 node integrations/gzavnili/server.mjs
//
// Check the database without Loudpilot:
//   node integrations/gzavnili/server.mjs --check <tracking number> [phone]

import { createHmac, timingSafeEqual } from 'node:crypto'
import { createServer } from 'node:http'
import pg from 'pg'

const PORT = Number(process.env.PORT || 4100)
const SECRET = process.env.LOUDPILOT_SECRET || ''
const VIEW = process.env.PARCELS_VIEW || 'loudpilot_parcels'
if (!/^[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)?$/i.test(VIEW)) throw new Error(`PARCELS_VIEW "${VIEW}" is not a table name`)
if (!process.env.BRAVE_DATABASE_URL) throw new Error('Set BRAVE_DATABASE_URL')

// DATE columns as "YYYY-MM-DD": a JS Date would shift a day with the time zone.
pg.types.setTypeParser(1082, (v) => v)

// Few connections, read-only, short queries: Brave must never feel it.
const pool = new pg.Pool({
  connectionString: process.env.BRAVE_DATABASE_URL,
  max: 3,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  statement_timeout: 5_000,
  options: '-c default_transaction_read_only=on',
})
pool.on('error', (e) => console.error('brave db', e.message))

/* ─── Brave ─────────────────────────────────────────────────────────────── */

// "599 11 22 33", "+995599112233" and "995599112233" are the same phone.
const last9 = (s) => String(s ?? '').replace(/\D/g, '').slice(-9)
const day = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v ?? null)

async function findParcel(tracking) {
  const { rows } = await pool.query(
    `SELECT tracking_number, phone, status, eta, amount_due FROM ${VIEW} WHERE upper(trim(tracking_number)) = upper(trim($1)) LIMIT 1`,
    [tracking],
  )
  return rows[0] ?? null
}

// track_parcel: the parcel only together with the phone on it; anything
// else is "not found" (never which detail was wrong). The phone itself is
// never sent back.
async function trackParcel(params) {
  const tracking = String(params.tracking_number ?? '').trim()
  const phone = last9(params.phone)
  if (!tracking || phone.length < 9) return [404, {}]
  const p = await findParcel(tracking)
  if (!p || last9(p.phone) !== phone) return [404, {}]
  return [
    200,
    {
      tracking_number: p.tracking_number,
      status: p.status,
      expected: day(p.eta),
      amount_due: p.amount_due == null ? null : Number(p.amount_due),
    },
  ]
}

/* ─── Loudpilot ─────────────────────────────────────────────────────────── */

// X-Loudpilot-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, "<t>.<raw body>")>
function verify(raw, header) {
  const m = /t=(\d+),v1=([a-f0-9]{64})/.exec(header ?? '')
  if (!SECRET || !m || Math.abs(Date.now() / 1000 - Number(m[1])) > 300) return false
  const expected = createHmac('sha256', SECRET).update(`${m[1]}.${raw}`).digest('hex')
  return timingSafeEqual(Buffer.from(expected), Buffer.from(m[2]))
}

async function handle(raw, signature) {
  if (!verify(raw, signature)) return [401, { error: 'bad signature' }]
  const { action, params = {} } = JSON.parse(raw)
  if (action === 'track_parcel') return trackParcel(params)
  return [404, {}]
}

/* ─── Run ───────────────────────────────────────────────────────────────── */

if (process.argv[2] === '--check') {
  const [tracking, phone] = process.argv.slice(3)
  const p = await findParcel(tracking ?? '')
  console.log(p ? { ...p, phone: `…${last9(p.phone).slice(-2)}` } : 'not found')
  if (p && phone) console.log('phone matches:', last9(p.phone) === last9(phone))
  await pool.end()
  process.exit(0)
}

createServer(async (req, res) => {
  const send = (status, body) => {
    res.writeHead(status, { 'content-type': 'application/json' })
    res.end(JSON.stringify(body))
  }
  const url = new URL(req.url, 'http://localhost')
  if (req.method === 'GET' && url.pathname === '/health') {
    try {
      await pool.query('SELECT 1')
      return send(200, { ok: true })
    } catch (e) {
      return send(503, { ok: false, error: e.message })
    }
  }
  if (req.method !== 'POST' || url.pathname !== '/loudpilot') return send(404, {})
  let raw = ''
  for await (const chunk of req) {
    raw += chunk
    if (raw.length > 20_000) return send(413, {})
  }
  const started = Date.now()
  let status, body
  try {
    ;[status, body] = await handle(raw, req.headers['x-loudpilot-signature'])
  } catch (e) {
    console.error('lookup failed', e.message)
    ;[status, body] = [503, { error: 'unavailable' }]
  }
  // What was asked and how it went — never the parcel data or the phone.
  let action = '?'
  try {
    action = JSON.parse(raw).action ?? '?'
  } catch {
    // unparsable body
  }
  console.log(`${new Date().toISOString()} ${action} ${status} ${Date.now() - started}ms`)
  send(status, body)
}).listen(PORT, '127.0.0.1', () => console.log(`Gzavnili data endpoint on 127.0.0.1:${PORT}/loudpilot (view ${VIEW})`))
