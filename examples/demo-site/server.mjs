// BoxRoute — a pretend parcel-delivery website for demonstrating the
// Loudpilot Tag and the website assistant. No dependencies (Node 20+):
//
//   LOUDPILOT_SITE_KEY=lp_… LOUDPILOT_SECRET=lpsec_… node server.mjs
//
// It shows the three things a real company does:
//   1. the tag in the <head> (and conversions: a contact form, calls, paying a parcel);
//   2. identify for a signed-in customer, with user_hash made on the server;
//   3. the data endpoint (POST /loudpilot) the assistant asks — signature
//      checked, two details required for anonymous lookups, only the signed-in
//      customer's own parcels for "my parcels".
// GET /requests lists what Loudpilot asked and what was answered.
// All data is made up and lives in memory.

import { createHmac, timingSafeEqual } from 'node:crypto'
import { createServer } from 'node:http'

const PORT = Number(process.env.PORT || 4000)
const LOUDPILOT = (process.env.LOUDPILOT_URL || 'https://loudpilot.app').replace(/\/$/, '')
const SITE_KEY = process.env.LOUDPILOT_SITE_KEY || ''
const SECRET = process.env.LOUDPILOT_SECRET || ''
if (!SITE_KEY || !SECRET) console.warn('Set LOUDPILOT_SITE_KEY and LOUDPILOT_SECRET (Loudpilot → Website → Loudpilot Tag).')

/* ─── Made-up data ──────────────────────────────────────────────────────── */

const CUSTOMERS = {
  'c-1001': { name: 'Nino', phone: '995599112233' },
  'c-1002': { name: 'Giorgi', phone: '995577445566' },
}

const PARCELS = [
  { tracking: 'BR-240117', customer: 'c-1001', from: 'USA (Delaware)', item: 'Sneakers', weightKg: 1.4, status: 'On the way to Tbilisi', eta: 'in 2 days', dueGel: 12.6 },
  { tracking: 'BR-240118', customer: 'c-1001', from: 'China (Guangzhou)', item: 'Phone case', weightKg: 0.3, status: 'Ready for pickup at the Vake branch', eta: null, dueGel: 0 },
  {
    tracking: 'BR-240121',
    customer: 'c-1002',
    from: 'United Kingdom (London)',
    item: 'Laptop',
    weightKg: 2.9,
    status: 'Held at customs',
    eta: null,
    dueGel: 26.1,
    note: 'Worth more than 300 GEL: upload the invoice in your account so customs can release it.',
  },
  { tracking: 'BR-240125', customer: 'c-1002', from: 'Turkey (Istanbul)', item: 'Clothes', weightKg: 2.1, status: 'Delivered', eta: null, dueGel: 0 },
]

const TARIFFS = [
  ['USA', '9 GEL / kg', '6–9 days'],
  ['United Kingdom', '10 GEL / kg', '5–8 days'],
  ['China', '12 GEL / kg', '12–18 days'],
  ['Turkey', '6 GEL / kg', '3–5 days'],
]

const digits = (s) => String(s ?? '').replace(/\D/g, '')
// "599 11 22 33", "+995599112233" and "995599112233" are the same phone.
const samePhone = (a, b) => digits(a).slice(-9) === digits(b).slice(-9) && digits(a).length >= 9
// What the assistant may tell: no names, addresses or ids.
const publicParcel = (p) => ({
  tracking: p.tracking,
  from: p.from,
  item: p.item,
  weight_kg: p.weightKg,
  status: p.status,
  ...(p.eta ? { arrives: p.eta } : {}),
  amount_due_gel: p.dueGel,
  ...(p.note ? { note: p.note } : {}),
})

/* ─── Loudpilot ─────────────────────────────────────────────────────────── */

const hmac = (data) => createHmac('sha256', SECRET).update(data).digest('hex')

// X-Loudpilot-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, "<t>.<raw body>")>
function verify(raw, header) {
  const m = /t=(\d+),v1=([a-f0-9]{64})/.exec(header ?? '')
  if (!m || Math.abs(Date.now() / 1000 - Number(m[1])) > 300) return false
  return timingSafeEqual(Buffer.from(hmac(`${m[1]}.${raw}`)), Buffer.from(m[2]))
}

