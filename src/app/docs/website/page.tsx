import type { Metadata } from 'next'
import { Bot, Code2, Database, ShieldCheck } from 'lucide-react'
import { CONTACT } from '@/components/landing/site'
import { siteUrl } from '@/lib/hosts'
import { STANDARD_EVENTS } from '@/lib/tag'
import { CodeBlock } from '../CodeBlock'
import { DocsShell, Endpoint, Params, Section, type DocsNav } from '../parts'

export const metadata: Metadata = {
  title: 'Website tag & chat — developer guide — Loudpilot',
  description: 'Install the Loudpilot Tag, track leads and sales from ads, send server-side events, and connect the website assistant to your orders safely.',
}

const NAV: DocsNav = [
  {
    title: 'Get started',
    items: [
      { id: 'overview', label: 'Overview' },
      { id: 'install', label: 'Install the tag' },
      { id: 'automatic', label: 'What is tracked by itself' },
      { id: 'consent', label: 'Cookie consent' },
    ],
  },
  {
    title: 'Tracking',
    items: [
      { id: 'track', label: 'Track conversions' },
      { id: 'identify', label: 'Identify people' },
      { id: 'visitor-id', label: 'The visitor id' },
      { id: 'ad-links', label: 'Ad links (UTM)' },
      { id: 'server-events', label: 'Server-side events' },
      { id: 'meta', label: 'Meta Conversions API' },
    ],
  },
  {
    title: 'Website chat',
    items: [
      { id: 'chat', label: 'The assistant' },
      { id: 'verified', label: 'Signed-in customers' },
      { id: 'data-endpoint', label: 'Your data endpoint' },
      { id: 'security', label: 'How private data stays private' },
      { id: 'testing', label: 'Testing' },
    ],
  },
  {
    title: 'Reference',
    items: [
      { id: 'secret', label: 'Site secret' },
      { id: 'signatures', label: 'Signatures' },
      { id: 'limits', label: 'Limits' },
    ],
  },
]

const SNIPPET_KEY = 'lp_3fK9aQ2xZ1bT'

const VERIFY_NODE = `import { createHmac, timingSafeEqual } from 'node:crypto'

// X-Loudpilot-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, "<t>.<raw body>")>
export function verifyLoudpilot(rawBody, header, secret) {
  const m = /t=(\\d+),v1=([a-f0-9]{64})/.exec(header ?? '')
  if (!m || Math.abs(Date.now() / 1000 - Number(m[1])) > 300) return false
  const expected = createHmac('sha256', secret).update(\`\${m[1]}.\${rawBody}\`).digest('hex')
  return timingSafeEqual(Buffer.from(expected), Buffer.from(m[2]))
}`

const VERIFY_PHP = `function loudpilot_verify(string $rawBody, string $header, string $secret): bool {
    if (!preg_match('/t=(\\d+),v1=([a-f0-9]{64})/', $header, $m)) return false;
    if (abs(time() - (int) $m[1]) > 300) return false;
    return hash_equals(hash_hmac('sha256', $m[1] . '.' . $rawBody, $secret), $m[2]);
}`

const VERIFY_PY = `import hashlib, hmac, re, time

def loudpilot_verify(raw_body: bytes, header: str, secret: str) -> bool:
    m = re.search(r"t=(\\d+),v1=([a-f0-9]{64})", header or "")
    if not m or abs(time.time() - int(m.group(1))) > 300:
        return False
    expected = hmac.new(secret.encode(), m.group(1).encode() + b"." + raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, m.group(2))`

