import type { Metadata } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { ArrowRight, BookOpen, KeyRound, Webhook, Zap } from 'lucide-react'
import { Logo } from '@/components/landing/Logo'
import { CONTACT } from '@/components/landing/site'
import { COST } from '@/lib/credits'
import { METRICS, RISK_BAND, WINDOWS } from '@/lib/goal-metrics'
import { TOOLS } from '@/lib/mcp/tools'
import { CodeBlock } from './CodeBlock'

export const metadata: Metadata = {
  title: 'API documentation — Khma',
  description: 'Give every customer of your product a marketing module: workspaces, Meta connections, analytics, goals, alerts and webhooks.',
}

const BASE = 'https://khma.brandrepublic.ge/api/v1'

const NAV: { title: string; items: { id: string; label: string }[] }[] = [
  {
    title: 'Get started',
    items: [
      { id: 'introduction', label: 'Introduction' },
      { id: 'quickstart', label: 'Quickstart' },
      { id: 'concepts', label: 'How it fits together' },
      { id: 'authentication', label: 'Authentication' },
      { id: 'errors', label: 'Errors' },
    ],
  },
  {
    title: 'Reference',
    items: [
      { id: 'ping', label: 'Ping' },
      { id: 'workspaces', label: 'Workspaces' },
      { id: 'signup', label: 'Sign up a customer' },
      { id: 'credits', label: 'Credits' },
      { id: 'connect', label: 'Connect Meta' },
      { id: 'channels', label: 'Channels' },
      { id: 'analytics', label: 'Analytics' },
      { id: 'goals', label: 'Goals' },
      { id: 'alerts', label: 'Alerts' },
      { id: 'weekly', label: 'Weekly review' },
    ],
  },
  {
    title: 'Guides',
    items: [
      { id: 'metrics', label: 'Goal metrics' },
      { id: 'mcp', label: 'MCP for AI assistants' },
      { id: 'webhooks', label: 'Webhooks' },
      { id: 'billing', label: 'Credits & revenue share' },
      { id: 'changelog', label: 'Changelog' },
    ],
  },
]

/* ─── Building blocks ──────────────────────────────────────────────────── */

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-zinc-200 py-12 first:border-t-0 first:pt-0">
      <h2 className="text-2xl font-semibold tracking-tight">
        <a href={`#${id}`} className="hover:underline">
          {title}
        </a>
      </h2>
      <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-zinc-700 [&_a]:text-indigo-600 [&_:not(pre)>code]:rounded [&_:not(pre)>code]:bg-zinc-100 [&_:not(pre)>code]:px-1 [&_:not(pre)>code]:py-0.5 [&_:not(pre)>code]:text-[13px] [&_:not(pre)>code]:text-zinc-800">
        {children}
      </div>
    </section>
  )
}

const METHOD: Record<string, string> = {
  GET: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  POST: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  DELETE: 'bg-red-50 text-red-700 ring-red-200',
}