const log = []

// The data endpoint: Loudpilot → here, when the assistant needs a lookup.
function dataEndpoint(raw, header) {
  if (!verify(raw, header)) return [401, { error: 'bad signature' }]
  const { action, params = {}, customer } = JSON.parse(raw)
  if (action === 'track_parcel') {
    const p = PARCELS.find((x) => x.tracking.toLowerCase() === String(params.tracking_number ?? '').trim().toLowerCase())
    // The phone on the parcel must match too; otherwise simply "not found".
    if (!p || !samePhone(params.phone, CUSTOMERS[p.customer].phone)) return [404, {}]
    return [200, publicParcel(p)]
  }
  if (action === 'my_parcels') {
    if (!customer?.verified || !CUSTOMERS[customer.id]) return [403, {}]
    return [200, { parcels: PARCELS.filter((p) => p.customer === customer.id).map(publicParcel) }]
  }
  return [404, {}]
}

/* ─── Pages ─────────────────────────────────────────────────────────────── */

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

const STYLE = `
*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#18181b;background:#f7f7f5}
a{color:inherit}.wrap{max-width:1040px;margin:0 auto;padding:0 20px}
.bar{background:#18181b;color:#e4e4e7;font-size:12px;text-align:center;padding:8px 16px}
header{display:flex;align-items:center;gap:20px;padding:18px 0;flex-wrap:wrap}.logo{font-weight:800;font-size:22px;letter-spacing:-.5px}.logo span{color:#ea580c}
nav{margin-left:auto;display:flex;gap:16px;align-items:center;font-size:14px;flex-wrap:wrap}
.btn{display:inline-block;border:0;border-radius:10px;padding:10px 16px;font-weight:600;font-size:14px;cursor:pointer;text-decoration:none}
.dark{background:#18181b;color:#fff}.orange{background:#ea580c;color:#fff}.ghost{border:1px solid #d4d4d8;background:#fff}
.hero{display:grid;grid-template-columns:1.2fr 1fr;gap:28px;align-items:center;padding:28px 0}
h1{font-size:40px;line-height:1.1;margin:0 0 12px;letter-spacing:-1px}.muted{color:#71717a}
.card{background:#fff;border:1px solid #e4e4e7;border-radius:16px;padding:20px}
input{width:100%;border:1px solid #d4d4d8;border-radius:10px;padding:10px 12px;font-size:14px;margin:0 0 10px}
table{width:100%;border-collapse:collapse;font-size:14px}td,th{text-align:left;padding:10px 8px;border-bottom:1px solid #f4f4f5}th{color:#71717a;font-weight:500;font-size:12px}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin:24px 0}
.ok{color:#15803d}.warn{color:#b45309}footer{padding:40px 0;font-size:13px;color:#71717a}
@media(max-width:760px){.hero,.grid{grid-template-columns:1fr}h1{font-size:30px}}`

