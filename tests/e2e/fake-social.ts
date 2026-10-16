import { createServer, type Server } from 'node:http'

// Stand-ins for TikTok, LinkedIn, X, Threads, Pinterest, YouTube (data API;
// Google sign-in is fake-google) and the Telegram Bot API. The dev server
// talks to them when .env points TIKTOK_API_URL, LINKEDIN_API_URL, X_API_URL,
// THREADS_API_URL, PINTEREST_API_URL, YOUTUBE_API_URL and TELEGRAM_API_URL
// (plus the *_AUTH_URL sign-in pages) at http://127.0.0.1:18994.

export const FAKE_SOCIAL_PORT = 18994
const BASE = `http://127.0.0.1:${FAKE_SOCIAL_PORT}`

export type SocialCall = { method: string; path: string; query: Record<string, string>; headers: Record<string, string>; body: unknown; bytes: number }

// Telegram: the platform bot and a company's own bot; channels by username.
const BOTS: Record<string, { id: number; username: string }> = {
  '111:platform-token-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa': { id: 111, username: 'LoudpilotTestBot' },
  '222:own-token-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb': { id: 222, username: 'BloomOwnBot' },
}
const CHANNELS: Record<string, { id: number; title: string; username: string; admins: number[]; canPost: boolean }> = {
  '@bloomnews': { id: -1001234567890, title: 'Bloom News', username: 'bloomnews', admins: [111, 222], canPost: true },
  '@readonlychan': { id: -1009999, title: 'Read Only', username: 'readonlychan', admins: [111], canPost: false },
  '@nobot': { id: -1008888, title: 'No Bot', username: 'nobot', admins: [], canPost: false },
}

