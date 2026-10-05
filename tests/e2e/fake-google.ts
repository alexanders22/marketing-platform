import { createServer, type Server } from 'node:http'

// A tiny stand-in for Google's OAuth and the Analytics Admin/Data APIs. The
// dev server talks to it when .env has GOOGLE_AUTH_URL, GOOGLE_TOKEN_URL,
// GA_ADMIN_URL and GA_DATA_URL on http://127.0.0.1:18998.

export const FAKE_GOOGLE_PORT = 18998
const SCOPE = 'https://www.googleapis.com/auth/analytics.readonly'

export type GaReportCall = { property: string; dimensions: string[] }

export function startFakeGoogle() {
  let properties = [{ property: 'properties/111', displayName: 'Bloom Bakery website' }]
  let grantScope = SCOPE
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
        scope: grantScope,
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
        return [row([ga, 'sign_up'], [2]), row([ga, 'generate_lead'], [1])]
      })
      return json(200, { rows })
    }
    json(404, { error: { message: `fake-google: no route ${url.pathname}` } })
  })

  return {
    reports,
    tokens,
    setProperties: (p: { property: string; displayName: string }[]) => (properties = p),
    setScope: (s: string) => (grantScope = s),
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
