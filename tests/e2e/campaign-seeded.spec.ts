import { expect, test, type Browser, type Page } from '@playwright/test'
import { newAccount, sql, onceAppDialog } from './helpers'

// Campaign behaviour on campaigns/posts written straight into the DB, so no AI
// generation is needed: ordering, editor round-trips, deletes, isolation, time zones.

const accountOf = (email: string) =>
  sql(`select m."accountId" from "AccountMember" m join "User" u on u.id=m."userId" where u.email='${email}'`)
const workspaceOf = (email: string) =>
  sql(`select w.id from "Workspace" w join "AccountMember" m on m."accountId"=w."accountId" join "User" u on u.id=m."userId" where u.email='${email}' order by w."createdAt" limit 1`)

let seq = 0
const newId = () => `qacamp${String(Date.now()).slice(-10)}${String(++seq).padStart(4, '0')}x` // fixed length

type SeedPost = { at: string; title: string; content?: string; outline?: string; channels?: string[] }
function seedCampaign(ws: string, kind: 'SOCIAL' | 'BLOG', name: string, posts: SeedPost[]) {
  const id = newId()
  const times = posts.map((p) => p.at).sort()
  sql(
    `insert into "Campaign" (id,"workspaceId",kind,name,brief,"startsOn","endsOn","postsPerWeek",tone,language,status,"updatedAt") values ` +
      `('${id}','${ws}','${kind}','${name}','Seeded brief for ${name}','${times[0]}','${times[times.length - 1]}',3,'Friendly','English','ACTIVE',now())`,
  )
  const postIds = posts.map((p) => {
    const pid = newId()
    const content = p.content ?? (kind === 'SOCIAL' ? `Caption for ${p.title}` : '')
    const outline = p.outline ? `'${p.outline}'` : 'null'
    sql(
      `insert into "Post" (id,"workspaceId","campaignId",kind,title,outline,content,hashtags,"mediaIds",channels,"scheduledAt","aiGenerated","updatedAt") values ` +
        `('${pid}','${ws}','${id}','${kind}','${p.title}',${outline},'${content}','{qa}','{}','{${(p.channels ?? (kind === 'SOCIAL' ? ['FACEBOOK', 'LINKEDIN'] : [])).join(',')}}','${p.at}',true,now())`,
    )
    return pid
  })
  return { id, postIds }
}

function watch(page: Page) {
  const problems: string[] = []
  page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text().slice(0, 400)}`))
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message.slice(0, 400)}`))
  page.on('response', (r) => r.status() >= 500 && problems.push(`${r.status()} ${r.url()}`))
  return problems
}

const items = (page: Page) => page.locator('ol > li')