function Endpoint({ method, path, children }: { method: 'GET' | 'POST' | 'DELETE'; path: string; children?: ReactNode }) {
  return (
    <div className="mt-8 first:mt-4">
      <p className="flex flex-wrap items-center gap-2 font-mono text-sm">
        <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ${METHOD[method]}`}>{method}</span>
        <span className="font-medium text-zinc-900">{path}</span>
      </p>
      <div className="mt-3 space-y-3">{children}</div>
    </div>
  )
}

function Params({ rows, title = 'Body' }: { rows: [string, string, string][]; title?: string }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-200">
      <table className="w-full min-w-[520px] text-sm">
        <thead className="bg-zinc-50 text-left text-xs text-zinc-500">
          <tr>
            <th className="px-4 py-2 font-medium">{title}</th>
            <th className="px-4 py-2 font-medium">Type</th>
            <th className="px-4 py-2 font-medium">Description</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {rows.map(([name, type, desc]) => (
            <tr key={name}>
              <td className="px-4 py-2 align-top font-mono text-[13px] text-zinc-900">{name}</td>
              <td className="px-4 py-2 align-top text-xs text-zinc-500">{type}</td>
              <td className="px-4 py-2 align-top text-zinc-700">{desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const curl = (method: string, path: string, body?: object) =>
  [
    `curl${method === 'GET' ? '' : ` -X ${method}`} ${BASE}${path} \\`,
    `  -H "Authorization: Bearer $KHMA_API_KEY"${body ? ' \\' : ''}`,
    ...(body ? ['  -H "Content-Type: application/json" \\', `  -d '${JSON.stringify(body)}'`] : []),
  ].join('\n')

const js = (method: string, path: string, body?: object) =>
  `const res = await fetch('${BASE}${path}', {
  method: '${method}',
  headers: {
    Authorization: \`Bearer \${process.env.KHMA_API_KEY}\`,${body ? "\n    'Content-Type': 'application/json'," : ''}
  },${body ? `\n  body: JSON.stringify(${JSON.stringify(body, null, 2).replace(/\n/g, '\n  ')}),` : ''}
})
const data = await res.json()`

const out = (o: unknown) => JSON.stringify(o, null, 2)

function Example({ method, path, body, response }: { method: 'GET' | 'POST' | 'DELETE'; path: string; body?: object; response: unknown }) {
  return (
    <>
      <CodeBlock
        tabs={[
          { label: 'curl', code: curl(method, path, body) },
          { label: 'JavaScript', code: js(method, path, body) },
        ]}
      />
      <CodeBlock title="Response" tabs={[{ label: 'json', code: out(response) }]} />
    </>
  )
}

/* ─── Page ─────────────────────────────────────────────────────────────── */

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-white text-zinc-900 [color-scheme:light]">
      <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 text-zinc-900 [&_rect:first-child]:fill-zinc-900 [&_rect:not(:first-child)]:fill-white">
            <Logo />
          </Link>
          <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-600">API v1</span>
          <nav className="ml-auto flex items-center gap-4 text-sm">
            <Link href="/" className="hidden text-zinc-600 hover:text-zinc-900 sm:inline">
              Website
            </Link>
            <a href={CONTACT} className="rounded-lg bg-zinc-900 px-3 py-1.5 font-medium text-white hover:bg-zinc-800">
              Get an API key
            </a>
          </nav>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-10 px-4 sm:px-6">
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-56 shrink-0 overflow-y-auto py-8 lg:block">
          {NAV.map((g) => (
            <div key={g.title} className="mb-6">
              <p className="mb-2 text-xs font-semibold tracking-wider text-zinc-400 uppercase">{g.title}</p>
              <ul className="space-y-0.5">
                {g.items.map((i) => (
                  <li key={i.id}>
                    <a href={`#${i.id}`} className="block rounded-md px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900">
                      {i.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </aside>

        <main className="min-w-0 flex-1 py-10 lg:max-w-3xl">
          <details className="mb-8 rounded-xl border border-zinc-200 p-3 text-sm lg:hidden">
            <summary className="cursor-pointer font-medium">On this page</summary>
            <ul className="mt-2 grid grid-cols-2 gap-1">
              {NAV.flatMap((g) => g.items).map((i) => (
                <li key={i.id}>
                  <a href={`#${i.id}`} className="text-indigo-600">
                    {i.label}
                  </a>
                </li>
              ))}
            </ul>
          </details>

          <section id="introduction" className="scroll-mt-24 pb-12">
            <p className="text-sm font-semibold text-indigo-600">Khma Partner API</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight text-balance">Give every customer of your product a marketing module</h1>
            <p className="mt-4 text-lg text-zinc-600">
              Your users already work in your product. With a few calls they get AI content, publishing, ad results, goals and
              alerts — inside your UI, while Khma does the marketing work and the billing.
            </p>
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {[
                { icon: Zap, t: 'Quickstart', d: 'From API key to first numbers in five calls.', h: '#quickstart' },
                { icon: BookOpen, t: 'How it fits together', d: 'Partners, workspaces, accounts and credits.', h: '#concepts' },
                { icon: KeyRound, t: 'Connect Meta', d: 'Let customers connect Facebook, Instagram and ads.', h: '#connect' },
                { icon: Webhook, t: 'Webhooks', d: 'Get alerts pushed to your backend, signed.', h: '#webhooks' },
              ].map((c) => (
                <a key={c.t} href={c.h} className="group rounded-xl border border-zinc-200 p-4 transition hover:border-zinc-300 hover:shadow-sm">
                  <c.icon size={18} className="text-indigo-600" />
                  <p className="mt-2 font-semibold">{c.t}</p>
                  <p className="text-sm text-zinc-500">{c.d}</p>
                </a>
              ))}
            </div>
            <p className="mt-6 text-sm text-zinc-500">
              Base URL <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-zinc-800">{BASE}</code> · JSON in, JSON out · times in ISO 8601 (UTC)
            </p>
          </section>

          <Section id="quickstart" title="Quickstart">
            <p>Five calls from an API key to a customer with connected pages and live numbers.</p>
            <ol className="list-decimal space-y-6 pl-5">
              <li>
                <b>Check your key.</b>
                <CodeBlock tabs={[{ label: 'curl', code: curl('GET', '/ping') }]} />
              </li>
              <li>
                <b>Create a workspace</b> for one of your customers, using your own id for it. Safe to call every time the customer
                opens Marketing in your app.
                <CodeBlock tabs={[{ label: 'curl', code: curl('POST', '/workspaces', { externalId: 'company_42', name: 'Arca Development' }) }]} />
              </li>
              <li>
                <b>Register the customer</b> once — they accept Khma&apos;s terms in your UI and get a credit wallet.
                <CodeBlock
                  tabs={[
                    {
                      label: 'curl',
                      code: curl('POST', '/workspaces/company_42/signup', { name: 'Arca Development LLC', email: 'owner@arca.ge', acceptTerms: true }),
                    },
                  ]}
                />
              </li>
              <li>
                <b>Let them connect Facebook and Instagram.</b> Create a connect link and open it for the customer; they come back to
                your <code>returnUrl</code>.
                <CodeBlock
                  tabs={[{ label: 'curl', code: curl('POST', '/workspaces/company_42/connect-links', { network: 'meta', returnUrl: 'https://app.example.com/marketing' }) }]}
                />
              </li>
              <li>
                <b>Show results</b> in your app.
                <CodeBlock tabs={[{ label: 'curl', code: curl('GET', '/workspaces/company_42/analytics?days=30') }]} />
              </li>
            </ol>
          </Section>

          <Section id="concepts" title="How it fits together">
            <CodeBlock
              title="Model"
              tabs={[
                {
                  label: 'text',
                  code: `Partner (you)  — API key, SINGLE or MULTI mode, revenue share
└── Workspace  — one per customer profile, addressed by YOUR externalId
    ├── Account   — the paying customer: terms accepted, credit wallet
    ├── Channels  — Facebook Pages, Instagram accounts, Meta ad accounts
    ├── Analytics — ad and post results
    └── Goals → Alerts → your webhook`,
                },
              ]}
            />
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <b>Partner</b> — your product. <b>SINGLE</b> partners have one workspace (a company using Khma inside its own
                tools). <b>MULTI</b> partners resell: every company, agent or seller in your product gets its own workspace.
              </li>
              <li>
                <b>Workspace</b> — you always address it by <code>externalId</code>, your own id. You can only ever reach the
                workspaces you created.
              </li>
              <li>
                <b>Account</b> — created by <a href="#signup">signup</a>. The customer pays Khma for credits directly; you earn a
                share of every purchase.
              </li>
              <li>
                <b>Channels</b> — connected by the customer through a <a href="#connect">connect link</a>. Khma uses one verified
                Meta app for everyone, so customers never handle API keys.
              </li>
            </ul>
          </Section>

          <Section id="authentication" title="Authentication">
            <p>
              Send your key as a bearer token on every request. Keys start with <code>khma_</code>, are shown once when we issue
              them and are stored by us only as a hash.
            </p>
            <CodeBlock tabs={[{ label: 'http', code: 'Authorization: Bearer khma_…' }]} />
            <p>
              Call the API from your server only — never from a browser or a mobile app. Need a key, a second key or a rotation?{' '}
              <a href={CONTACT}>Write to us</a>.
            </p>
          </Section>

          <Section id="errors" title="Errors">
            <p>Errors use HTTP status codes and always the same body:</p>
            <CodeBlock tabs={[{ label: 'json', code: out({ error: { code: 'workspace_not_found', message: 'Workspace not found' } }) }]} />
            <Params
              title="code"
              rows={[
                ['unauthorized', '401', 'Missing or invalid API key.'],
                ['partner_suspended', '403', 'Your partner account is suspended.'],
                ['invalid_json', '400', 'The body is not JSON.'],
                ['invalid_request', '400', 'The body does not match the schema; issues lists each problem.'],
                ['invalid_goal / invalid_period', '400', 'A goal or period that does not make sense — see the message.'],
                ['workspace_not_found / goal_not_found', '404', 'Not found, or not yours.'],
                ['single_workspace', '409', 'SINGLE partners can have one workspace only.'],
                ['already_registered / not_registered', '409', 'Signup already done / not done yet.'],
                ['not_configured', '503', 'The feature is not available yet on this server.'],
                ['internal', '500', 'Our fault. Safe to retry with backoff.'],
              ]}
            />
          </Section>

          <Section id="ping" title="Ping">
            <Endpoint method="GET" path="/ping">
              <p>Checks the key and tells you how Khma sees you.</p>
              <Example method="GET" path="/ping" response={{ partner: { name: 'Upla', slug: 'upla', mode: 'MULTI' } }} />
            </Endpoint>
          </Section>

          <Section id="workspaces" title="Workspaces">
            <Endpoint method="POST" path="/workspaces">
              <p>Creates the workspace on the first call, updates its name and locale afterwards. Idempotent.</p>
              <Params
                rows={[
                  ['externalId', 'string, required', 'Your id for this customer profile (max 191 chars).'],
                  ['name', 'string, required', 'Shown in Khma and in emails.'],
                  ['locale', 'string', 'Default content language, e.g. ka, en, ru.'],
                ]}
              />
              <Example
                method="POST"
                path="/workspaces"
                body={{ externalId: 'company_42', name: 'Arca Development', locale: 'ka' }}
                response={{ workspace: { externalId: 'company_42', name: 'Arca Development', locale: 'ka', registered: false, account: null, createdAt: '2026-10-03T09:00:00.000Z' } }}
              />
            </Endpoint>
            <Endpoint method="GET" path="/workspaces">
              <p>Your workspaces, newest first (up to 200).</p>
            </Endpoint>
            <Endpoint method="GET" path="/workspaces/{externalId}">
              <p>One workspace, with its account once registered.</p>
            </Endpoint>
          </Section>

          <Section id="signup" title="Sign up a customer">
            <Endpoint method="POST" path="/workspaces/{externalId}/signup">
              <p>
                Creates the paying account for the workspace. Show Khma&apos;s <Link href="/terms">Terms</Link> and{' '}
                <Link href="/privacy">Privacy Policy</Link> in your UI and send <code>acceptTerms: true</code> only after the
                customer agreed.
              </p>
              <Params
                rows={[
                  ['name', 'string, required', 'Legal or display name of the customer.'],
                  ['email', 'string, required', 'Billing contact of the customer.'],
                  ['country', 'string', 'ISO 3166 code, e.g. GE.'],
                  ['currency', 'string', 'ISO 4217 code for billing, default GEL.'],
                  ['acceptTerms', 'true, required', 'The customer accepted the terms.'],
                ]}
              />
              <Example
                method="POST"
                path="/workspaces/company_42/signup"
                body={{ name: 'Arca Development LLC', email: 'owner@arca.ge', acceptTerms: true }}
                response={{
                  workspace: {
                    externalId: 'company_42',
                    name: 'Arca Development',
                    locale: 'ka',
                    registered: true,
                    account: { name: 'Arca Development LLC', email: 'owner@arca.ge', currency: 'GEL', creditBalance: 0 },
                    createdAt: '2026-10-03T09:00:00.000Z',
                  },
                }}
              />
            </Endpoint>
          </Section>

          <Section id="credits" title="Credits">
            <Endpoint method="GET" path="/workspaces/{externalId}/credits">
              <p>Balance and the last 50 movements, to show the wallet inside your app.</p>
              <Example
                method="GET"
                path="/workspaces/company_42/credits"
                response={{
                  balance: 287,
                  currency: 'GEL',
                  entries: [
                    { amount: -1, reason: 'AI_TEXT', note: 'Post caption', createdAt: '2026-10-03T09:30:00.000Z' },
                    { amount: 300, reason: 'PURCHASE', note: 'Starter plan', createdAt: '2026-10-01T08:00:00.000Z' },
                  ],
                }}
              />
            </Endpoint>
          </Section>

          <Section id="connect" title="Connect Meta">
            <p>
              Customers connect their own Facebook Pages, Instagram professional accounts and Meta ad accounts. They sign in to
              Facebook, pick what to share and land back in your app — they never see a Khma login.
            </p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>Your server creates a connect link (valid for one hour).</li>
              <li>Your app opens it for the customer — a redirect, new tab or popup.</li>
              <li>Facebook asks the customer what to share with Khma.</li>
              <li>
                Khma sends the customer to your <code>returnUrl</code> with the result in the query string.
              </li>
            </ol>
            <Endpoint method="POST" path="/workspaces/{externalId}/connect-links">
              <Params
                rows={[
                  ['network', '"meta", required', 'Facebook, Instagram and Meta Ads in one step.'],
                  ['returnUrl', 'https URL, required', 'Where the customer goes afterwards. Existing query parameters are kept.'],
                ]}
              />
              <Example
                method="POST"
                path="/workspaces/company_42/connect-links"
                body={{ network: 'meta', returnUrl: 'https://app.example.com/marketing' }}
                response={{ url: 'https://khma.brandrepublic.ge/connect/meta?token=…', expiresAt: '2026-10-03T10:00:00.000Z' }}
              />
              <p>Back on your side:</p>
              <Params
                title="Query parameter"
                rows={[
                  ['khma_status', 'connected | error', 'How it went.'],
                  ['khma_accounts', 'number', 'With connected: how many pages, Instagram and ad accounts were saved.'],
                  ['khma_reason', 'string', 'With error: cancelled, expired, nothing_shared, meta_error, not_configured, workspace_not_found.'],
                ]}
              />
              <p>Ad results are read right after connecting and then every hour; post results every 30 minutes.</p>
            </Endpoint>
          </Section>

          <Section id="channels" title="Channels">
            <Endpoint method="GET" path="/workspaces/{externalId}/channels">
              <p>
                What the customer connected. <code>status</code> is <code>active</code>, <code>expired</code> (ask the customer to
                connect again with a new link) or <code>revoked</code>. Tokens never leave Khma.
              </p>
              <Example
                method="GET"
                path="/workspaces/company_42/channels"
                response={{
                  channels: [
                    { id: 'cm1…', network: 'facebook', name: 'Arca Development', handle: null, status: 'active', error: null, connectedAt: '2026-10-03T09:10:00.000Z' },
                    { id: 'cm2…', network: 'instagram', name: 'Arca Development', handle: 'arca.ge', status: 'active', error: null, connectedAt: '2026-10-03T09:10:00.000Z' },
                    { id: 'cm3…', network: 'meta_ads', name: 'Arca Ads', handle: null, status: 'active', error: null, connectedAt: '2026-10-03T09:10:00.000Z' },
                  ],
                }}
              />
            </Endpoint>
          </Section>

          <Section id="analytics" title="Analytics">
            <Endpoint method="GET" path="/workspaces/{externalId}/analytics?days=30">
              <p>
                The numbers behind the Khma dashboard for 7, 30 or 90 days, plus the same-length period before it so you can show
                change. Days follow the ad account&apos;s time zone.
              </p>
              <ul className="list-disc space-y-1 pl-5">
                <li>
                  <code>resultLabel</code> is the main result (Leads, Purchases, Link clicks …); <code>results</code> counts only
                  that kind, never mixed with reach.
                </li>
                <li>
                  <code>current.posts</code>, <code>organicReach</code>, <code>organicViews</code> and <code>engagements</code> cover
                  posts published from Khma.
                </li>
              </ul>
              <Example
                method="GET"
                path="/workspaces/company_42/analytics?days=30"
                response={{
                  period: { days: 30, from: '2026-09-04', to: '2026-10-03', timeZone: 'Asia/Tbilisi' },
                  currency: 'GEL',
                  resultLabel: 'Leads',
                  current: { spend: 900, impressions: 330000, clicks: 2400, results: 120, revenue: 0, posts: 12, organicReach: 18400, organicViews: 25100, engagements: 940 },
                  previous: { spend: 900, impressions: 330000, clicks: 2400, results: 60, revenue: 0, posts: 9, organicReach: 15100, organicViews: 20300, engagements: 710 },
                  daily: [{ date: '2026-10-03', spend: 30, results: 4, organicReach: 650, engagements: 31 }],
                  campaigns: [
                    {
                      id: 'cm9…',
                      name: 'Lead Gen — Tbilisi',
                      status: 'active',
                      objective: 'OUTCOME_LEADS',
                      dailyBudget: 20,
                      lifetimeBudget: null,
                      currency: 'GEL',
                      spend: 600,
                      impressions: 90000,
                      clicks: 1800,
                      results: 120,
                      resultLabel: 'Leads',
                      costPerResult: 5,
                      ctr: 0.02,
                    },
                  ],
                  topPosts: [{ postId: 'cp1…', network: 'instagram', text: 'Pistachio week…', date: '2026-09-28', reach: 2400, engagements: 180, url: 'https://instagram.com/p/…' }],
                }}
              />
            </Endpoint>
          </Section>

          <Section id="goals" title="Goals">
            <p>
              A goal is a target Khma checks every hour, over complete days. Within {Math.round(RISK_BAND * 100)}% on the wrong
              side it is <code>at_risk</code>, beyond that <code>off_track</code>. Each change raises an <a href="#alerts">alert</a>.
            </p>
            <Endpoint method="POST" path="/workspaces/{externalId}/goals">
              <Params
                rows={[
                  ['scope', '"campaign" | "ads" | "posts"', 'One campaign, all ads together, or published posts.'],
                  ['campaignId', 'string', 'With scope campaign: an id from analytics.campaigns.'],
                  ['network', '"facebook" | "instagram"', 'With scope posts; leave out for both.'],
                  ['metric', 'string', 'See the metrics table below.'],
                  ['target', 'number', 'Money in the account currency; percent metrics in percent (1.5 = 1.5%).'],
                  ['atMost', 'boolean', 'Optional. Defaults to true for costs, false for everything else.'],
                  ['windowDays', '1 | 7 | 30', 'Rolling window, default 7.'],
                ]}
              />
              <Example
                method="POST"
                path="/workspaces/company_42/goals"
                body={{ scope: 'campaign', campaignId: 'cm9…', metric: 'cost_per_result', target: 5, windowDays: 7 }}
                response={{
                  goal: { id: 'cg1…', scope: 'campaign', campaignId: 'cm9…', network: null, metric: 'cost_per_result', atMost: true, target: 5, windowDays: 7, active: true, status: 'on_track', actual: 4.2, checkedAt: '2026-10-03T09:15:00.000Z' },
                }}
              />
            </Endpoint>
            <Endpoint method="GET" path="/workspaces/{externalId}/goals">
              <p>All goals with their latest status and actual value.</p>
            </Endpoint>
            <Endpoint method="DELETE" path="/workspaces/{externalId}/goals/{goalId}" />
          </Section>

          <Section id="alerts" title="Alerts">
            <p>Raised when a goal changes status, and for things that need a human:</p>
            <Params
              title="kind"
              rows={[
                ['goal_off_track', 'critical', 'More than 15% past the target.'],
                ['goal_at_risk', 'warning', 'Close to slipping.'],
                ['goal_recovered', 'info', 'Back on target.'],
                ['campaign_rejected', 'critical', 'Meta disapproved a campaign.'],
                ['campaign_issues', 'critical', 'Some ads stopped delivering.'],
                ['account_disconnected', 'critical', 'Khma lost access to a page or ad account — send a new connect link.'],
                ['post_failed', 'warning / critical', 'A post failed on some or all accounts.'],
                ['weekly_review', 'info', 'The Monday review is ready — fetch it from /reviews/latest.'],
              ]}
            />
            <Endpoint method="GET" path="/workspaces/{externalId}/alerts?unread=true">
              <Example
                method="GET"
                path="/workspaces/company_42/alerts?unread=true"
                response={{
                  alerts: [
                    {
                      id: 'ca1…',
                      kind: 'goal_off_track',
                      severity: 'critical',
                      title: 'Cost per result above target — Lead Gen — Tbilisi',
                      body: '₾7.20 for the last 7 days vs target at most ₾5.00 (44% above). Click-through fell 31% — the creative may be tiring. Try a new image or first line.',
                      url: 'https://khma.brandrepublic.ge/app/dashboard/ads/cm9…',
                      createdAt: '2026-10-03T10:00:00.000Z',
                      read: false,
                      goalId: 'cg1…',
                    },
                  ],
                }}
              />
            </Endpoint>
            <Endpoint method="POST" path="/workspaces/{externalId}/alerts/read">
              <p>
                Marks alerts read — the ones in <code>ids</code>, or all unread ones if you send <code>{'{}'}</code>.
              </p>
            </Endpoint>
          </Section>

          <Section id="weekly" title="Weekly review">
            <p>
              Every Monday (from 07:00 in the workspace&apos;s time zone) Khma reviews the last Monday–Sunday: ads, posts, goals and
              alerts against the week before, with the company dossier in mind. You get a <code>weekly_review</code> alert, then fetch
              the review and show its recommendations in your app.
            </p>
            <Params
              title="Recommendation kind"
              rows={[
                ['post', 'applies itself', 'A ready post for the coming week — becomes a Planner draft.'],
                ['repeat', 'applies itself', 'A new take on a recent best post — becomes a Planner draft.'],
                ['goal', 'applies itself', 'A target worth watching — becomes a goal.'],
                ['budget', 'manual', 'Change or move a daily budget; details.steps say how.'],
                ['creative', 'manual', 'Refresh a tired ad with the given headline, text and visual.'],
                ['pause', 'manual', 'Stop a campaign or ad that wastes money.'],
                ['other', 'manual', 'Anything else, with steps.'],
              ]}
            />
            <Endpoint method="GET" path="/workspaces/{externalId}/reviews/latest">
              <Example
                method="GET"
                path="/workspaces/company_42/reviews/latest"
                response={{
                  review: {
                    id: 'cw1…',
                    weekStart: '2026-09-28',
                    weekEnd: '2026-10-04',
                    headline: 'Leads got 30% cheaper after the video ads took over',
                    summary: '…',
                    wins: [{ text: 'Family video ad drove 41 leads at ₾3.40', evidence: '₾140 spend, CTR 2.3%' }],
                    issues: [{ text: 'Only one post this week', evidence: '1 post vs 3 the week before' }],
                    createdAt: '2026-10-05T04:00:00.000Z',
                    recommendations: [
                      {
                        id: 'cr1…',
                        kind: 'post',
                        title: 'Post an evening reel of the park view on Thursday',
                        why: 'Reels reached 1.8× your average; evenings 1.6×.',
                        impact: 'high',
                        status: 'open',
                        details: { post: { date: '2026-10-08', time: '19:00', network: 'INSTAGRAM', format: 'Reel', caption: '…', hashtags: ['arca'], visual: '…' } },
                        appliedRef: null,
                      },
                    ],
                  },
                }}
              />
            </Endpoint>
            <Endpoint method="POST" path="/workspaces/{externalId}/recommendations/{id}/apply">
              <p>
                Posts and goals are created (<code>appliedRef</code> is their id); manual kinds are recorded as done. <code>409</code> if it
                was already handled.
              </p>
            </Endpoint>
            <Endpoint method="POST" path="/workspaces/{externalId}/recommendations/{id}/dismiss" />
          </Section>

          <Section id="metrics" title="Goal metrics">
            <Params
              title="metric"
              rows={METRICS.map((m) => [
                m.id,
                `${m.scopes.map((s) => s.toLowerCase()).join(', ')} · ${m.kind}`,
                `${m.label}. ${m.hint} Default: ${m.atMost ? 'at most' : 'at least'}.`,
              ])}
            />
            <p>
              Windows: {WINDOWS.map((w) => `${w.days} (${w.label.toLowerCase()})`).join(', ')}. Ads are judged on complete days;
              posts once they are a day old. Totals for campaigns that ran only part of the window are compared with a prorated
              target.
            </p>
          </Section>

          <Section id="mcp" title="MCP for AI assistants">
            <p>
              Khma is an MCP server: Claude, ChatGPT, Cursor, VS Code, Codex and other assistants can read results and work in
              Khma for a signed-in user. Server URL <code>https://khma.brandrepublic.ge/api/mcp</code> (Streamable HTTP).
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <b>Sign-in (OAuth 2.1)</b> — apps that support it register themselves, open Khma in the browser, and the user picks
                the company and presses Allow. Discovery at <code>/.well-known/oauth-protected-resource</code>; PKCE (S256) and
                refresh tokens.
              </li>
              <li>
                <b>Personal token</b> — for apps without sign-in, create one in Khma → AI assistants and send it as{' '}
                <code>Authorization: Bearer khma_pat_…</code>.
              </li>
              <li>The assistant acts as that user in one workspace, with the same roles as in the app. Up to 120 calls a minute.</li>
            </ul>
            <CodeBlock
              tabs={[
                { label: 'Claude Code', code: 'claude mcp add --transport http khma https://khma.brandrepublic.ge/api/mcp' },
                { label: 'Cursor', code: JSON.stringify({ mcpServers: { khma: { url: 'https://khma.brandrepublic.ge/api/mcp' } } }, null, 2) },
                {
                  label: 'With a token',
                  code: JSON.stringify({ mcpServers: { khma: { type: 'http', url: 'https://khma.brandrepublic.ge/api/mcp', headers: { Authorization: 'Bearer khma_pat_…' } } } }, null, 2),
                },
              ]}
            />
            <Params title="Tool" rows={TOOLS.map((t) => [t.name, t.readOnly ? 'read' : 'write', t.description])} />
          </Section>

          <Section id="webhooks" title="Webhooks">
            <p>
              Give us an HTTPS endpoint and we send every new alert of your workspaces as it happens, signed with a secret only you
              and Khma know. Answer with any 2xx; otherwise we retry every minute for up to two days.
            </p>
            <CodeBlock
              title="POST your endpoint"
              tabs={[
                {
                  label: 'http',
                  code: `Content-Type: application/json
X-Khma-Timestamp: 1791010000
X-Khma-Signature: sha256=5f1c…

${out({
  type: 'alert.created',
  workspace: { externalId: 'company_42' },
  alert: {
    id: 'ca1…',
    kind: 'goal_off_track',
    severity: 'critical',
    title: 'Cost per result above target — Lead Gen — Tbilisi',
    body: '₾7.20 for the last 7 days vs target at most ₾5.00 (44% above).',
    url: 'https://khma.brandrepublic.ge/app/dashboard/ads/cm9…',
    createdAt: '2026-10-03T10:00:00.000Z',
  },
})}`,
                },
              ]}
            />
            <p>
              Verify every call: the signature is HMAC-SHA256 of <code>{'{timestamp}.{raw body}'}</code> with your webhook
              secret. Reject calls older than five minutes.
            </p>
            <CodeBlock
              tabs={[
                {
                  label: 'Node.js',
                  code: `import { createHmac, timingSafeEqual } from 'node:crypto'

export function verifyKhma(rawBody, headers, secret) {
  const ts = headers['x-khma-timestamp']
  const given = (headers['x-khma-signature'] ?? '').replace('sha256=', '')
  if (!ts || Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false
  const expected = createHmac('sha256', secret).update(\`\${ts}.\${rawBody}\`).digest('hex')
  return given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected))
}`,
                },
                {
                  label: 'PHP',
                  code: `function verify_khma(string $rawBody, string $ts, string $signature, string $secret): bool {
    if (abs(time() - (int) $ts) > 300) return false;
    $expected = 'sha256=' . hash_hmac('sha256', $ts . '.' . $rawBody, $secret);
    return hash_equals($expected, $signature);
}`,
                },
                {
                  label: 'Python',
                  code: `import hmac, hashlib, time

def verify_khma(raw_body: bytes, ts: str, signature: str, secret: str) -> bool:
    if abs(time.time() - int(ts)) > 300:
        return False
    expected = "sha256=" + hmac.new(secret.encode(), f"{ts}.".encode() + raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)`,
                },
              ]}
            />
            <p>
              Alerts are also emailed to the customer&apos;s owners and admins who use Khma directly; for your workspaces the
              webhook is the channel, so you decide how to show them.
            </p>
          </Section>

          <Section id="billing" title="Credits & revenue share">
            <p>
              Customers pay Khma for plans and credit packs; AI actions spend credits and are charged only when the result is
              delivered. You receive your agreed share of every purchase made by customers you brought.
            </p>
            <Params
              title="Action"
              rows={[
                ['Post caption', `${COST.postText} credit`, 'AI-written post with hashtags.'],
                ['Image', `${COST.image} credit`, 'Per generated image.'],
                ['Campaign post', `${COST.campaignPost} credit`, 'Per post in an AI campaign.'],
                ['Blog outline', `${COST.blogOutline} credit`, 'Per article in a series plan.'],
                ['Blog article', `${COST.blogArticle} credits`, 'Full article.'],
                ['Performance summary', `${COST.summary} credit`, 'AI summary of the dashboard.'],
              ]}
            />
            <p>Publishing, analytics, goals, alerts and webhooks do not use credits.</p>
          </Section>

          <Section id="changelog" title="Changelog">
            <ul className="space-y-2">
              <li>
                <b>2026-10-03</b> — MCP server with OAuth sign-in. Weekly review and recommendations. Connect links, channels, analytics, goals, alerts and the{' '}
                <code>alert.created</code> webhook.
              </li>
              <li>
                <b>2026-10-02</b> — Workspaces, signup and credits.
              </li>
            </ul>
            <p>
              Coming next: creating and scheduling posts, AI content and ad plans through the API.{' '}
              <a href={CONTACT}>
                Tell us what you need <ArrowRight size={13} className="inline" />
              </a>
            </p>
          </Section>
        </main>
      </div>
    </div>
  )
}
