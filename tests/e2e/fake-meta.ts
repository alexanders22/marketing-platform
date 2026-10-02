import { createHmac } from 'node:crypto'
import { createServer, type Server } from 'node:http'

// A tiny stand-in for the Graph API and the OAuth dialog. The dev server
// talks to it when .env has META_GRAPH_URL=http://127.0.0.1:18999 and
// META_DIALOG_URL=http://127.0.0.1:18999/dialog/oauth.

export const FAKE_META_PORT = 18999
export const FAKE_META_SECRET = 'test-secret'

export type Call = { method: string; path: string; params: Record<string, string> }

export function startFakeMeta() {
  const calls: Call[] = []
  const fetchedImages: { url: string; status: number; type: string | null }[] = []
  let failNextPublish: { code: number; message: string } | null = null
  let n = 0

  const server: Server = createServer(async (req, res) => {
    const url = new URL(req.url!, `http://127.0.0.1:${FAKE_META_PORT}`)
    let body = ''
    for await (const chunk of req) body += chunk
    const params = Object.fromEntries(new URLSearchParams(req.method === 'GET' ? url.search : body))
    const path = url.pathname.replace(/^\/v\d+\.\d+\//, '/')
    calls.push({ method: req.method!, path, params })
    const json = (status: number, data: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end(JSON.stringify(data))
    }

    if (path === '/dialog/oauth') {
      const back = new URL(params.redirect_uri)
      back.searchParams.set('code', 'fake-code')
      back.searchParams.set('state', params.state)
      res.writeHead(302, { location: back.toString() })
      return res.end()
    }

    // Every token call must carry a correct appsecret_proof.
    if (params.access_token) {
      const proof = createHmac('sha256', FAKE_META_SECRET).update(params.access_token).digest('hex')
      if (params.appsecret_proof !== proof) return json(400, { error: { message: 'Invalid appsecret_proof', code: 100 } })
    }

    const publishing = req.method === 'POST' && /\/(feed|photos|media_publish)$/.test(path)
    if (publishing && failNextPublish) {
      const e = failNextPublish
      failNextPublish = null
      return json(400, { error: { message: e.message, code: e.code } })
    }

    // Networks fetch images themselves: do the same with the signed URL.
    const imageUrl = params.image_url ?? (path.endsWith('/photos') ? params.url : undefined)
    if (imageUrl) {
      const r = await fetch(imageUrl)
      fetchedImages.push({ url: imageUrl, status: r.status, type: r.headers.get('content-type') })
      if (!r.ok) return json(400, { error: { message: 'Image could not be fetched', code: 9004 } })
    }

    if (path === '/oauth/access_token') {
      if (params.code) return json(200, { access_token: 'short-user-token' })
      return json(200, { access_token: 'long-user-token', expires_in: 5_184_000 })
    }
    if (path === '/me') return json(200, { id: 'meta-user-1', name: 'Test Person' })
    if (path === '/me/permissions')
      return json(200, {
        data: ['pages_show_list', 'pages_manage_posts', 'instagram_content_publish', 'ads_read'].map((permission) => ({ permission, status: 'granted' })),
      })
    if (path === '/me/accounts')
      return json(200, {
        data: [
          {
            id: 'page-1',
            name: 'Bloom Bakery',
            access_token: 'page-token-1',
            instagram_business_account: { id: 'ig-1', username: 'bloombakery', name: 'Bloom Bakery' },
          },
        ],
      })
    if (path === '/me/adaccounts')
      return json(200, { data: [{ id: 'act_1', name: 'Bloom Ads', account_status: 1, currency: 'GEL', timezone_name: 'Asia/Tbilisi' }] })

    if (req.method === 'POST' && path === '/page-1/feed') return json(200, { id: `page-1_${++n}` })
    if (req.method === 'POST' && path === '/page-1/photos')
      return json(200, params.published === 'false' ? { id: `photo-${++n}` } : { id: `photo-${++n}`, post_id: `page-1_${n}` })
    if (req.method === 'POST' && path === '/ig-1/media') return json(200, { id: `container-${++n}` })
    if (req.method === 'POST' && path === '/ig-1/media_publish') return json(200, { id: `igmedia-${++n}` })

    if (/\/insights$/.test(path)) {
      if (path.startsWith('/igmedia'))
        return json(200, {
          data: [
            { name: 'reach', values: [{ value: 420 }] },
            { name: 'views', values: [{ value: 610 }] },
            { name: 'likes', values: [{ value: 37 }] },
            { name: 'comments', values: [{ value: 5 }] },
            { name: 'shares', values: [{ value: 2 }] },
            { name: 'saved', values: [{ value: 9 }] },
            { name: 'total_interactions', values: [{ value: 53 }] },
          ],
        })
      return json(200, {
        data: [
          { name: 'post_total_media_view_unique', values: [{ value: 1200 }] },
          { name: 'post_media_view', values: [{ value: 1500 }] },
        ],
      })
    }
    if (req.method === 'GET' && params.fields?.includes('status_code')) return json(200, { status_code: 'FINISHED' })
    if (req.method === 'GET' && params.fields === 'permalink_url') return json(200, { permalink_url: `https://facebook.test${path}` })
    if (req.method === 'GET' && params.fields === 'permalink') return json(200, { permalink: `https://instagram.test${path}` })
    if (req.method === 'GET' && params.fields?.startsWith('comments'))
      return json(200, { comments: { summary: { total_count: 4 } }, shares: { count: 3 }, reactions: { summary: { total_count: 25 } } })

    json(404, { error: { message: `fake-meta: no route ${req.method} ${path}`, code: 803 } })
  })

  return {
    calls,
    fetchedImages,
    failNextPublish: (code: number, message: string) => (failNextPublish = { code, message }),
    listen: () => new Promise<void>((r) => server.listen(FAKE_META_PORT, '127.0.0.1', () => r())),
    close: () => new Promise<void>((r) => server.close(() => r())),
  }
}

// Meta's signed_request: base64url(HMAC-SHA256(payload)) + "." + payload.
export function signedRequest(data: object, secret = FAKE_META_SECRET) {
  const payload = Buffer.from(JSON.stringify({ algorithm: 'HMAC-SHA256', issued_at: Math.floor(Date.now() / 1000), ...data })).toString('base64url')
  return `${createHmac('sha256', secret).update(payload).digest('base64url')}.${payload}`
}