export function startFakeSocial() {
  const calls: SocialCall[] = []
  const fetched: { url: string; status: number }[] = []
  let n = 100
  let failNext: { re: RegExp; status: number; body: unknown } | null = null
  // Threads containers become FINISHED on the second status check.
  const checks: Record<string, number> = {}

  const server: Server = createServer(async (req, res) => {
    const url = new URL(req.url!, BASE)
    const chunks: Buffer[] = []
    for await (const c of req) chunks.push(c as Buffer)
    const raw = Buffer.concat(chunks)
    const type = req.headers['content-type'] ?? ''
    let body: unknown = null
    if (type.includes('application/json')) body = raw.length ? JSON.parse(raw.toString()) : null
    else if (type.includes('x-www-form-urlencoded')) body = Object.fromEntries(new URLSearchParams(raw.toString()))
    else if (type.includes('multipart/form-data')) {
      // Field names and small text values; files are summarised.
      const fields: Record<string, string> = {}
      for (const m of raw.toString('latin1').matchAll(/name="([^"]+)"(; filename="[^"]*")?\r\n(?:Content-Type: [^\r]+\r\n)?\r\n([\s\S]*?)\r\n--/g))
        fields[m[1]] = m[2] ? `<file ${m[3].length} bytes>` : m[3]
      body = fields
    }
    const path = url.pathname
    const headers = Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k, String(v)]))
    calls.push({ method: req.method!, path, query: Object.fromEntries(url.searchParams), headers, body, bytes: raw.length })
    const json = (status: number, data: unknown, extra: Record<string, string> = {}) => {
      res.writeHead(status, { 'content-type': 'application/json', ...extra })
      res.end(data === undefined ? '' : JSON.stringify(data))
    }
    const redirect = (to: string) => {
      res.writeHead(302, { location: to })
      res.end()
    }
    const back = (redirectUri: string, state: string) => {
      const b = new URL(redirectUri)
      b.searchParams.set('code', 'fake-code')
      b.searchParams.set('state', state)
      redirect(b.toString())
    }
    const fetchIt = async (u: string) => {
      const r = await fetch(u)
      fetched.push({ url: u, status: r.status })
      return r.ok
    }
    if (failNext && failNext.re.test(path)) {
      const f = failNext
      failNext = null
      return json(f.status, f.body)
    }
    const q = url.searchParams
    const b = (body ?? {}) as Record<string, string>

    /* ─── Telegram ─── */
    const tg = path.match(/^\/telegram\/bot([^/]+)\/(\w+)$/)
    if (tg) {
      const bot = BOTS[tg[1]]
      if (!bot) return json(401, { ok: false, error_code: 401, description: 'Unauthorized' })
      const ok = (result: unknown) => json(200, { ok: true, result })
      const chatOf = (id: unknown) => Object.values(CHANNELS).find((c) => String(c.id) === String(id)) ?? CHANNELS[String(id)]
      const m = tg[2]
      if (m === 'getMe') return ok({ id: bot.id, is_bot: true, first_name: 'Bot', username: bot.username })
      const chat = chatOf(b.chat_id)
      if (!chat || !chat.admins.includes(bot.id)) return json(400, { ok: false, error_code: 400, description: 'Bad Request: chat not found' })
      if (m === 'getChat') return ok({ id: chat.id, type: 'channel', title: chat.title, username: chat.username })
      if (m === 'getChatMember') return ok({ status: 'administrator', can_post_messages: chat.canPost, user: { id: bot.id } })
      if (!chat.canPost) return json(403, { ok: false, error_code: 403, description: 'Forbidden: need administrator rights in the channel chat' })
      if (m === 'sendPhoto' && !(await fetchIt(b.photo))) return json(400, { ok: false, error_code: 400, description: 'Bad Request: wrong file identifier/HTTP URL specified' })
      if (m === 'sendVideo' && typeof b.video === 'string' && b.video.startsWith('http') && !(await fetchIt(b.video)))
        return json(400, { ok: false, error_code: 400, description: 'Bad Request: failed to get HTTP URL content' })
      if (m === 'sendMediaGroup') {
        const media = (body as { media: { media: string }[] }).media
        for (const x of media) await fetchIt(x.media)
        return ok(media.map(() => ({ message_id: ++n })))
      }
      return ok({ message_id: ++n, chat: { id: chat.id } })
    }

    /* ─── TikTok ─── */
    if (path === '/tiktok/auth') return back(q.get('redirect_uri')!, q.get('state')!)
    if (path === '/tiktok/v2/oauth/token/')
      return json(200, { access_token: `tt-access-${++n}`, expires_in: 86400, refresh_token: 'tt-refresh', refresh_expires_in: 31536000, open_id: 'tt-open-1', scope: 'user.info.basic,user.info.profile,video.publish,video.list', token_type: 'Bearer' })
    if (path === '/tiktok/v2/user/info/') return json(200, { data: { user: { open_id: 'tt-open-1', display_name: 'Bloom Bakery', username: 'bloombakery', avatar_url: `${BASE}/a.png` } }, error: { code: 'ok' } })
    if (path === '/tiktok/v2/post/publish/creator_info/query/')
      return json(200, {
        data: { creator_nickname: 'Bloom Bakery', creator_username: 'bloombakery', privacy_level_options: ['PUBLIC_TO_EVERYONE', 'FOLLOWER_OF_CREATOR', 'SELF_ONLY'], comment_disabled: false, duet_disabled: true, stitch_disabled: false, max_video_post_duration_sec: 600 },
        error: { code: 'ok' },
      })
    if (path === '/tiktok/v2/post/publish/video/init/') return json(200, { data: { publish_id: `v_pub_${++n}`, upload_url: `${BASE}/tiktok/upload/${n}` }, error: { code: 'ok' } })
    if (path.startsWith('/tiktok/upload/')) return json(201, {})
    if (path === '/tiktok/v2/post/publish/content/init/') return json(200, { data: { publish_id: `p_pub_${++n}` }, error: { code: 'ok' } })
    if (path === '/tiktok/v2/post/publish/status/fetch/') {
      const priv = (calls.filter((c) => c.path === '/tiktok/v2/post/publish/video/init/').at(-1)?.body as { post_info?: { privacy_level?: string } } | undefined)?.post_info?.privacy_level === 'SELF_ONLY'
      return json(200, { data: { status: 'PUBLISH_COMPLETE', ...(priv ? {} : { publicaly_available_post_id: [7123456789] }) }, error: { code: 'ok' } })
    }
    if (path === '/tiktok/v2/video/query/') return json(200, { data: { videos: [{ id: '7123456789', view_count: 900, like_count: 70, comment_count: 6, share_count: 4 }] }, error: { code: 'ok' } })

    /* ─── LinkedIn ─── */
    if (path === '/linkedin/oauth/authorization') return back(q.get('redirect_uri')!, q.get('state')!)
    if (path === '/linkedin/oauth/accessToken')
      return json(200, { access_token: `li-access-${++n}`, expires_in: 5184000, scope: 'openid,profile,w_member_social,w_organization_social,r_organization_social,rw_organization_admin' })
    if (path === '/linkedin/v2/userinfo') return json(200, { sub: 'li-member-1', name: 'Nino Beridze', picture: `${BASE}/p.png` })
    // Community Management apps have no OpenID: the profile comes from /v2/me.
    if (path === '/linkedin/v2/me') return json(200, { id: 'li-member-1', localizedFirstName: 'Nino', localizedLastName: 'Beridze' })
    if (path === '/linkedin/rest/organizationAcls') return json(200, { elements: [{ role: 'ADMINISTRATOR', organization: 'urn:li:organization:5555', state: 'APPROVED' }], paging: {} })
    if (path === '/linkedin/rest/organizations') return json(200, { results: { '5555': { id: 5555, localizedName: 'Bloom Bakery LLC', vanityName: 'bloom-bakery' } }, statuses: { '5555': 200 } })
    if (path === '/linkedin/rest/images' && q.get('action') === 'initializeUpload') return json(200, { value: { uploadUrl: `${BASE}/linkedin/upload/${++n}`, image: `urn:li:image:IMG${n}` } })
    if (path.startsWith('/linkedin/upload/')) return json(201, {})
    if (path === '/linkedin/rest/posts') {
      res.writeHead(201, { 'x-restli-id': `urn:li:share:${++n}` })
      return res.end()
    }
    if (path === '/linkedin/rest/organizationalEntityShareStatistics')
      return json(200, { elements: [{ totalShareStatistics: { impressionCount: 500, uniqueImpressionsCount: 320, clickCount: 12, likeCount: 30, commentCount: 4, shareCount: 2 } }] })

    /* ─── X ─── */
    if (path === '/x/authorize') return back(q.get('redirect_uri')!, q.get('state')!)
    if (path === '/x/2/oauth2/token') return json(200, { token_type: 'bearer', access_token: `x-access-${++n}`, refresh_token: `x-refresh-${n}`, expires_in: 7200, scope: 'tweet.read tweet.write users.read offline.access media.write' })
    if (path === '/x/2/users/me') return json(200, { data: { id: 'x-user-1', name: 'Bloom Bakery', username: 'bloombakery', profile_image_url: `${BASE}/x.png` } })
    if (path === '/x/2/media/upload') return json(200, { data: { id: `xm${++n}`, media_key: `3_${n}` } })
    if (path === '/x/2/tweets' && req.method === 'POST') return json(201, { data: { id: `${++n}000`, text: (body as { text: string }).text } })
    if (path.startsWith('/x/2/tweets/')) return json(200, { data: { id: path.split('/').pop(), public_metrics: { impression_count: 1200, like_count: 40, reply_count: 5, retweet_count: 3, quote_count: 1, bookmark_count: 2 } } })

    /* ─── Threads ─── */
    if (path === '/threads/authorize') return back(q.get('redirect_uri')!, q.get('state')!)
    if (path === '/threads/oauth/access_token') return json(200, { access_token: 'th-short', token_type: 'bearer', user_id: 'th-user-1' })
    if (path === '/threads/access_token') return json(200, { access_token: `th-long-${++n}`, token_type: 'bearer', expires_in: 5184000 })
    if (path === '/threads/refresh_access_token') return json(200, { access_token: `th-long-${++n}`, token_type: 'bearer', expires_in: 5184000 })
    if (path === '/threads/v1.0/me') return json(200, { id: 'th-user-1', username: 'bloombakery', name: 'Bloom Bakery' })
    if (path === '/threads/v1.0/th-user-1/threads') {
      if (b.image_url && !(await fetchIt(b.image_url))) return json(400, { error: { message: 'Image could not be fetched', code: 9004 } })
      return json(200, { id: `thc${++n}` })
    }
    if (path === '/threads/v1.0/th-user-1/threads_publish') return json(200, { id: `thm${++n}` })
    const thc = path.match(/^\/threads\/v1\.0\/(thc\d+)$/)
    if (thc) {
      checks[thc[1]] = (checks[thc[1]] ?? 0) + 1
      return json(200, { status: checks[thc[1]] >= 2 ? 'FINISHED' : 'IN_PROGRESS', id: thc[1] })
    }
    if (/^\/threads\/v1\.0\/thm\d+$/.test(path)) return json(200, { permalink: `https://www.threads.net/@bloombakery/post/${path.split('/').pop()}` })
    if (/^\/threads\/v1\.0\/thm\d+\/insights$/.test(path))
      return json(200, { data: ['views:300', 'likes:25', 'replies:3', 'reposts:2', 'quotes:1', 'shares:1'].map((x) => ({ name: x.split(':')[0], period: 'lifetime', values: [{ value: Number(x.split(':')[1]) }] })) })

    /* ─── Pinterest ─── */
    if (path === '/pinterest/oauth/') return back(q.get('redirect_uri')!, q.get('state')!)
    if (path === '/pinterest/oauth/token') return json(200, { access_token: `pina-${++n}`, refresh_token: 'pinr-1', token_type: 'bearer', expires_in: 2592000, refresh_token_expires_in: 5184000, scope: 'user_accounts:read,boards:read,boards:write,pins:read,pins:write' })
    if (path === '/pinterest/user_account') return json(200, { username: 'bloombakery', business_name: 'Bloom Bakery', profile_image: `${BASE}/pin.png`, account_type: 'BUSINESS' })
    if (path === '/pinterest/boards') return json(200, { items: [{ id: 'b1', name: 'Cakes' }, { id: 'b2', name: 'Bread' }], bookmark: null })
    if (path === '/pinterest/pins' && req.method === 'POST') {
      const src = (body as { media_source: { url?: string } }).media_source
      if (src.url && !(await fetchIt(src.url))) return json(400, { code: 1, message: 'Image could not be fetched' })
      return json(201, { id: `${++n}9` })
    }
    if (/^\/pinterest\/pins\/\d+\/analytics$/.test(path)) return json(200, { all: { summary_metrics: { IMPRESSION: 800, SAVE: 15, PIN_CLICK: 9, OUTBOUND_CLICK: 4 } } })

    /* ─── YouTube ─── */
    if (path === '/youtube/youtube/v3/channels') return json(200, { items: [{ id: 'UC-bloom', snippet: { title: 'Bloom Bakery', customUrl: '@bloombakery', thumbnails: { default: { url: `${BASE}/yt.png` } } } }] })
    if (path === '/youtube/upload/youtube/v3/videos') return json(200, {}, { location: `${BASE}/youtube/session/${++n}` })
    if (path.startsWith('/youtube/session/')) return json(201, { id: `yt${n}vid` })
    if (path === '/youtube/youtube/v3/videos') return json(200, { items: [{ statistics: { viewCount: '1500', likeCount: '80', commentCount: '9' } }] })

    json(404, { error: { message: `fake-social: no route ${req.method} ${path}` } })
  })

  return {
    calls,
    fetched,
    failNext: (re: RegExp, status: number, body: unknown) => (failNext = { re, status, body }),
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
          server.listen(FAKE_SOCIAL_PORT, '127.0.0.1')
        })
        if (ok) return
        await new Promise((r) => setTimeout(r, 500))
      }
      throw new Error('fake-social port busy')
    },
    close: () => new Promise<void>((r) => server.close(() => r())),
  }
}
