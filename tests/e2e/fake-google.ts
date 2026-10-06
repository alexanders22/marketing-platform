import { createServer, type Server } from 'node:http'

// A tiny stand-in for Google's OAuth, the Analytics Admin/Data APIs and
// Search Console. The dev server talks to it when .env has GOOGLE_AUTH_URL,
// GOOGLE_TOKEN_URL, GA_ADMIN_URL, GA_DATA_URL and SC_URL on
// http://127.0.0.1:18998.

export const FAKE_GOOGLE_PORT = 18998
const SCOPE = 'https://www.googleapis.com/auth/analytics.readonly'

export type GaReportCall = { property: string; dimensions: string[] }

export function startFakeGoogle() {
  let properties = [{ property: 'properties/111', displayName: 'Bloom Bakery website' }]
  // Grants what was asked for, unless a test overrides it.
  let grantScope: string | null = null
  let asked = SCOPE
  let scSites = [
    { siteUrl: 'sc-domain:127.0.0.1', permissionLevel: 'siteOwner' },
    { siteUrl: 'https://other.example/', permissionLevel: 'siteFullUser' },
    { siteUrl: 'https://unverified.example/', permissionLevel: 'siteUnverifiedUser' },
  ]
  const scQueries: { site: string; body: Record<string, unknown> }[] = []
  let failData: { status: number; message: string } | null = null
  const reports: GaReportCall[] = []
  const tokens: Record<string, string>[] = []

  // Two weeks of numbers ending today: 100 + i visits, 2 sign-ups and 1 lead a day.
  const days = (span: number) =>
    Array.from({ length: span }, (_, i) => {
      const d = new Date(Date.now() - (span - 1 - i) * 86_400_000)
      return { ga: d.toISOString().slice(0, 10).replace(/-/g, ''), i }
    })

  const server: Server = createServer(async (req, res) => {
    const url = new URL(req.url!, `http://127.0.0.1:${FAKE_GOOGLE_PORT}`)
    let body = ''
    for await (const chunk of req) body += chunk
    const json = (status: number, data: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end(JSON.stringify(data))
    }

    // Consent screen: approve at once and go back with a code.
    if (url.pathname === '/auth') {
      asked = url.searchParams.get('scope') ?? SCOPE
      const back = new URL(url.searchParams.get('redirect_uri')!)
      back.searchParams.set('code', 'fake-code')
      back.searchParams.set('state', url.searchParams.get('state') ?? '')
      res.writeHead(302, { location: back.toString() })
      return res.end()
    }
    if (url.pathname === '/token') {
      const p = Object.fromEntries(new URLSearchParams(body))
      tokens.push(p)
      return json(200, {
        access_token: `fake-access-${tokens.length}`,
        ...(p.grant_type === 'authorization_code' ? { refresh_token: 'fake-refresh' } : {}),
        expires_in: 3600,
        scope: grantScope ?? asked,
      })
    }
    if (url.pathname === '/admin/accountSummaries') {
      return json(200, { accountSummaries: [{ displayName: 'Bloom Bakery', propertySummaries: properties }] })
    }
    const report = url.pathname.match(/^\/data\/(properties\/\d+):runReport$/)
    if (report) {
      if (failData) return json(failData.status, { error: { message: failData.message } })
      const q = JSON.parse(body) as { dimensions: { name: string }[]; dateRanges: { startDate: string }[] }
      const dims = q.dimensions.map((d) => d.name)
      reports.push({ property: report[1], dimensions: dims })
      const span = Math.min(14, Number(q.dateRanges[0].startDate.replace('daysAgo', '')) + 1)
      const row = (dv: string[], mv: number[]) => ({ dimensionValues: dv.map((value) => ({ value })), metricValues: mv.map((v) => ({ value: String(v) })) })
      const rows = days(span).flatMap(({ ga, i }) => {
        if (dims.length === 1) return [row([ga], [100 + i, 80 + i, 30, 60, 3, 0])]
        if (dims[1] === 'sessionDefaultChannelGroup') return [row([ga, 'Paid Social'], [60 + i, 2]), row([ga, 'Organic Search'], [40, 1])]
        if (dims[1] === 'sessionCampaignName') return [row([ga, 'open-house-week'], [12, 1])]
        return [row([ga, 'sign_up'], [2]), row([ga, 'generate_lead'], [1])]
      })
      return json(200, { rows })
    }
    // Search Console: 28 days of searches for the site.
    if (url.pathname === '/sc/sites') return json(200, { siteEntry: scSites })
    const sc = url.pathname.match(/^\/sc\/sites\/(.+)\/searchAnalytics\/query$/)
    if (sc) {
      const q = JSON.parse(body) as { dimensions: string[]; startDate: string }
      scQueries.push({ site: decodeURIComponent(sc[1]), body: q })
      const dim = q.dimensions[0]
      const r = (key: string, clicks: number, impressions: number, position: number) => ({ keys: [key], clicks, impressions, ctr: impressions ? clicks / impressions : 0, position })
      if (dim === 'query')
        return json(200, {
          rows: [
            r('bloom bakery', 120, 400, 1.2),
            r('fresh bread tbilisi', 9, 600, 7.4),
            r('birthday cake order', 4, 300, 11.8),
            r('croissant near me', 2, 900, 3.1),
            r('bakery jobs', 0, 5, 40),
          ],
        })
      if (dim === 'page') return json(200, { rows: [r('http://127.0.0.1:18996/', 100, 1200, 4), r('http://127.0.0.1:18996/cakes', 30, 800, 8)] })
      // Dates: this period 5 clicks a day, the one before 4.
      const prev = Date.parse(q.startDate) < Date.now() - 40 * 86_400_000
      return json(200, { rows: Array.from({ length: 28 }, (_, i) => r(`d${i}`, prev ? 4 : 5, 100, 6)) })
    }

    json(404, { error: { message: `fake-google: no route ${url.pathname}` } })
  })

  return {
    reports,
    tokens,
    setProperties: (p: { property: string; displayName: string }[]) => (properties = p),
    setScope: (s: string | null) => (grantScope = s),
    setScSites: (s: { siteUrl: string; permissionLevel: string }[]) => (scSites = s),
    scQueries,
    failData: (f: { status: number; message: string } | null) => (failData = f),
    listen: async () => {
      for (let i = 0; i < 300; i++) {
        const ok = await new Promise<boolean>((resolve) => {
          const onError = (e: NodeJS.ErrnoException) => {
            server.off('listening', onListening)
            if (e.code !== 'EADDRINUSE') throw e
            resolve(false)
          }
          const onListening = () => {
            server.off('error', onError)
            resolve(true)
          }
          server.once('error', onError)
          server.once('listening', onListening)
          server.listen(FAKE_GOOGLE_PORT, '127.0.0.1')
        })
        if (ok) return
        await new Promise((r) => setTimeout(r, 200))
      }
      throw new Error('fake-google port busy')
    },
    close: () => new Promise<void>((r) => server.close(() => r())),
  }
}
