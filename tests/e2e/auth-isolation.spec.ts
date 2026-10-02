import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { newAccount, sql } from './helpers'

// QA: multi-tenant isolation. Account B must never see or change account A's
// resources — neither through pages nor by calling server actions with A's ids.

const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)
const NOW = `(now() at time zone 'utc')`
const THEME = '{"background":"#111111","text":"#ffffff","button":"#ffffff","buttonText":"#111111","buttonStyle":"filled","rounded":"md"}'
const rnd = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`

const wsOf = (email: string) =>
  sql(
    `select w.id from "Workspace" w join "AccountMember" m on m."accountId"=w."accountId" join "User" u on u.id=m."userId" where u.email='${email}'`,
  )

type Seeded = { ws: string; post: string; blog: string; campaign: string; design: string; bio: string; bioSlug: string; media: string }

function seed(ws: string, tag: string, media: string): Seeded {
  const s = rnd()
  const ids = { post: `qaauthpost${s}`, blog: `qaauthblog${s}`, campaign: `qaauthcamp${s}`, design: `qaauthdes${s}`, bio: `qaauthbio${s}`, bioSlug: `qa-auth-${tag.toLowerCase()}-${s}` }
  sql(
    `insert into "Post"(id,"workspaceId",kind,status,content,hashtags,"mediaIds",channels,"aiGenerated","createdAt","updatedAt") values ('${ids.post}','${ws}','SOCIAL','DRAFT','${tag}-SECRET-POST','{}','{${media}}','{}',false,${NOW},${NOW})`,
  )
  sql(
    `insert into "Post"(id,"workspaceId",kind,status,title,content,hashtags,"mediaIds",channels,"aiGenerated","createdAt","updatedAt") values ('${ids.blog}','${ws}','BLOG','DRAFT','${tag}-SECRET-BLOG','${tag}-SECRET-BLOG-BODY','{}','{}','{}',false,${NOW},${NOW})`,
  )
  sql(
    `insert into "Campaign"(id,"workspaceId",kind,name,brief,"startsOn","endsOn","postsPerWeek",tone,language,status,"createdAt","updatedAt") values ('${ids.campaign}','${ws}','SOCIAL','${tag}-SECRET-CAMPAIGN','${tag} secret brief',${NOW},${NOW},1,'Professional','English','ACTIVE',${NOW},${NOW})`,
  )
  sql(
    `insert into "Design"(id,"workspaceId",name,width,height,data,"createdAt","updatedAt") values ('${ids.design}','${ws}','${tag}-SECRET-DESIGN',1080,1080,'{"background":"#ffffff","layers":[]}',${NOW},${NOW})`,
  )
  sql(
    `insert into "BioPage"(id,"workspaceId",slug,title,bio,"avatarMediaId",theme,blocks,published,"createdAt","updatedAt") values ('${ids.bio}','${ws}','${ids.bioSlug}','${tag}-SECRET-BIO','',${media ? `'${media}'` : 'null'},'${THEME}','[]',${tag === 'A'},${NOW},${NOW})`,
  )
  return { ws, media, ...ids }
}

async function uploadImage(page: Page, ws: string) {
  await page.goto('/app/posts/new')
  await page.getByRole('button', { name: 'Add images' }).click()
  await page.locator('input[type=file]').setInputFiles({ name: 'qa.png', mimeType: 'image/png', buffer: PNG_1x1 })
  await expect.poll(() => sql(`select count(*) from "Media" where "workspaceId"='${ws}'`)).toBe('1')
  return sql(`select id from "Media" where "workspaceId"='${ws}'`)
}

type Action = { id: string; path: string; body: string }

async function capture(page: Page, trigger: () => Promise<unknown>): Promise<Action> {
  const req = page.waitForRequest((r) => r.method() === 'POST' && !!r.headers()['next-action'])
  await trigger()
  const r = await req
  return { id: r.headers()['next-action'], path: new URL(r.url()).pathname, body: r.postData() ?? '' }
}

// Calls a server action from inside the signed-in page with arbitrary args.
async function call(page: Page, a: Action, args: unknown[]) {
  return page.evaluate(
    async ({ id, path, body }) => {
      const r = await fetch(path, {
        method: 'POST',
        headers: { 'Next-Action': id, 'Content-Type': 'text/plain;charset=UTF-8', Accept: 'text/x-component' },
        body,
      })
      return `${r.status}\n${await r.text()}`
    },
    { id: a.id, path: a.path, body: JSON.stringify(args) },
  )
}

let ctxA: BrowserContext, ctxB: BrowserContext, pageA: Page, pageB: Page
let A: Seeded, B: Seeded

test.describe.serial('isolation between accounts', () => {
  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    test.setTimeout(240_000)
    ctxA = await browser.newContext()
    ctxB = await browser.newContext()
    pageA = await ctxA.newPage()
    pageB = await ctxB.newPage()
    const a = await newAccount(pageA, 'qa-auth-isoa')
    const b = await newAccount(pageB, 'qa-auth-isob')
    const wsA = wsOf(a.email)
    const wsB = wsOf(b.email)
    expect(wsA).not.toBe(wsB)
    const mediaA = await uploadImage(pageA, wsA)
    const mediaB = await uploadImage(pageB, wsB)
    A = seed(wsA, 'A', mediaA)
    B = seed(wsB, 'B', mediaB)
  })

  test.afterAll(async () => {
    await ctxA?.close()
    await ctxB?.close()
  })

  test('owner can open own resources (positive control)', async () => {
    for (const [path, text] of [
      [`/app/posts/${A.post}`, 'A-SECRET-POST'],
      [`/app/blog/${A.blog}`, 'A-SECRET-BLOG'],
      [`/app/campaigns/${A.campaign}`, 'A-SECRET-CAMPAIGN'],
      [`/app/studio/${A.design}`, 'A-SECRET-DESIGN'],
      [`/app/bio/${A.bio}`, 'A-SECRET-BIO'],
    ]) {
      const res = await pageA.goto(path)
      expect(res?.status(), path).toBe(200)
      expect(await pageA.content(), path).toContain(text)
    }
    const m = await pageA.request.get(`/media/${A.media}`)
    expect(m.status()).toBe(200)
    expect(m.headers()['content-type']).toMatch(/^image\//)
  })

  test("B gets 404 for A's pages and media", async () => {
    for (const path of [
      `/app/posts/${A.post}`,
      `/app/blog/${A.blog}`,
      `/app/posts/${A.blog}`,
      `/app/blog/${A.post}`,
      `/app/campaigns/${A.campaign}`,
      `/app/studio/${A.design}`,
      `/app/bio/${A.bio}`,
    ]) {
      const res = await pageB.goto(path)
      expect(res?.status(), path).toBe(404)
      expect(await pageB.content(), path).not.toContain('A-SECRET')
    }
    expect((await pageB.request.get(`/media/${A.media}`)).status()).toBe(404)
    // Anonymous.
    expect((await pageB.request.get(`/media/${A.media}`, { headers: { cookie: '' } })).status()).toBe(404)
    const anon = await pageB.context().browser()!.newContext()
    expect((await anon.request.get(`http://localhost:3100/media/${A.media}`)).status()).toBe(404)
    await anon.close()
    // Lists don't leak either.
    for (const path of ['/app/planner?view=list', '/app/campaigns', '/app/studio', '/app/bio', '/app/credits']) {
      await pageB.goto(path)
      expect(await pageB.content(), path).not.toContain('A-SECRET')
    }
  })

  test('public bio page and its avatar are reachable only when published', async () => {
    const anon = await pageB.context().browser()!.newContext()
    const p = await anon.newPage()
    expect((await p.goto(`/b/${A.bioSlug}`))?.status()).toBe(200)
    expect((await p.request.get(`/b/${A.bioSlug}/avatar`)).status()).toBe(200)
    expect((await p.goto(`/b/${B.bioSlug}`))?.status()).toBe(404) // B's is unpublished
    expect((await p.request.get(`/b/${B.bioSlug}/avatar`)).status()).toBe(404)
    await anon.close()
  })

  test("server actions called by B with A's ids change nothing", async () => {
    pageB.on('dialog', (d) => d.accept())

    // posts: savePost / deletePost
    await pageB.goto(`/app/posts/${B.post}`)
    const savePost = await capture(pageB, () => pageB.getByRole('button', { name: /Save draft|Save to planner/ }).click())
    const postArgs = { id: A.post, kind: 'SOCIAL', content: 'HACKED-BY-B', hashtags: [], mediaIds: [], channels: [], scheduledAt: null }
    expect(await call(pageB, savePost, [postArgs])).toContain('Post not found')
    expect(await call(pageB, savePost, [{ ...postArgs, id: A.blog, kind: 'BLOG', title: 'x' }])).toContain('Post not found')
    // Attaching A's media to B's own post.
    expect(await call(pageB, savePost, [{ ...postArgs, id: B.post, mediaIds: [A.media] }])).toContain('Some images are not available')
    // Creating a new post with A's media.
    const { id: _omit, ...noId } = postArgs
    void _omit
    expect(await call(pageB, savePost, [{ ...noId, mediaIds: [A.media] }])).toContain('Some images are not available')

    const deletePost = await capture(pageB, () => pageB.getByRole('button', { name: 'Delete' }).click())
    await call(pageB, deletePost, [A.post])
    await call(pageB, deletePost, [A.blog])

    // bio: saveBioPage / deleteBioPage
    await pageB.goto(`/app/bio/${B.bio}`)
    const saveBio = await capture(pageB, () => pageB.getByRole('button', { name: 'Save', exact: true }).click())
    const bioArgs = { id: A.bio, slug: `${A.bioSlug}`, title: 'HACKED', bio: '', avatarMediaId: null, theme: JSON.parse(THEME), blocks: [], published: true }
    expect(await call(pageB, saveBio, [bioArgs])).toContain('Page not found')
    // Taking over A's slug from B's own page.
    expect(await call(pageB, saveBio, [{ ...bioArgs, id: B.bio }])).toContain('This address is already taken')
    // A's media as B's avatar (would be served publicly via /b/{slug}/avatar).
    expect(await call(pageB, saveBio, [{ ...bioArgs, id: B.bio, slug: B.bioSlug, avatarMediaId: A.media }])).toContain('Avatar image not found')
    const deleteBio = await capture(pageB, () => pageB.getByRole('button', { name: 'Delete page' }).click())
    await call(pageB, deleteBio, [A.bio])

    // studio: saveDesign / duplicateDesign / deleteDesign
    await pageB.goto(`/app/studio/${B.design}`)
    const saveDesign = await capture(pageB, () => pageB.getByLabel('Design name').fill('B renamed'))
    const doc = { background: '#ffffff', layers: [] as unknown[] }
    expect(await call(pageB, saveDesign, [{ id: A.design, name: 'HACKED', width: 1080, height: 1080, data: doc }])).toContain('Design not found')
    const imgLayer = { id: 'l1', name: 'img', x: 0, y: 0, w: 10, h: 10, rotation: 0, type: 'image', mediaId: A.media, src: `/media/${A.media}`, fit: 'cover', radius: 0, opacity: 1 }
    expect(
      await call(pageB, saveDesign, [{ id: B.design, name: 'B', width: 1080, height: 1080, data: { ...doc, layers: [imgLayer] } }]),
    ).toContain('Some images are not available')

    await pageB.goto('/app/studio')
    const card = pageB.locator('div.group', { hasText: 'B renamed' })
    await card.hover()
    const dup = await capture(pageB, () => card.getByRole('button', { name: 'Duplicate' }).click())
    expect(await call(pageB, dup, [A.design])).toContain('Design not found')
    await pageB.reload()
    const card2 = pageB.locator('div.group', { hasText: 'B renamed' }).first()
    await card2.hover()
    const delDesign = await capture(pageB, () => card2.getByRole('button', { name: 'Delete' }).click())
    await call(pageB, delDesign, [A.design])

    // campaigns: deleteCampaign
    await pageB.goto(`/app/campaigns/${B.campaign}`)
    const delCampaign = await capture(pageB, () => pageB.getByRole('button', { name: 'Delete' }).first().click())
    expect(await call(pageB, delCampaign, [A.campaign, true])).toContain('Campaign not found')

    // A's data is untouched.
    expect(sql(`select content from "Post" where id='${A.post}'`)).toBe('A-SECRET-POST')
    expect(sql(`select title from "Post" where id='${A.blog}'`)).toBe('A-SECRET-BLOG')
    expect(sql(`select title||'|'||published from "BioPage" where id='${A.bio}'`)).toBe('A-SECRET-BIO|true')
    expect(sql(`select name from "Design" where id='${A.design}'`)).toBe('A-SECRET-DESIGN')
    expect(sql(`select count(*) from "Design" where "workspaceId"='${B.ws}' and name like 'A-SECRET%'`)).toBe('0')
    expect(sql(`select name from "Campaign" where id='${A.campaign}'`)).toBe('A-SECRET-CAMPAIGN')
    expect(sql(`select count(*) from "Post" where "workspaceId"='${A.ws}'`)).toBe('2')
    // B's own actions really did run (the capture targets were B's rows).
    expect(sql(`select count(*) from "Post" where id='${B.post}'`)).toBe('0')
    expect(sql(`select count(*) from "Campaign" where id='${B.campaign}'`)).toBe('0')
  })

  test('server actions without a session are refused', async ({ browser }) => {
    // Reuse an action id captured on a page B can load, from an anonymous context.
    await pageB.goto('/app/brand')
    const saveBrand = await capture(pageB, () => pageB.getByRole('button', { name: 'Save changes' }).click())
    const anon = await browser.newContext()
    const p = await anon.newPage()
    await p.goto('/login')
    const out = await call(p, saveBrand, [{ name: 'ANON', website: '', description: '', logoUrl: '', colors: [], socialLinks: [] }])
    expect(out).not.toContain('"error"')
    expect(sql(`select count(*) from "Workspace" where name='ANON'`)).toBe('0')
    await anon.close()
  })
})