export default function WebsiteDocsPage() {
  const BASE = siteUrl()
  const snippet = `<script async src="${BASE}/t.js" data-site="${SNIPPET_KEY}"></script>`
  return (
    <DocsShell
      nav={NAV}
      badge="Website tag & chat"
      links={[
        { href: '/docs', label: 'Partner API' },
        { href: '/', label: 'Website' },
      ]}
      action={{ href: CONTACT, label: 'Talk to us' }}
    >
      <section id="overview" className="scroll-mt-24 pb-12">
        <p className="text-sm font-semibold text-indigo-600">Developer guide</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight text-balance">Know which ads bring customers — and answer them on your site</h1>
        <p className="mt-4 text-lg text-zinc-600">
          One script tag records where each visitor came from and what they did, sends your conversions to Meta, and runs an AI assistant that can look up
          orders through your own system — without ever touching your database.
        </p>
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {[
            { icon: Code2, t: '1. Paste one line', d: 'Visits, sources, calls, forms and the chat — no code beyond that.', h: '#install' },
            { icon: Database, t: '2. Report sales', d: 'One line on the thank-you page, or one call from your server.', h: '#track' },
            { icon: ShieldCheck, t: '3. Signed-in customers', d: 'A hash from your server, so the chat knows who is asking.', h: '#verified' },
            { icon: Bot, t: '4. Your data endpoint', d: 'One HTTPS endpoint answers order and booking lookups.', h: '#data-endpoint' },
          ].map((c) => (
            <a key={c.t} href={c.h} className="group rounded-xl border border-zinc-200 p-4 transition hover:border-zinc-300 hover:shadow-sm">
              <c.icon size={18} className="text-indigo-600" />
              <p className="mt-2 font-semibold">{c.t}</p>
              <p className="text-sm text-zinc-500">{c.d}</p>
            </a>
          ))}
        </div>
        <p className="mt-6 text-sm text-zinc-500">
          Steps 1 and 2 are all most sites need. Your site key and site secret are in Loudpilot under <i>Website → Loudpilot Tag</i>.
        </p>
      </section>

      <Section id="install" title="Install the tag">
        <p>
          Put this in the <code>&lt;head&gt;</code> of every page. It loads asynchronously and never slows the page down.
        </p>
        <CodeBlock tabs={[{ label: 'html', code: snippet }]} />
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <b>WordPress</b> — a “header and footer scripts” plugin, or your theme’s <code>header.php</code>.
          </li>
          <li>
            <b>Shopify</b> — Online Store → Themes → Edit code → <code>theme.liquid</code>, before <code>&lt;/head&gt;</code>.
          </li>
          <li>
            <b>Tilda, Wix, Webflow</b> — Site settings → Custom code → Head.
          </li>
          <li>
            <b>Google Tag Manager</b> — a Custom HTML tag on All Pages.
          </li>
          <li>
            <b>React, Next.js, Vue</b> — the same tag in the root layout. Page changes inside a single-page app are tracked automatically.
          </li>
        </ul>
        <p>
          If inline scripts call <code>loudpilot()</code> before the tag has loaded, add the queue line first — calls made before loading are kept and sent in
          order:
        </p>
        <CodeBlock
          tabs={[
            {
              label: 'html',
              code: `<script>window.loudpilot=window.loudpilot||function(){(loudpilot.q=loudpilot.q||[]).push(arguments)}</script>\n${snippet}`,
            },
          ]}
        />
        <Params
          title="Attribute"
          rows={[
            ['data-site', 'required', 'Your site key (public, safe in the page).'],
            ['data-consent', '"required"', 'Record nothing until consent is given — see Cookie consent.'],
            ['data-forms', '"off"', 'Do not turn forms into Lead events automatically.'],
          ]}
        />
        <p>
          In Loudpilot, set <b>Your domains</b> so events are accepted only from your sites (subdomains included).
        </p>
      </Section>

      <Section id="automatic" title="What is tracked by itself">
        <Params
          title="Event"
          rows={[
            ['PageView', 'every page', 'Including page changes in single-page apps.'],
            ['Contact', 'clicks', 'Links to tel:, mailto:, WhatsApp (wa.me), Telegram (t.me) and Viber. properties.method says which.'],
            ['Lead', 'form submit', 'Any form with an e-mail or phone field (not login forms with a password). The e-mail / phone also identify the person.'],
          ]}
        />
        <p>
          Each visit records where it came from: <code>utm_*</code> parameters, the ad click id (<code>gclid</code>, <code>fbclid</code>, <code>ttclid</code>,{' '}
          <code>msclkid</code>), or the referring site (Google search, Instagram, ChatGPT…). A new ad click starts a new visit; 30 minutes without activity end
          one. Add <code>data-lp-ignore</code> to a form to skip it.
        </p>
      </Section>

      <Section id="consent" title="Cookie consent">
        <p>
          The tag sets two first-party cookies on your domain: <code>_lp_id</code> (the browser, 400 days) and <code>_lp_s</code> (the visit, 30 minutes). With{' '}
          <i>Wait for cookie consent</i> on (or <code>data-consent=&quot;required&quot;</code>) nothing is stored or sent until your banner says so:
        </p>
        <CodeBlock
          tabs={[
            {
              label: 'js',
              code: `// In your cookie banner's "accept analytics / marketing" handler:
loudpilot('consent', true)

// Withdrawn: stops sending and removes Loudpilot cookies.
loudpilot('consent', false)`,
            },
          ]}
        />
        <p>The chat works without consent: it is a service the visitor starts themselves.</p>
      </Section>

      <Section id="track" title="Track conversions">
        <p>Call it where the action happens — usually on the thank-you or order-confirmation page.</p>
        <CodeBlock
          tabs={[
            {
              label: 'js',
              code: `loudpilot('track', 'Purchase', { value: 120, currency: 'GEL', order_id: '1001', content_ids: ['rose-box'] })
loudpilot('track', 'Schedule')                       // a booking
loudpilot('track', 'CompleteRegistration')           // a sign-up
loudpilot('track', 'quiz_finished', { score: 8 })    // your own event`,
            },
          ]}
        />
        <p>
          Use Meta’s standard names — they go to Meta as they are: {STANDARD_EVENTS.map((e, i) => (
            <span key={e}>
              {i > 0 && ', '}
              <code>{e}</code>
            </span>
          ))}
          . GA4 names work too (<code>purchase</code>, <code>generate_lead</code>, <code>sign_up</code>, <code>add_to_cart</code>, <code>begin_checkout</code>). Other
          names are custom events (letters, digits and _ up to 40).
        </p>
        <Params
          title="Property"
          rows={[
            ['value', 'number', 'Money value; reports add it up as revenue.'],
            ['currency', 'string', 'ISO 4217, e.g. GEL, USD.'],
            ['anything else', 'JSON', 'Kept with the event (up to 3 KB) and sent to Meta as custom_data — order_id, content_ids, …'],
          ]}
        />
        <p>
          Reports count <code>Lead</code>, <code>Contact</code>, <code>CompleteRegistration</code>, <code>Schedule</code>, <code>SubmitApplication</code>,{' '}
          <code>Subscribe</code> and <code>StartTrial</code> as leads, and <code>Purchase</code> as a sale.
        </p>
      </Section>

      <Section id="identify" title="Identify people">
        <p>When you know who the visitor is — they logged in or left their details — tell the tag. It helps match sales from your server to the ad that brought the person, and Meta to match the conversion.</p>
        <CodeBlock tabs={[{ label: 'js', code: `loudpilot('identify', { email: 'nino@example.com', phone: '+995599123456', name: 'Nino' })` }]} />
        <p>
          Loudpilot keeps only a SHA-256 hash of the e-mail and phone (what Meta matches on) and a masked form for your reports (<code>ni***@example.com</code>). For
          logged-in customers in the chat, also pass <code>user_id</code> and <code>user_hash</code> — see <a href="#verified">Signed-in customers</a>.
        </p>
      </Section>

      <Section id="visitor-id" title="The visitor id">
        <p>To tie an order in your system to the visit and the ad, send the visitor id with it. Three ways to get it:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <b>Forms</b> — add <code>&lt;input type=&quot;hidden&quot; name=&quot;lp_visitor_id&quot;&gt;</code>; the tag fills it in. Your CRM receives it with the lead.
          </li>
          <li>
            <b>Your server</b> — read the <code>_lp_id</code> cookie from the request (it is on your own domain).
          </li>
          <li>
            <b>JavaScript</b> — <code>{`loudpilot('visitorId', (id) => …)`}</code>.
          </li>
        </ul>
        <p>Without it, Loudpilot still finds the person by user id, e-mail or phone if they were identified on the site before.</p>
      </Section>

      <Section id="ad-links" title="Ad links (UTM)">
        <p>
          Add URL parameters to your ads so every visit names its campaign. With campaign <b>ids</b> Loudpilot matches visits to the campaigns of your connected ad
          account and shows spend, cost per lead and return next to them.
        </p>
        <CodeBlock
          tabs={[
            { label: 'Meta', code: 'utm_source=facebook&utm_medium=paid&utm_campaign={{campaign.id}}&utm_content={{ad.id}}&utm_term={{adset.id}}' },
            { label: 'Google Ads', code: 'utm_source=google&utm_medium=cpc&utm_campaign={campaignid}&utm_content={creative}&utm_term={keyword}' },
            { label: 'TikTok', code: 'utm_source=tiktok&utm_medium=paid&utm_campaign=__CAMPAIGN_ID__&utm_content=__CID__' },
          ]}
        />
        <p>
          Meta: Ads Manager → ad → Destination → URL parameters. Google Ads: Admin → Account settings → Tracking → Final URL suffix. Visits with a paid medium (
          <code>cpc</code>, <code>paid</code>, <code>ppc</code>…) or an ad click id are marked as ads.
        </p>
      </Section>

      <Section id="server-events" title="Server-side events">
        <p>
          Report what happens outside the browser — an order paid by bank transfer, a deal won in your CRM, a call booked by phone. Loudpilot credits it to the
          person’s latest visit, so the sale shows up under the ad that brought them.
        </p>
        <Endpoint method="POST" path={`${BASE}/api/tag/v1/events`}>
          <p>
            Authenticate with the site secret as a bearer token (simplest; also works from Zapier, Make and n8n), or sign the raw body like{' '}
            <a href="#signatures">our requests to you</a> and send <code>X-Loudpilot-Signature</code>. From your server only.
          </p>
          <Params
            rows={[
              ['site', 'string, required', 'Your site key.'],
              ['events', 'array, required', '1–100 events.'],
              ['events[].name', 'string, required', 'Purchase, Lead … (see Track conversions).'],
              ['events[].event_id', 'string', 'Your id (e.g. order-1001). The same id twice is recorded once — safe to retry.'],
              ['events[].visitor_id', 'string', 'The _lp_id cookie / lp_visitor_id field.'],
              ['events[].user_id', 'string', 'Your customer id, if they signed in on the site.'],
              ['events[].email, phone', 'string', 'Used to find the person; stored hashed.'],
              ['events[].value, currency', 'number, string', 'Money value and ISO currency.'],
              ['events[].time', 'number', 'Unix seconds when it happened (default: now).'],
              ['events[].url, ip', 'string', 'Page and client IP, if you have them (better Meta matching).'],
              ['events[].properties', 'object', 'Anything else, up to 3 KB.'],
            ]}
          />
          <CodeBlock
            tabs={[
              {
                label: 'curl',
                code: `curl -X POST ${BASE}/api/tag/v1/events \\
  -H "Authorization: Bearer $LOUDPILOT_SECRET" \\
  -H "Content-Type: application/json" \\
  -d '{"site":"${SNIPPET_KEY}","events":[{"name":"Purchase","event_id":"order-1001","visitor_id":"8f3a…","email":"nino@example.com","value":120,"currency":"GEL"}]}'`,
              },
              {
                label: 'Node.js',
                code: `await fetch('${BASE}/api/tag/v1/events', {
  method: 'POST',
  headers: { Authorization: \`Bearer \${process.env.LOUDPILOT_SECRET}\`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    site: '${SNIPPET_KEY}',
    events: [{ name: 'Purchase', event_id: \`order-\${order.id}\`, visitor_id: req.cookies._lp_id, email: order.email, value: order.total, currency: 'GEL' }],
  }),
})`,
              },
              {
                label: 'PHP',
                code: `$ch = curl_init('${BASE}/api/tag/v1/events');
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . getenv('LOUDPILOT_SECRET'), 'Content-Type: application/json'],
    CURLOPT_POSTFIELDS => json_encode([
        'site' => '${SNIPPET_KEY}',
        'events' => [['name' => 'Purchase', 'event_id' => 'order-' . $order->id, 'visitor_id' => $_COOKIE['_lp_id'] ?? null,
                      'email' => $order->email, 'value' => $order->total, 'currency' => 'GEL']],
    ]),
]);
curl_exec($ch);`,
              },
              {
                label: 'Python',
                code: `import os, requests

requests.post(
    "${BASE}/api/tag/v1/events",
    headers={"Authorization": f"Bearer {os.environ['LOUDPILOT_SECRET']}"},
    json={"site": "${SNIPPET_KEY}", "events": [{"name": "Purchase", "event_id": f"order-{order.id}",
          "visitor_id": request.cookies.get("_lp_id"), "email": order.email, "value": order.total, "currency": "GEL"}]},
    timeout=10,
)`,
              },
            ]}
          />
          <CodeBlock
            title="Response"
            tabs={[{ label: 'json', code: JSON.stringify({ results: [{ event_id: 'order-1001', status: 'recorded', matched: true }] }, null, 2) }]}
          />
          <p>
            <code>status</code> is <code>recorded</code>, <code>duplicate</code> (that event id was already recorded) or <code>invalid</code> (unusable name).{' '}
            <code>matched</code> says whether the person was found; unmatched events still count, without a source. Errors: <code>401 unauthorized</code>,{' '}
            <code>404 unknown_site</code>, <code>400 invalid_request</code>, <code>429 rate_limited</code>.
          </p>
        </Endpoint>
      </Section>

      <Section id="meta" title="Meta Conversions API">
        <p>
          Turn on <i>Send conversions to my Meta pixel</i> in Loudpilot and enter the pixel (dataset) id. Conversions from the browser, your server and the chat go
          to Meta from Loudpilot’s server within a minute — with the click id, hashed e-mail / phone, IP and browser, so Meta can match them even when the pixel
          is blocked. It uses your connected Meta ad account, or a Conversions API token you paste (Events Manager → Settings → Generate access token).
        </p>
        <p>
          <b>No double counting.</b> Meta counts an event once when the pixel and the server send the same event id. If your site does not send these events to the
          pixel itself, turn on <i>Also send them through the pixel</i> — the tag fires <code>fbq(&apos;track&apos;, …)</code> with the same id. If your site already
          sends, say, <code>Purchase</code> to the pixel, untick <code>Purchase</code> in <i>Events to send</i>.
        </p>
      </Section>

      <Section id="chat" title="The assistant">
        <p>
          Switch it on in Loudpilot under <i>Inbox → Assistant</i>; the tag shows the chat button on every page. It answers from the instructions and facts you give
          it (it can write a first version from your website), in the languages you choose. Red-flag topics, a request for a person, or anything it cannot answer
          go to your team — by e-mail and Telegram — and you answer in <i>Inbox → Website chat</i>; the visitor sees your reply in the same chat.
        </p>
        <CodeBlock
          tabs={[
            {
              label: 'js',
              code: `loudpilot('chat', 'open')   // e.g. from your own "Ask us" button
loudpilot('chat', 'close')
loudpilot('chat', 'hide')   // no chat button on this page (checkout…)
loudpilot('chat', 'show')`,
            },
          ]}
        />
        <p>Without your data endpoint the assistant answers general questions and hands questions about orders and accounts to your team.</p>
      </Section>

      <Section id="verified" title="Signed-in customers">
        <p>
          When the visitor is logged in on your site, tell the tag who they are, with a hash only your server can make. Lookups marked <i>For signed-in customers
          only</i> (“my orders”, “my bookings”) are then offered to the assistant, and Loudpilot sends your endpoint that customer id — the assistant cannot
          choose or change it, so it can never ask about someone else.
        </p>
        <p>
          <code>user_hash</code> = HMAC-SHA256 of the user id with your site secret, hex. Compute it on your server; never put the secret in the page.
        </p>
        <CodeBlock
          tabs={[
            {
              label: 'Node.js',
              code: `import { createHmac } from 'node:crypto'

const userHash = createHmac('sha256', process.env.LOUDPILOT_SECRET).update(String(user.id)).digest('hex')
// Render into the page:
// <script>loudpilot('identify', { user_id: '\${user.id}', user_hash: '\${userHash}', name: '\${user.firstName}' })</script>`,
            },
            {
              label: 'PHP',
              code: `<?php $hash = hash_hmac('sha256', (string) $user->id, getenv('LOUDPILOT_SECRET')); ?>
<script>
  loudpilot('identify', { user_id: '<?= $user->id ?>', user_hash: '<?= $hash ?>', name: <?= json_encode($user->first_name) ?> })
</script>`,
            },
            {
              label: 'Python',
              code: `import hashlib, hmac, os

user_hash = hmac.new(os.environ["LOUDPILOT_SECRET"].encode(), str(user.id).encode(), hashlib.sha256).hexdigest()
# Template: <script>loudpilot('identify', { user_id: '{{ user.id }}', user_hash: '{{ user_hash }}' })</script>`,
            },
          ]}
        />
        <p>A wrong or missing hash is ignored: the visitor is treated as not signed in.</p>
      </Section>

      <Section id="data-endpoint" title="Your data endpoint">
        <p>
          One HTTPS endpoint on your server answers the lookups you list in Loudpilot (order status, my orders, a booking…). When the assistant needs one,
          Loudpilot calls it — signed with your site secret — and the assistant reads only what you return.
        </p>
        <CodeBlock
          title="Loudpilot → your endpoint"
          tabs={[
            {
              label: 'http',
              code: `POST https://api.yourshop.ge/loudpilot
Content-Type: application/json
X-Loudpilot-Action: order_status
X-Loudpilot-Signature: t=1792570000,v1=9a3f…

${JSON.stringify(
  { action: 'order_status', params: { order_number: 'A-1001', email_or_phone: 'nino@example.com' }, customer: null, conversation_id: 'cmc4…', site: SNIPPET_KEY, test: false },
  null,
  2,
)}`,
            },
          ]}
        />
        <Params
          title="Field"
          rows={[
            ['action', 'string', 'The lookup’s name as you set it in Loudpilot.'],
            ['params', 'object', 'Exactly the details you listed for that lookup, as the visitor gave them (strings, up to 200 characters).'],
            ['customer', 'object | null', '{ id, verified: true } for a signed-in customer (verified with user_hash); null otherwise.'],
            ['conversation_id', 'string', 'For your logs.'],
            ['test', 'boolean', 'true for test requests and demo-shop chats.'],
          ]}
        />
        <Params
          title="Your answer"
          rows={[
            ['200 + JSON', 'found', 'Only what the customer may see: status, dates, tracking link. Keep it small (up to 100 KB).'],
            ['404', 'not found', 'Not found — also when the second detail does not match. Never say which detail was wrong.'],
            ['401 / 403', 'not allowed', 'Bad signature, or a lookup that needs a signed-in customer without one.'],
            ['anything else', 'unavailable', 'The assistant apologises and offers a person.'],
          ]}
        />
        <p>8-second timeout; redirects are not followed.</p>
        <CodeBlock
          tabs={[
            {
              label: 'Node.js (Express)',
              code: `import express from 'express'
${VERIFY_NODE.split('\n').slice(1).join('\n')}

const app = express()
app.post('/loudpilot', express.raw({ type: 'application/json' }), async (req, res) => {
  const raw = req.body.toString('utf8')
  if (!verifyLoudpilot(raw, req.get('x-loudpilot-signature'), process.env.LOUDPILOT_SECRET)) return res.status(401).end()
  const { action, params, customer } = JSON.parse(raw)

  if (action === 'order_status') {
    const order = await db.orders.findByNumber(params.order_number)
    // The second detail must match the order — otherwise it is simply "not found".
    const given = params.email_or_phone.trim().toLowerCase()
    if (!order || (given !== order.email.toLowerCase() && digits(given) !== digits(order.phone))) return res.status(404).json({})
    return res.json({ status: order.status, delivery: order.deliveryDate, tracking_url: order.trackingUrl })
  }
  if (action === 'my_orders') {
    if (!customer?.verified) return res.status(403).json({})
    const orders = await db.orders.recentForUser(customer.id, 5)
    return res.json({ orders: orders.map((o) => ({ number: o.number, status: o.status, total: o.total })) })
  }
  res.status(404).json({})
})

const digits = (s) => String(s ?? '').replace(/\\D/g, '')`,
            },
            {
              label: 'PHP',
              code: `${VERIFY_PHP}

$raw = file_get_contents('php://input');
if (!loudpilot_verify($raw, $_SERVER['HTTP_X_LOUDPILOT_SIGNATURE'] ?? '', getenv('LOUDPILOT_SECRET'))) {
    http_response_code(401);
    exit;
}
$req = json_decode($raw, true);
header('Content-Type: application/json');

if ($req['action'] === 'order_status') {
    $order = find_order($req['params']['order_number']);
    $given = strtolower(trim($req['params']['email_or_phone']));
    $digits = fn($s) => preg_replace('/\\D/', '', (string) $s);
    if (!$order || ($given !== strtolower($order['email']) && $digits($given) !== $digits($order['phone']))) {
        http_response_code(404);
        exit('{}');
    }
    echo json_encode(['status' => $order['status'], 'delivery' => $order['delivery_date']]);
    exit;
}
if ($req['action'] === 'my_orders' && ($req['customer']['verified'] ?? false)) {
    echo json_encode(['orders' => recent_orders($req['customer']['id'], 5)]);
    exit;
}
http_response_code(404);
echo '{}';`,
            },
            {
              label: 'Python (Flask)',
              code: `import os
${VERIFY_PY}

from flask import Flask, request, jsonify
app = Flask(__name__)

@app.post("/loudpilot")
def loudpilot():
    if not loudpilot_verify(request.get_data(), request.headers.get("X-Loudpilot-Signature", ""), os.environ["LOUDPILOT_SECRET"]):
        return "", 401
    body = request.get_json()
    if body["action"] == "order_status":
        order = find_order(body["params"]["order_number"])
        given = body["params"]["email_or_phone"].strip().lower()
        digits = lambda s: re.sub(r"\\D", "", s or "")
        if not order or (given != order.email.lower() and digits(given) != digits(order.phone)):
            return jsonify({}), 404
        return jsonify(status=order.status, delivery=order.delivery_date)
    if body["action"] == "my_orders" and (body.get("customer") or {}).get("verified"):
        return jsonify(orders=recent_orders(body["customer"]["id"], 5))
    return jsonify({}), 404`,
            },
          ]}
        />
      </Section>

      <Section id="security" title="How private data stays private">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <b>No database access.</b> Loudpilot never connects to your database and never receives credentials. The assistant can only ask your endpoint the
            lookups you listed; your code decides what to return.
          </li>
          <li>
            <b>Identity comes from your website, not from the chat.</b> “My orders” lookups get the customer id from your login (verified with{' '}
            <code>user_hash</code>). Whatever the visitor types, the assistant cannot pick another id.
          </li>
          <li>
            <b>Two details for anonymous lookups.</b> Without login, ask for something only the customer knows alongside the number (the e-mail or phone on the
            order) and check both. Answer “not found” for any mismatch.
          </li>
          <li>
            <b>No guessing.</b> Each chat may make at most 15 lookups an hour, and each visitor IP at most 30 messages a minute.
          </li>
          <li>
            <b>Minimum data.</b> Return what the customer needs to read — not addresses, full card numbers or internal notes. Loudpilot logs which lookups ran and
            whether they succeeded, never the data they returned.
          </li>
          <li>
            <b>Signed both ways.</b> Every request to you is signed with your site secret and time-stamped (reject anything older than 5 minutes).
          </li>
          <li>
            <b>Red flags go to people.</b> Refunds, complaints, legal or medical questions — whatever you list — are handed over at once.
          </li>
        </ul>
      </Section>

      <Section id="testing" title="Testing">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <b>Demo shop</b> — <i>Website → Loudpilot Tag → Try it in a demo shop</i> opens a pretend store with your tag: add to cart, pay, leave a contact, sign in
            as a demo customer (<code>user_id</code> <code>loudpilot-demo-customer</code>) and talk to the assistant, even before it is switched on. Its visits are
            marked as tests and stay out of the reports.
          </li>
          <li>
            <b>Test requests</b> — each lookup in <i>Inbox → Assistant</i> has <i>Send a test request</i>: it calls your endpoint exactly as the assistant would
            (with <code>test: true</code>) and shows your answer.
          </li>
          <li>
            <b>Live events</b> — <i>Website → Loudpilot Tag → Latest events</i> shows every event within seconds, and whether it went to Meta.
          </li>
        </ul>
      </Section>

      <Section id="secret" title="Site secret">
        <p>
          Shown to owners and admins in <i>Website → Loudpilot Tag → Site secret</i> (<code>lpsec_…</code>). It signs <code>user_hash</code>, authenticates{' '}
          <a href="#server-events">server-side events</a> and signs Loudpilot’s calls to <a href="#data-endpoint">your endpoint</a>. Keep it in your server’s
          environment (<code>LOUDPILOT_SECRET</code>), never in the page or an app. <i>New secret</i> replaces it at once — update your server at the same time.
        </p>
      </Section>

      <Section id="signatures" title="Signatures">
        <p>
          <code>X-Loudpilot-Signature: t=&lt;unix seconds&gt;,v1=&lt;hex&gt;</code>, where the hex is HMAC-SHA256 of <code>&lt;t&gt;.&lt;raw body&gt;</code> with your
          site secret. Compute it over the raw bytes, before parsing JSON. The same scheme signs server-side events you send us.
        </p>
        <CodeBlock
          tabs={[
            { label: 'Node.js', code: VERIFY_NODE },
            { label: 'PHP', code: VERIFY_PHP },
            { label: 'Python', code: VERIFY_PY },
          ]}
        />
      </Section>

      <Section id="limits" title="Limits">
        <Params
          title="What"
          rows={[
            ['Browser events', '600 / minute per IP', 'Bots and link previews are ignored.'],
            ['Server-side events', '1,200 requests / minute per site', 'Up to 100 events per request.'],
            ['Chat messages', '30 / minute per IP, 20 / minute per chat', 'Up to 2,000 characters each.'],
            ['Data lookups', '15 / hour per chat', '8-second timeout, 100 KB answers.'],
            ['Meta Conversions API', 'within a minute', 'Events older than 7 days are not accepted by Meta.'],
            ['Assistant', '1 credit per conversation', 'Charged on its first answer; a person answering costs nothing.'],
          ]}
        />
        <p>
          Questions or a platform we should cover? <a href={CONTACT}>Write to us</a>.
        </p>
      </Section>
    </DocsShell>
  )
}