test.describe('Asia/Tbilisi (same zone as the dev server)', () => {
  test.use({ timezoneId: 'Asia/Tbilisi' })

  test('campaign page lists posts in date order with time, channels and Edit links', async ({ page }) => {
    const problems = watch(page)
    const { email } = await newAccount(page, 'qa-camp')
    const ws = workspaceOf(email)
    // Inserted out of order on purpose.
    const c = seedCampaign(ws, 'SOCIAL', 'QA Order', [
      { at: '2026-11-06 05:30:00', title: 'Third angle' },
      { at: '2026-11-02 05:30:00', title: 'First angle' },
      { at: '2026-11-04 05:30:00', title: 'Second angle' },
    ])
    await page.goto(`/app/campaigns/${c.id}`)
    await expect(page.getByRole('heading', { name: 'QA Order' })).toBeVisible()
    await expect(page.getByText(/3 posts · Friendly · English/)).toBeVisible()
    await expect(items(page)).toHaveCount(3)
    const texts = await items(page).allInnerTexts()
    expect(texts[0]).toMatch(/Mon 2 Nov[\s\S]*09:30[\s\S]*#1[\s\S]*First angle/)
    expect(texts[1]).toMatch(/Wed 4 Nov[\s\S]*09:30[\s\S]*#2[\s\S]*Second angle/)
    expect(texts[2]).toMatch(/Fri 6 Nov[\s\S]*09:30[\s\S]*#3[\s\S]*Third angle/)
    await expect(items(page).first().getByRole('link', { name: 'Edit' })).toHaveAttribute('href', `/app/posts/${c.postIds[1]}`)
    await expect(items(page).first().getByRole('button', { name: /Rewrite/ })).toBeVisible()

    await page.goto('/app/campaigns')
    const card = page.getByRole('link', { name: /QA Order/ })
    await expect(card).toContainText('2 Nov – 6 Nov · 3 posts')
    await expect(card).toContainText('Upcoming')
    expect(problems).toEqual([])
  })

  test('saving a campaign post in the post editor keeps its title (campaign angle)', async ({ page }) => {
    const { email } = await newAccount(page, 'qa-camp')
    const ws = workspaceOf(email)
    const c = seedCampaign(ws, 'SOCIAL', 'QA Title Keep', [{ at: '2026-11-02 05:30:00', title: 'Launch teaser' }])
    await page.goto(`/app/posts/${c.postIds[0]}`)
    await expect(page.getByRole('link', { name: 'Part of QA Title Keep' })).toBeVisible()
    await page.getByRole('button', { name: 'Save to planner' }).click()
    await expect(page.getByText('Saved', { exact: true })).toBeVisible()
    expect(sql(`select "campaignId" from "Post" where id='${c.postIds[0]}'`)).toBe(c.id)
    expect(sql(`select to_char("scheduledAt",'YYYY-MM-DD HH24:MI') from "Post" where id='${c.postIds[0]}'`)).toBe('2026-11-02 05:30')
    // Actual: savePost() writes title: null for SOCIAL posts, wiping the AI angle shown on the campaign page.
    expect(sql(`select coalesce(title,'<null>') from "Post" where id='${c.postIds[0]}'`)).toBe('Launch teaser')
  })

  test('deleting a post from the editor keeps the campaign consistent', async ({ page }) => {
    const problems = watch(page)
    const { email } = await newAccount(page, 'qa-camp')
    const ws = workspaceOf(email)
    const c = seedCampaign(ws, 'SOCIAL', 'QA Delete Post', [
      { at: '2026-11-02 05:30:00', title: 'P1' },
      { at: '2026-11-04 05:30:00', title: 'P2' },
      { at: '2026-11-06 05:30:00', title: 'P3' },
    ])
    await page.goto(`/app/posts/${c.postIds[2]}`)
    onceAppDialog(page, (d) => d.accept())
    await page.getByRole('button', { name: 'Delete' }).click()
    await page.waitForURL(/\/app\/planner/)
    expect(sql(`select count(*) from "Post" where id='${c.postIds[2]}'`)).toBe('0')
    expect(sql(`select count(*) from "Campaign" where id='${c.id}'`)).toBe('1')
    await page.goto(`/app/campaigns/${c.id}`)
    await expect(items(page)).toHaveCount(2)
    await expect(page.getByText(/2 posts ·/)).toBeVisible()
    // Expected: the campaign range follows the remaining posts (Mon 2 Nov – Wed 4 Nov).
    // Actual: endsOn is never recomputed, header still says "– Fri 6 Nov".
    expect.soft(sql(`select to_char("endsOn",'YYYY-MM-DD') from "Campaign" where id='${c.id}'`)).toBe('2026-11-04')
    expect(problems).toEqual([])
  })

  test('deleting an outline from the blog editor; campaign delete removes campaign + its posts only', async ({ page }) => {
    const problems = watch(page)
    const { email } = await newAccount(page, 'qa-camp')
    const ws = workspaceOf(email)
    const blog = seedCampaign(ws, 'BLOG', 'QA Blog Del', [
      { at: '2026-11-02 06:00:00', title: 'Article one', outline: 'Outline one' },
      { at: '2026-11-09 06:00:00', title: 'Article two', outline: 'Outline two' },
    ])
    const other = seedCampaign(ws, 'SOCIAL', 'QA Keep Me', [{ at: '2026-11-03 06:00:00', title: 'Keep' }])

    await page.goto(`/app/campaigns/${blog.id}`)
    await expect(page.getByText(/2 articles \(0 written\)/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Write article · 3 credits' })).toHaveCount(2)
    await expect(page.getByText('Outline one')).toBeVisible()

    await page.goto(`/app/blog/${blog.postIds[1]}`)
    onceAppDialog(page, (d) => d.accept())
    await page.getByRole('button', { name: 'Delete' }).click()
    await page.waitForURL(/\/app\/planner\?view=list/)
    await page.goto(`/app/campaigns/${blog.id}`)
    await expect(page.getByText(/1 articles \(0 written\)/)).toBeVisible()

    onceAppDialog(page, (d) => d.accept())
    await page.getByRole('button', { name: 'Delete' }).click()
    await page.waitForURL(/\/app\/campaigns$/)
    await expect(page.getByRole('link', { name: /QA Blog Del/ })).toHaveCount(0)
    expect(sql(`select count(*) from "Campaign" where id='${blog.id}'`)).toBe('0')
    expect(sql(`select count(*) from "Post" where id in ('${blog.postIds.join("','")}')`)).toBe('0')
    expect(sql(`select count(*) from "Campaign" where id='${other.id}'`)).toBe('1')
    expect(sql(`select count(*) from "Post" where "campaignId"='${other.id}'`)).toBe('1')
    expect(problems).toEqual([])
  })

  test('isolation: a second account cannot view, edit, rewrite, write or delete the first account\'s campaign', async ({ page, browser }) => {
    const a = await newAccount(page, 'qa-camp')
    const wsA = workspaceOf(a.email)
    const accA = accountOf(a.email)
    const social = seedCampaign(wsA, 'SOCIAL', 'QA Secret A', [{ at: '2026-11-02 05:30:00', title: 'Secret angle', content: 'Secret caption' }])
    const blog = seedCampaign(wsA, 'BLOG', 'QA Secret Blog A', [{ at: '2026-11-02 06:00:00', title: 'Secret article', outline: 'Secret outline' }])

    const ctxB = await (browser as Browser).newContext({ timezoneId: 'Asia/Tbilisi' })
    const pageB = await ctxB.newPage()
    const problems = watch(pageB)
    const b = await newAccount(pageB, 'qa-camp')
    const wsB = workspaceOf(b.email)
    const accB = accountOf(b.email)
    const ownSocial = seedCampaign(wsB, 'SOCIAL', 'QA Own B', [{ at: '2026-11-02 05:30:00', title: 'Own angle' }])
    const ownBlog = seedCampaign(wsB, 'BLOG', 'QA Own Blog B', [{ at: '2026-11-02 06:00:00', title: 'Own article', outline: 'Own outline' }])
    expect(ownSocial.id.length).toBe(social.id.length)

    // Direct URLs.
    await pageB.goto('/app/campaigns')
    await expect(pageB.getByText('QA Secret A')).toHaveCount(0)
    for (const url of [`/app/campaigns/${social.id}`, `/app/posts/${social.postIds[0]}`, `/app/blog/${blog.postIds[0]}`, `/app/campaigns/${blog.id}`]) {
      const res = await pageB.goto(url)
      expect(res?.status(), url).toBe(404)
      await expect(pageB.getByText('Secret')).toHaveCount(0)
    }
    await pageB.goto('/app/planner?m=2026-11')
    await expect(pageB.getByText('Secret angle')).toHaveCount(0)

    // Server actions called with A's ids (B's own ids swapped in the request body).
    const swap: Record<string, string> = {
      [ownSocial.id]: social.id,
      [ownSocial.postIds[0]]: social.postIds[0],
      [ownBlog.postIds[0]]: blog.postIds[0],
    }
    await pageB.route('**/*', async (route) => {
      const req = route.request()
      let body = req.postData()
      if (req.method() !== 'POST' || !req.headers()['next-action'] || !body) return route.continue()
      for (const [from, to] of Object.entries(swap)) body = body.split(from).join(to)
      return route.continue({ postData: body })
    })
    const errorBox = pageB.locator('p.bg-red-50')

    await pageB.goto(`/app/campaigns/${ownSocial.id}`)
    await pageB.getByRole('button', { name: /Rewrite/ }).click()
    await expect(errorBox).toHaveText('Post not found')
    onceAppDialog(pageB, (d) => d.accept())
    await pageB.getByRole('button', { name: 'Delete' }).click()
    await expect(errorBox).toHaveText('Campaign not found')

    await pageB.goto(`/app/campaigns/${ownBlog.id}`)
    await pageB.getByRole('button', { name: 'Write article · 3 credits' }).click()
    await expect(errorBox).toHaveText('Article not found')

    // Post editor save + delete with A's post id.
    await pageB.goto(`/app/posts/${ownSocial.postIds[0]}`)
    await pageB.locator('textarea').first().fill('Overwritten by B')
    await pageB.getByRole('button', { name: 'Save to planner' }).click()
    await expect(errorBox).toHaveText('Post not found')
    onceAppDialog(pageB, (d) => d.accept())
    await pageB.getByRole('button', { name: 'Delete' }).click()
    await pageB.waitForURL(/\/app\/planner/)

    // A's data untouched, nobody charged, B's own data untouched too.
    expect(sql(`select count(*) from "Campaign" where id in ('${social.id}','${blog.id}')`)).toBe('2')
    expect(sql(`select content||'|'||coalesce(title,'') from "Post" where id='${social.postIds[0]}'`)).toBe('Secret caption|Secret angle')
    expect(sql(`select content from "Post" where id='${blog.postIds[0]}'`)).toBe('')
    expect(sql(`select count(*) from "Post" where id='${ownSocial.postIds[0]}'`)).toBe('1')
    expect(sql(`select count(*) from "Campaign" where id='${ownSocial.id}'`)).toBe('1')
    expect(sql(`select "creditBalance" from "Account" where id in ('${accA}','${accB}') order by id`)).toBe('50\n50')
    expect(sql(`select count(*) from "CreditEntry" where amount<0 and "accountId" in ('${accA}','${accB}')`)).toBe('0')
    // 404s are expected here; "negative time stamp" is Next dev-mode performance.measure noise on notFound() pages.
    expect(problems.filter((p) => !/404|negative time stamp/.test(p))).toEqual([])
    await ctxB.close()
  })
})

test.describe('America/New_York (browser zone differs from the server)', () => {
  test.use({ timezoneId: 'America/New_York' })

  test('campaign page hydrates without errors and shows browser-local days/times', async ({ page }) => {
    const { email } = await newAccount(page, 'qa-camp')
    const ws = workspaceOf(email)
    const c = seedCampaign(ws, 'SOCIAL', 'QA New York', [
      { at: '2026-11-10 02:00:00', title: 'Late evening NY' }, // NY: Mon 9 Nov 21:00
      { at: '2026-11-12 15:00:00', title: 'Morning NY' }, // NY: Thu 12 Nov 10:00
    ])
    const problems = watch(page)
    await page.goto(`/app/campaigns/${c.id}`)
    await expect(items(page)).toHaveCount(2)
    await expect(items(page).first()).toContainText('Mon 9 Nov')
    await expect(items(page).first()).toContainText('21:00')
    await page.goto('/app/planner?m=2026-11')
    const cell = page.locator('div.group', { has: page.getByLabel('New post on 2026-11-09') })
    await expect(cell.getByRole('link', { name: /Late evening NY/ })).toBeVisible()
    // Server (UTC+4) renders the client component with its own zone first → hydration text mismatch.
    expect(problems.filter((p) => /hydrat/i.test(p))).toEqual([])
  })

  test('campaigns list card shows the browser-local date range', async ({ page }) => {
    const { email } = await newAccount(page, 'qa-camp')
    const ws = workspaceOf(email)
    seedCampaign(ws, 'SOCIAL', 'QA NY Card', [
      { at: '2026-11-10 02:00:00', title: 'Late evening NY' },
      { at: '2026-11-12 15:00:00', title: 'Morning NY' },
    ])
    await page.goto('/app/campaigns')
    // Expected "9 Nov – 12 Nov" (what the campaign page and Planner show); the server component formats in the server zone.
    await expect(page.getByRole('link', { name: /QA NY Card/ })).toContainText('9 Nov – 12 Nov')
  })
})