function page(user, track) {
  const me = user && CUSTOMERS[user]
  const identify = me
    ? `<script>loudpilot('identify', { user_id: '${user}', user_hash: '${hmac(user)}', name: '${esc(me.name)}', phone: '+${me.phone}' })</script>`
    : ''
  const mine = me ? PARCELS.filter((p) => p.customer === user) : []
  let trackHtml = ''
  if (track) {
    const p = PARCELS.find((x) => x.tracking.toLowerCase() === track.n.trim().toLowerCase())
    trackHtml =
      p && samePhone(track.phone, CUSTOMERS[p.customer].phone)
        ? `<p class="ok"><b>${esc(p.tracking)}</b>: ${esc(p.status)}${p.eta ? ` — arrives ${esc(p.eta)}` : ''}</p>`
        : `<p class="warn">Nothing found for these details.</p>`
  }
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>BoxRoute — parcels from abroad to Georgia (demo)</title><style>${STYLE}</style>
<script>window.loudpilot=window.loudpilot||function(){(loudpilot.q=loudpilot.q||[]).push(arguments)}</script>
<script async src="${LOUDPILOT}/t.js" data-site="${esc(SITE_KEY)}"></script>
${identify}</head><body>
<div class="bar">Demo website — a made-up company to show the Loudpilot Tag and assistant. Try the chat in the corner. <a href="/requests">What did the assistant ask our server?</a></div>
<div class="wrap">
<header><div class="logo">Box<span>Route</span></div>
<nav><a href="#tariffs">Tariffs</a><a href="#track">Track</a><a href="tel:+995322000000">+995 32 2 00 00 00</a><a href="https://wa.me/995599000000" target="_blank" rel="noreferrer">WhatsApp</a>
${me ? `<span>Hi, ${esc(me.name)}</span><a class="btn ghost" href="/signout">Sign out</a>` : `<a class="btn ghost" href="/signin?as=c-1001">Sign in as Nino</a><a class="btn ghost" href="/signin?as=c-1002">Sign in as Giorgi</a>`}</nav></header>

<section class="hero"><div><h1>Shop in the USA, UK, China and Turkey — we bring it to Georgia.</h1>
<p class="muted">Free address abroad, delivery in 3–18 days, pickup at 6 branches in Tbilisi or courier to your door. Ask the assistant anything.</p>
<a class="btn orange" href="#contact">Get your free address</a></div>
<div class="card" id="track"><b>Track a parcel</b><p class="muted" style="font-size:13px">Tracking number and the phone on the parcel.</p>
<form method="get" action="/#track"><input name="n" placeholder="BR-240117" value="${esc(track?.n)}" aria-label="Tracking number"><input name="phone" placeholder="599 11 22 33" value="${esc(track?.phone)}" aria-label="Phone"><button class="btn dark">Track</button></form>${trackHtml}</div></section>

${
  me
    ? `<section class="card"><b>My parcels</b><table><tr><th>Tracking</th><th>From</th><th>Item</th><th>Status</th><th>Due</th><th></th></tr>
${mine
  .map(
    (p) =>
      `<tr><td>${p.tracking}</td><td>${esc(p.from)}</td><td>${esc(p.item)}</td><td>${esc(p.status)}</td><td>${p.dueGel ? `${p.dueGel.toFixed(2)} GEL` : '—'}</td><td>${
        p.dueGel ? `<button class="btn orange" onclick="pay('${p.tracking}', ${p.dueGel}, this)">Pay</button>` : ''
      }</td></tr>`,
  )
  .join('')}</table></section>`
    : ''
}

<section id="tariffs"><h2>Tariffs</h2><div class="card"><table><tr><th>From</th><th>Price</th><th>Delivery</th></tr>
${TARIFFS.map((t) => `<tr><td>${t[0]}</td><td>${t[1]}</td><td>${t[2]}</td></tr>`).join('')}</table>
<p class="muted" style="font-size:13px">Minimum charge 1 kg. Courier in Tbilisi 5 GEL. Customs: parcels worth more than 300 GEL need an invoice.</p></div></section>

<div class="grid"><div class="card"><b>Free address abroad</b><p class="muted">Sign up and get addresses in all four countries at once.</p></div>
<div class="card"><b>6 branches in Tbilisi</b><p class="muted">Vake, Saburtalo, Didube, Gldani, Isani, Varketili — 10:00–20:00 every day.</p></div>
<div class="card"><b>Insurance</b><p class="muted">3% of the declared value, up to 3,000 GEL.</p></div></div>

<section id="contact" class="card" style="max-width:460px"><b>Get your free address</b><p class="muted" style="font-size:13px">We call you back within an hour.</p>
<form onsubmit="event.preventDefault(); this.innerHTML='<p class=ok>Thank you! We will call you soon.</p>'">
<input name="name" placeholder="Your name" aria-label="Name"><input name="phone" type="tel" placeholder="Phone" aria-label="Phone"><input type="hidden" name="lp_visitor_id"><button class="btn orange">Send</button></form></section>
<footer>BoxRoute is not a real company. Data on this page is made up. Built to demonstrate <a href="https://loudpilot.app">Loudpilot</a>.</footer>
</div>
<script>
function pay(tracking, amount, btn) {
  loudpilot('track', 'Purchase', { value: amount, currency: 'GEL', order_id: tracking })
  fetch('/pay?t=' + encodeURIComponent(tracking), { method: 'POST' }).then(function () { btn.outerHTML = '<span class="ok">Paid</span>' })
}
</script></body></html>`
}

function requestsPage() {
  const rows = log
    .map(
      (r) =>
        `<tr><td>${esc(r.at.slice(11, 19))}</td><td>${r.valid ? '<span class="ok">valid</span>' : '<span class="warn">invalid</span>'}</td><td>${esc(r.action)}</td><td><code>${esc(JSON.stringify(r.params))}</code></td><td>${esc(
          r.customer ? `${r.customer.id} (verified)` : 'anonymous',
        )}</td><td>${r.status}</td><td><code>${esc(JSON.stringify(r.answer)).slice(0, 300)}</code></td></tr>`,
    )
    .join('')
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Lookups — BoxRoute demo</title><style>${STYLE} code{font-size:12px}</style>
<meta http-equiv="refresh" content="5"></head><body><div class="wrap"><header><a class="logo" href="/" style="text-decoration:none">Box<span>Route</span></a></header>
<h2>What the assistant asked our server</h2>
<p class="muted">Every request Loudpilot sends to <code>POST /loudpilot</code>: the signature check, the details the visitor gave, whether the customer was signed in, and our answer. Loudpilot itself never sees our data — only these answers. Refreshes every 5 seconds.</p>
<div class="card" style="overflow-x:auto"><table><tr><th>Time</th><th>Signature</th><th>Lookup</th><th>Details</th><th>Customer</th><th>Status</th><th>Answer</th></tr>${rows || '<tr><td colspan="7" class="muted">No lookups yet — ask the chat about a parcel.</td></tr>'}</table></div></div></body></html>`
}

/* ─── Server ────────────────────────────────────────────────────────────── */

const cookie = (req, name) => (req.headers.cookie ?? '').split(/;\s*/).find((c) => c.startsWith(`${name}=`))?.slice(name.length + 1)

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost')
  const send = (status, body, type = 'text/html; charset=utf-8', headers = {}) => {
    res.writeHead(status, { 'content-type': type, ...headers })
    res.end(body)
  }
  const user = CUSTOMERS[cookie(req, 'demo_user')] ? cookie(req, 'demo_user') : null

  if (req.method === 'POST' && url.pathname === '/loudpilot') {
    let raw = ''
    for await (const chunk of req) raw += chunk
    let status, answer
    try {
      ;[status, answer] = dataEndpoint(raw, req.headers['x-loudpilot-signature'])
    } catch {
      ;[status, answer] = [400, { error: 'bad request' }]
    }
    let body = {}
    try {
      body = JSON.parse(raw)
    } catch {
      // logged as is
    }
    log.unshift({ at: new Date().toISOString(), valid: status !== 401, action: body.action, params: body.params, customer: body.customer, status, answer })
    log.length = Math.min(log.length, 50)
    return send(status, JSON.stringify(answer), 'application/json')
  }
  if (req.method === 'POST' && url.pathname === '/pay') {
    const p = PARCELS.find((x) => x.tracking === url.searchParams.get('t') && x.customer === user)
    if (p) p.dueGel = 0
    return send(p ? 200 : 404, '{}', 'application/json')
  }
  if (url.pathname === '/signin' && CUSTOMERS[url.searchParams.get('as')]) {
    return send(302, '', 'text/plain', { location: '/', 'set-cookie': `demo_user=${url.searchParams.get('as')}; Path=/; HttpOnly; SameSite=Lax` })
  }
  if (url.pathname === '/signout') return send(302, '', 'text/plain', { location: '/', 'set-cookie': 'demo_user=; Path=/; Max-Age=0' })
  if (url.pathname === '/requests') return send(200, requestsPage())
  if (url.pathname === '/') {
    const n = url.searchParams.get('n')
    return send(200, page(user, n ? { n, phone: url.searchParams.get('phone') ?? '' } : null))
  }
  send(404, 'Not found', 'text/plain')
}).listen(PORT, () => console.log(`BoxRoute demo on http://localhost:${PORT} (Loudpilot: ${LOUDPILOT})`))
