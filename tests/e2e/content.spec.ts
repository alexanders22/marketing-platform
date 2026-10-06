import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { newAccount, sql } from './helpers'

// Content creation QA (no AI calls in this file): Create-new menu, composer
// controls, hashtag libraries, post editor + MediaPicker, Planner, manual blog.

// 8x8 red PNG — a real decodable image for the file inputs.
export const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP4z8CAFWEXHbQSACj/P8Fu7N9hAAAAAElFTkSuQmCC',
  'base64',
)
const png = (name: string) => ({ name, mimeType: 'image/png', buffer: PNG })

const q = (s: string) => s.replace(/'/g, "''")
export const accountIdOf = (email: string) =>
  sql(`select m."accountId" from "AccountMember" m join "User" u on u.id=m."userId" where u.email='${q(email)}' order by m.id limit 1`)
export const workspaceIdOf = (email: string) =>
  sql(`select w.id from "Workspace" w where w."accountId"='${accountIdOf(email)}' order by w."createdAt" limit 1`)

// Collects console errors, uncaught page errors and 5xx responses.
export function watch(page: Page) {
  const problems: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`console(${page.url()}): ${m.text().slice(0, 300)}`)
  })
  page.on('pageerror', (e) => problems.push(`pageerror(${page.url()}): ${e.message.slice(0, 300)}`))
  page.on('response', (r) => {
    if (r.status() >= 500) problems.push(`${r.status()} ${r.request().method()} ${r.url()}`)
  })
  return problems
}

let ctx: BrowserContext
let page: Page
let email: string
let problems: string[]

async function setup(browser: Browser) {
  ctx = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] })
  page = await ctx.newPage()
  ;({ email } = await newAccount(page, 'qa-content'))
  problems = watch(page)
}

test.beforeAll(async ({ browser }) => setup(browser))
test.afterAll(async () => ctx?.close())
test.afterEach(async () => {
  expect.soft(problems, 'console errors / 5xx on visited pages').toEqual([])
  problems.length = 0
})

const sidebarCreate = () => page.locator('aside').getByRole('button', { name: 'Create new' })
const createMenu = () => page.locator('div.fixed.z-\\[60\\]')

test('Create-new menu: 8 items navigate; closes on outside click and Escape', async () => {
  const items: [string, RegExp][] = [
    ['Plan my marketing with AI', /\/app\/strategy\/new$/],
    ['New post or thread', /\/app\/posts\/new$/],
    ['New AI social post', /\/app\/create$/],
    ['New AI social campaign', /\/app\/campaigns\/new\?kind=social$/],
    ['New video', /\/app\/studio\?tab=video$/],
    ['New blog', /\/app\/blog\/new$/],
    ['New AI blog', /\/app\/blog\/ai$/],
    ['New AI blog campaign', /\/app\/campaigns\/new\?kind=blog$/],
  ]
  await page.goto('/app/planner')
  for (const [label, url] of items) {
    await sidebarCreate().click()
    await expect(createMenu().getByRole('link')).toHaveCount(8)
    await createMenu().getByRole('link', { name: label, exact: false }).filter({ hasText: new RegExp(`^${label}(NEW)?$`) }).click()
    await expect(page).toHaveURL(url)
    await expect(createMenu()).toHaveCount(0)
    await expect(page.locator('main h1, main h2').first()).toBeVisible()
  }
  // Outside click closes.
  await sidebarCreate().click()
  await expect(createMenu()).toBeVisible()
  await page.mouse.click(900, 600)
  await expect(createMenu()).toHaveCount(0)
  // Escape closes.
  await sidebarCreate().click()
  await expect(createMenu()).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(createMenu()).toHaveCount(0)
  // Toggle button closes too.
  await sidebarCreate().click()
  await sidebarCreate().click()
  await expect(createMenu()).toHaveCount(0)
})

// ─── Composer (no generation) ───────────────────────────────────────────────

const pop = () => page.locator('div.absolute.z-40')
const chip = (re: RegExp) => page.locator('main span.cursor-pointer').filter({ hasText: re })
const dialog = (name: string) => page.getByRole('dialog', { name })

test('Composer: tone / length / language / images popovers update labels and credit badge', async () => {
  await page.goto('/app/create')
  await expect(page.getByRole('heading', { name: 'What should we post?' })).toBeVisible()
  const badge = page.locator('main span[title*="credit"]')
  await expect(badge).toHaveText('1')

  await chip(/^Professional$/).click()
  await pop().getByRole('button', { name: 'Bold' }).click()
  await expect(chip(/^Bold$/)).toBeVisible()
  await expect(pop()).toHaveCount(0)

  await chip(/^Medium$/).click()
  await pop().getByRole('button', { name: /^Long/ }).click()
  await expect(chip(/^Long$/)).toBeVisible()

  await chip(/^English$/).click()
  await pop().getByRole('button', { name: 'Georgian' }).click()
  await expect(chip(/^Georgian$/)).toBeVisible()

  for (const n of [1, 2, 4, 0]) {
    await chip(/^Images/).click()
    await pop()
      .getByRole('button', { name: n === 0 ? /^No images/ : new RegExp(`^${n} images?`) })
      .click()
    await expect(badge).toHaveText(String(1 + n))
    await expect(chip(/^Images/)).toHaveText(n ? `Images (${n} · Realistic photo)` : 'Images')
  }
  await expect(badge).toHaveAttribute('title', '1 credit: 1 for the text')

  // Popover closes on Escape and on outside click.
  await chip(/^Bold$/).click()
  await expect(pop()).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(pop()).toHaveCount(0)
  await chip(/^Bold$/).click()
  await page.getByRole('heading', { name: 'What should we post?' }).click()
  await expect(pop()).toHaveCount(0)

  // Suggestion fills the prompt; Generate is disabled on an empty prompt.
  await expect(page.getByRole('button', { name: 'Generate' })).toBeDisabled()
  await page.getByRole('button', { name: /^New product launch/ }).click()
  await expect(page.locator('main textarea')).toHaveValue(/^New product launch\./)
  await expect(page.getByRole('button', { name: 'Generate' })).toBeEnabled()
})

test('Composer: hashtag libraries — create (normalise, dedupe, invalid, 30 cap), select, manage edit + delete', async () => {
  const ws = workspaceIdOf(email)
  await page.goto('/app/create')
  const hashChip = () => chip(/^Hashtags/)

  // AI hashtags switch.
  await hashChip().click()
  const aiSwitch = pop().getByRole('button', { name: /AI hashtags/ })
  await expect(aiSwitch.locator('span.bg-emerald-500')).toHaveCount(1)
  await aiSwitch.click()
  await expect(aiSwitch.locator('span.bg-emerald-500')).toHaveCount(0)
  await aiSwitch.click()
  await expect(aiSwitch.locator('span.bg-emerald-500')).toHaveCount(1)
  await expect(pop().getByText('No hashtag libraries')).toBeVisible()

  // Create via modal.
  await pop().getByRole('button', { name: 'Create new' }).click()
  const modal = dialog('New hashtag library')
  await expect(modal).toBeVisible()
  await modal.getByRole('button', { name: 'Save library' }).click()
  await expect(modal.getByText('Give the library a name')).toBeVisible()
  await modal.getByPlaceholder('e.g. Brand basics').fill('Only junk')
  await modal.locator('textarea').fill('bad-tag #no!pe ###')
  await expect(modal.getByText('0/30 hashtags.')).toBeVisible()
  await modal.getByRole('button', { name: 'Save library' }).click()
  await expect(modal.getByText('Add at least one hashtag')).toBeVisible()

  await modal.getByPlaceholder('e.g. Brand basics').fill('Travel GE')
  await modal.locator('textarea').fill('#Tbilisi, ##georgia travel #travel food-tour wine_time #ღვინო')
  // Tbilisi, georgia, travel, wine_time, ღვინო (food-tour dropped, travel deduped)
  await expect(modal.getByText('5/30 hashtags.')).toBeVisible()
  await modal.getByRole('button', { name: 'Save library' }).click()
  await expect(modal).toHaveCount(0)
  expect(sql(`select array_to_string(tags, ' ') from "HashtagLibrary" where "workspaceId"='${ws}' and name='Travel GE'`)).toBe(
    'Tbilisi georgia travel wine_time ღვინო',
  )
  // A newly created library is auto-selected.
  await expect(hashChip()).toHaveText('Hashtags (1)')

  // 35 tags → refused with a clear message; 30 tags save.
  await hashChip().click()
  await pop().getByRole('button', { name: 'Create new' }).click()
  await modal.getByPlaceholder('e.g. Brand basics').fill('Big list')
  await modal.locator('textarea').fill(Array.from({ length: 35 }, (_, i) => `#tag${i + 1}`).join(' '))
  await expect(modal.getByText(/35\/30 hashtags — remove some to save/)).toBeVisible()
  await modal.getByRole('button', { name: 'Save library' }).click()
  await expect(modal.getByText('A library can hold up to 30 hashtags — this one has 35')).toBeVisible()
  await modal.locator('textarea').fill(Array.from({ length: 30 }, (_, i) => `#tag${i + 1}`).join(' '))
  await modal.getByRole('button', { name: 'Save library' }).click()
  await expect(modal).toHaveCount(0)
  expect(sql(`select cardinality(tags) from "HashtagLibrary" where "workspaceId"='${ws}' and name='Big list'`)).toBe('30')
  await expect(hashChip()).toHaveText('Hashtags (2)')

  // Select / deselect from the popover (checked = check svg).
  await hashChip().click()
  const travel = pop().getByRole('button', { name: /Travel GE/ })
  await expect(travel.locator('svg path[d^="M3 8.5"]')).toHaveCount(1)
  await travel.click()
  await expect(travel.locator('svg path[d^="M3 8.5"]')).toHaveCount(0)
  await expect(hashChip()).toHaveText('Hashtags (1)')
  await travel.click()
  await expect(hashChip()).toHaveText('Hashtags (2)')

  // Manage: edit name + tags, then delete.
  await pop().getByRole('button', { name: 'Manage' }).click()
  const manage = dialog('Hashtag libraries')
  await expect(manage.getByText('Travel GE')).toBeVisible()
  await manage.getByRole('button', { name: 'Edit Travel GE' }).click()
  const edit = dialog('Edit hashtag library')
  await expect(edit.locator('textarea')).toHaveValue('#Tbilisi #georgia #travel #wine_time #ღვინო')
  await edit.getByPlaceholder('e.g. Brand basics').fill('Travel Georgia')
  await edit.locator('textarea').fill('#batumi #sea')
  await edit.getByRole('button', { name: 'Save library' }).click()
  await expect(manage.getByText('Travel Georgia')).toBeVisible()
  await expect(manage.getByText('#batumi #sea')).toBeVisible()
  expect(sql(`select array_to_string(tags, ' ') from "HashtagLibrary" where "workspaceId"='${ws}' and name='Travel Georgia'`)).toBe('batumi sea')

  await manage.getByRole('button', { name: 'Delete Big list' }).click()
  await expect(manage.getByText('Big list')).toHaveCount(0)
  expect(sql(`select count(*) from "HashtagLibrary" where "workspaceId"='${ws}' and name='Big list'`)).toBe('0')
  await page.keyboard.press('Escape')
  await expect(manage).toHaveCount(0)
  // Deleted library is dropped from the selection.
  await expect(hashChip()).toHaveText('Hashtags (1)')

  // Survives reload (server-rendered list).
  await page.reload()
  await hashChip().click()
  await expect(pop().getByRole('button', { name: /Travel Georgia/ })).toBeVisible()
})

test('Composer: library editor rejects case-duplicate tags (#Tbilisi vs #tbilisi)', async () => {
  // Server dedupe is case-sensitive while generation merges case-insensitively.
  const ws = workspaceIdOf(email)
  await page.goto('/app/create')
  await chip(/^Hashtags/).click()
  await pop().getByRole('button', { name: 'Create new' }).click()
  const modal = dialog('New hashtag library')
  await modal.getByPlaceholder('e.g. Brand basics').fill('Case dup')
  await modal.locator('textarea').fill('#Tbilisi #tbilisi #TBILISI')
  await modal.getByRole('button', { name: 'Save library' }).click()
  await expect(modal).toHaveCount(0)
  expect(sql(`select cardinality(tags) from "HashtagLibrary" where "workspaceId"='${ws}' and name='Case dup'`)).toBe('1')
})

test('Composer: 35-tag library shows an over-limit hint instead of "35/30"', async () => {
  await page.goto('/app/create')
  await chip(/^Hashtags/).click()
  await pop().getByRole('button', { name: 'Create new' }).click()
  const modal = dialog('New hashtag library')
  await modal.locator('textarea').fill(Array.from({ length: 35 }, (_, i) => `#t${i}`).join(' '))
  // Saving silently keeps the first 30 — the counter should not read 35/30 without a warning.
  await expect(modal.getByText('35/30 hashtags.')).toHaveCount(0, { timeout: 2000 })
  await page.keyboard.press('Escape')
})

test('Composer: reference attachments — upload, max 3, remove', async () => {
  await page.goto('/app/create')
  const input = page.locator('main input[type=file]')
  const thumbs = page.getByRole('button', { name: 'Remove image' })
  await input.setInputFiles([png('a.png')])
  await expect(thumbs).toHaveCount(1)
  await input.setInputFiles([png('b.png'), png('c.png'), png('d.png')])
  await expect(thumbs).toHaveCount(3)
  await expect(page.getByRole('button', { name: 'Attach reference images (up to 3)' })).toBeDisabled()
  await thumbs.nth(1).click()
  await expect(thumbs).toHaveCount(2)
  await expect(page.getByRole('button', { name: 'Attach reference images (up to 3)' })).toBeEnabled()
  // Previews are JPEG data URLs (client downscales before sending).
  await expect(page.locator('main img[src^="data:image/jpeg"]')).toHaveCount(2)
})

test('Composer: out of credits → clear error, nothing charged, no AI call', async () => {
  const acct = accountIdOf(email)
  const before = sql(`select count(*) from "CreditEntry" where "accountId"='${acct}'`)
  sql(`update "Account" set "creditBalance"=0 where id='${acct}'`)
  try {
    await page.goto('/app/create')
    await expect(page.getByText('0 credits left')).toBeVisible()
    await page.locator('main textarea').fill('Announce our autumn menu')
    const t0 = Date.now()
    await page.getByRole('button', { name: 'Generate' }).click()
    const err = page.locator('main p.bg-red-50')
    await expect(err).toContainText('you have 0')
    expect(Date.now() - t0).toBeLessThan(8000) // no model round-trip
    expect.soft(await err.textContent(), 'grammar: "1 credits"').not.toContain('1 credits')
    expect(sql(`select "creditBalance" from "Account" where id='${acct}'`)).toBe('0')
    expect(sql(`select count(*) from "CreditEntry" where "accountId"='${acct}'`)).toBe(before)
  } finally {
    sql(`update "Account" set "creditBalance"=50 where id='${acct}'`)
  }
})

// ─── Post editor + MediaPicker ─────────────────────────────────────────────

test('Post editor: validation, channels + X length warning, hashtag parsing', async () => {
  await page.goto('/app/posts/new')
  await expect(page.getByRole('heading', { name: 'New post' })).toBeVisible()
  await page.getByRole('button', { name: 'Save draft' }).click()
  await expect(page.getByText('Write something or add an image')).toBeVisible()

  const ch = (n: string) => page.locator(`button[title="${n}"]`)
  await expect(ch('Facebook')).toHaveAttribute('aria-pressed', 'true')
  await expect(ch('Instagram')).toHaveAttribute('aria-pressed', 'true')
  await expect(ch('X')).toHaveAttribute('aria-pressed', 'false')
  await ch('X').click()
  await expect(ch('X')).toHaveAttribute('aria-pressed', 'true')

  const text = page.getByPlaceholder('What do you want to share?')
  await text.fill('a'.repeat(270))
  await expect(page.getByText('Too long for')).toHaveCount(0)
  await page.getByPlaceholder('#brand #campaign').fill('#one two, ##three bad-tag')
  // 270 + "\n\n" + "#one #two #three" = 288 > 280
  await expect(page.getByText('288 characters')).toBeVisible()
  await expect(page.getByText('Too long for X (280)')).toBeVisible()
  await expect(page.locator('aside').getByText('#one #two #three')).toBeVisible()
  await ch('X').click()
  await expect(page.getByText('Too long for')).toHaveCount(0)
  await ch('Threads').click()
  await expect(page.getByText('Too long for Threads (500)')).toHaveCount(0)
  await text.fill('b'.repeat(600))
  await expect(page.getByText('Too long for Threads (500)')).toBeVisible()
})

test('Post editor: images via MediaPicker (upload + pick from library), plan, save, Planner + list, edit, delete', async () => {
  const ws = workspaceIdOf(email)
  await page.goto('/app/posts/new')
  await page.getByPlaceholder('What do you want to share?').fill('QA planned post with images')
  await page.getByPlaceholder('#brand #campaign').fill('#qa #Planner')

  // Upload two files: both auto-selected; deselect one, add 1.
  await page.getByRole('button', { name: 'Add images' }).click()
  const picker = dialog('Add images')
  await picker.locator('input[type=file]').setInputFiles([png('one.png'), png('two.png')])
  await expect(picker.getByRole('button', { name: 'Add 2 images' })).toBeVisible()
  const tiles = picker.locator('div.grid > button')
  await expect(tiles).toHaveCount(2)
  await tiles.nth(1).click()
  await picker.getByRole('button', { name: 'Add 1 image' }).click()
  await expect(picker).toHaveCount(0)
  const editorImgs = page.getByRole('button', { name: 'Remove image' })
  await expect(editorImgs).toHaveCount(1)
  expect(sql(`select count(*) from "Media" where "workspaceId"='${ws}'`)).toBe('2')

  // Pick the other one from the library.
  await page.getByRole('button', { name: 'Add images' }).click()
  await expect(tiles).toHaveCount(2)
  await expect(picker.getByRole('button', { name: /^Add\s+images$/ })).toBeDisabled()
  const inEditor = await page.locator('main section img[src^="/media/"]').first().getAttribute('src')
  await tiles.filter({ hasNot: page.locator(`img[src="${inEditor}"]`) }).click()
  await picker.getByRole('button', { name: 'Add 1 image' }).click()
  await expect(editorImgs).toHaveCount(2)
  // Uploaded media are served to the owner.
  const src = await page.locator('main img[src^="/media/"]').first().getAttribute('src')
  expect((await page.request.get(src!)).status()).toBe(200)

  // Plan for Oct 15, 14:30 local.
  await page.locator('input[type=datetime-local]').fill('2026-10-15T14:30')
  await expect(page.getByRole('button', { name: 'Save to planner' })).toBeVisible()
  await page.getByRole('button', { name: 'Save to planner' }).click()
  await expect(page).toHaveURL(/\/app\/posts\/c[a-z0-9]+$/)
  await expect(page.getByRole('heading', { name: 'Edit post' })).toBeVisible()
  const id = page.url().split('/').pop()!
  const row = sql(
    `select content, array_to_string(hashtags,' '), cardinality("mediaIds"), array_to_string(channels,' '), to_char("scheduledAt",'YYYY-MM-DD"T"HH24:MI') from "Post" where id='${id}'`,
  )
  const offsetMin = await page.evaluate(() => new Date('2026-10-15T14:30').getTimezoneOffset())
  const utc = new Date(Date.UTC(2026, 9, 15, 14, 30) + offsetMin * 60_000).toISOString().slice(0, 16)
  expect(row).toBe(`QA planned post with images|qa Planner|2|FACEBOOK INSTAGRAM|${utc}`)
  await expect(page.locator('input[type=datetime-local]')).toHaveValue('2026-10-15T14:30')

  // Calendar: right local day with time and text.
  await page.goto('/app/planner?m=2026-10')
  const cell = page.locator('div.group').filter({ has: page.getByLabel('New post on 2026-10-15', { exact: true }) })
  await expect(cell.getByRole('link', { name: /14:30\s*QA planned post/ })).toBeVisible()
  // Not on neighbouring days.
  for (const d of ['2026-10-14', '2026-10-16'])
    await expect(page.locator('div.group').filter({ has: page.getByLabel(`New post on ${d}`, { exact: true }) }).getByText('QA planned post')).toHaveCount(0)

  // Also a draft and a past post for list groups.
  await page.goto('/app/posts/new')
  await page.getByPlaceholder('What do you want to share?').fill('QA draft only')
  await page.getByRole('button', { name: 'Save draft' }).click()
  await expect(page).toHaveURL(/\/app\/posts\/c/)
  await page.goto('/app/posts/new')
  await page.getByPlaceholder('What do you want to share?').fill('QA past post')
  await page.locator('input[type=datetime-local]').fill('2026-09-01T09:00')
  await page.getByRole('button', { name: 'Save to planner' }).click()
  await expect(page).toHaveURL(/\/app\/posts\/c/)

  await page.goto('/app/planner?view=list')
  await expect(page.getByRole('heading', { name: 'All content' })).toBeVisible()
  const group = (t: string) => page.locator('section').filter({ has: page.getByRole('heading', { name: new RegExp(`^${t} · \\d+$`) }) })
  await expect(group('Upcoming').getByText('QA planned post with images').first()).toBeVisible()
  await expect(group('Drafts').getByText('QA draft only').first()).toBeVisible()
  await expect(group('Past').getByText('QA past post').first()).toBeVisible()
  await expect(group('Upcoming').getByText('QA draft only')).toHaveCount(0)

  // Edit.
  await group('Upcoming').getByRole('link', { name: /QA planned post with images/ }).click()
  await expect(page).toHaveURL(new RegExp(`/app/posts/${id}$`))
  await page.getByPlaceholder('What do you want to share?').fill('QA planned post — edited')
  await page.getByRole('button', { name: 'Remove image' }).first().click()
  await page.getByRole('button', { name: 'Save to planner' }).click()
  await expect(page.getByText('Saved', { exact: true })).toBeVisible()
  expect(sql(`select content || '|' || cardinality("mediaIds") from "Post" where id='${id}'`)).toBe('QA planned post — edited|1')

  // "Clear — keep as draft".
  await page.getByRole('button', { name: 'Clear — keep as draft' }).click()
  // Clearing the date is an unsaved change: the stale "Saved" badge should go.
  await expect.soft(page.getByText('Saved', { exact: true }), '"Saved" still shown after Clear').toHaveCount(0, { timeout: 2000 })
  await page.getByRole('button', { name: 'Save draft' }).click()
  await expect.poll(() => sql(`select coalesce("scheduledAt"::text,'null') from "Post" where id='${id}'`)).toBe('null')

  // Delete.
  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: 'Delete' }).click()
  await expect(page).toHaveURL(/\/app\/planner$/)
  expect(sql(`select count(*) from "Post" where id='${id}'`)).toBe('0')
  expect((await page.request.get(`/app/posts/${id}`)).status()).toBe(404)
})

test('Post editor: deselecting all channels is saved (not reverted to Facebook + Instagram)', async () => {
  await page.goto('/app/posts/new')
  await page.getByPlaceholder('What do you want to share?').fill('QA no channels')
  await page.locator('button[title="Facebook"]').click()
  await page.locator('button[title="Instagram"]').click()
  await page.getByRole('button', { name: 'Save draft' }).click()
  await expect(page).toHaveURL(/\/app\/posts\/c/)
  const id = page.url().split('/').pop()!
  expect(sql(`select cardinality(channels) from "Post" where id='${id}'`)).toBe('0')
  await page.reload()
  // Reopening shows FB + IG selected although the post has none.
  await expect(page.locator('button[title="Facebook"]')).toHaveAttribute('aria-pressed', 'false')
})

test('Post editor: AI-generated post shows the AI badge; another workspace id is 404', async () => {
  const ws = workspaceIdOf(email)
  const id = `qaai${Date.now().toString(36)}`
  sql(`insert into "Post"(id,"workspaceId",kind,status,content,hashtags,"mediaIds",channels,"aiGenerated","updatedAt") values ('${id}','${ws}','SOCIAL','DRAFT','QA ai post',ARRAY['x'],ARRAY[]::text[],ARRAY['LINKEDIN'],true,now())`)
  await page.goto(`/app/posts/${id}`)
  await expect(page.locator('main span.bg-sky-50').filter({ hasText: 'AI' })).toBeVisible()
  await expect(page.locator('button[title="LinkedIn"]')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('button[title="Facebook"]')).toHaveAttribute('aria-pressed', 'false')
  // Saving keeps aiGenerated.
  await page.getByRole('button', { name: 'Save draft' }).click()
  await expect.poll(() => sql(`select "aiGenerated" from "Post" where id='${id}'`)).toBe('t')
  expect((await page.request.get('/app/posts/doesnotexist')).status()).toBe(404)
})

// ─── Planner ───────────────────────────────────────────────────────────────

test('Planner: month navigation, Today, Social/Blog filter, day "+" prefill', async () => {
  // One blog + one social on Oct 20.
  const ws = workspaceIdOf(email)
  const sfx = Date.now().toString(36)
  sql(
    `insert into "Post"(id,"workspaceId",kind,status,title,content,hashtags,"mediaIds",channels,"scheduledAt","updatedAt") values ('qacb${sfx}','${ws}','BLOG','DRAFT','QA blog on 20th','',ARRAY[]::text[],ARRAY[]::text[],ARRAY[]::text[],'2026-10-20T08:00:00Z',now()), ('qacs${sfx}','${ws}','SOCIAL','DRAFT',null,'QA social on 20th',ARRAY[]::text[],ARRAY[]::text[],ARRAY['X'],'2026-10-20T09:00:00Z',now())`,
  )
  await page.goto('/app/planner?m=2026-10')
  await expect(page.getByRole('heading', { name: 'October 2026' })).toBeVisible()
  await page.getByRole('link', { name: 'Next month' }).click()
  await expect(page).toHaveURL(/m=2026-11$/)
  await expect(page.getByRole('heading', { name: 'November 2026' })).toBeVisible()
  await page.getByRole('link', { name: 'Previous month' }).click()
  await expect(page.getByRole('heading', { name: 'October 2026' })).toBeVisible()
  await page.getByRole('link', { name: 'Previous month' }).click()
  await expect(page.getByRole('heading', { name: 'September 2026' })).toBeVisible()
  await page.goto('/app/planner?m=2026-12')
  await page.getByRole('link', { name: 'Next month' }).click()
  await expect(page.getByRole('heading', { name: 'January 2027' })).toBeVisible()
  await page.getByRole('link', { name: 'Today' }).click()
  const now = new Date()
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  await expect(page).toHaveURL(new RegExp(`m=${ym}$`))
  // Bad ?m falls back to the current month.
  await page.goto('/app/planner?m=garbage')
  await expect(page.getByRole('heading', { name: now.toLocaleString('en-US', { month: 'long', year: 'numeric' }) })).toBeVisible()

  await page.goto('/app/planner?m=2026-10')
  const cell = page.locator('div.group').filter({ has: page.getByLabel('New post on 2026-10-20', { exact: true }) })
  await expect(cell.getByText('QA blog on 20th')).toBeVisible()
  await expect(cell.getByText('QA social on 20th')).toBeVisible()
  await page.getByRole('button', { name: 'Blog', exact: true }).click()
  await expect(cell.getByText('QA social on 20th')).toHaveCount(0)
  await expect(cell.getByText('QA blog on 20th')).toBeVisible()
  await page.getByRole('button', { name: 'Social', exact: true }).click()
  await expect(cell.getByText('QA blog on 20th')).toHaveCount(0)
  await expect(cell.getByText('QA social on 20th')).toBeVisible()
  await page.getByRole('button', { name: 'All', exact: true }).click()
  await expect(cell.getByRole('link')).toHaveCount(3) // "+" + 2 items
  // Blog item opens the blog editor.
  await expect(cell.getByRole('link', { name: /QA blog on 20th/ })).toHaveAttribute('href', `/app/blog/qacb${sfx}`)

  // List view keeps the filter options.
  await page.getByRole('link', { name: 'List view' }).click()
  await expect(page).toHaveURL(/view=list&m=2026-10/)
  await page.getByRole('button', { name: 'Blog', exact: true }).click()
  await expect(page.getByText('QA social on 20th')).toHaveCount(0)
  await expect(page.getByText('Article outline — not written yet')).toBeVisible()
  await page.getByRole('link', { name: 'Calendar view' }).click()
  await expect(page).toHaveURL(/\/app\/planner\?m=2026-10$/)

  // "+" opens a new post at 10:00 that day.
  await cell.hover()
  await cell.getByLabel('New post on 2026-10-20', { exact: true }).click()
  await expect(page).toHaveURL(/\/app\/posts\/new\?date=2026-10-20$/)
  await expect(page.locator('input[type=datetime-local]')).toHaveValue('2026-10-20T10:00')
  await expect(page.getByRole('button', { name: 'Save to planner' })).toBeVisible()
  // Malformed ?date is ignored.
  await page.goto('/app/posts/new?date=2026-1-1')
  await expect(page.locator('input[type=datetime-local]')).toHaveValue('')
})

// ─── Blog (manual) ─────────────────────────────────────────────────────────

test('Blog: manual article — title required, markdown preview, cover, keywords, date, Copy Markdown, edit, delete', async () => {
  const ws = workspaceIdOf(email)
  await page.goto('/app/blog/new')
  await expect(page.getByRole('heading', { name: 'New article' })).toBeVisible()
  await page.getByRole('button', { name: 'Save article' }).click()
  await expect(page.getByText('Give the article a title')).toBeVisible()

  await page.getByPlaceholder('Article title').fill('QA Guide to Tbilisi')
  await page.locator('main textarea').fill('Intro text.\n\n## First section\n\n- item one\n- item two\n\n### Sub\n\n**bold** and 1. done')
  await expect(page.getByText(/^\d+ words$/)).toHaveText('17 words')
  await page.getByRole('button', { name: 'preview' }).click()
  const art = page.locator('article')
  await expect(art.locator('h2')).toHaveText('First section')
  await expect(art.locator('h3')).toHaveText('Sub')
  await expect(art.locator('ul > li')).toHaveCount(2)
  await expect(art.locator('strong')).toHaveText('bold')
  await page.getByRole('button', { name: 'write' }).click()

  // Cover via picker (max 1).
  await page.getByRole('button', { name: 'Add cover image' }).click()
  const picker = dialog('Add images')
  await picker.locator('input[type=file]').setInputFiles([png('cover.png')])
  await expect(picker.getByRole('button', { name: 'Add 1 image' })).toBeEnabled()
  // max=1: selecting another tile does not exceed 1.
  const tiles = picker.locator('div.grid > button')
  if ((await tiles.count()) > 1) {
    await tiles.nth(1).click()
    await expect(picker.getByRole('button', { name: 'Add 1 image' })).toBeVisible()
  }
  await picker.getByRole('button', { name: 'Add 1 image' }).click()
  await expect(page.getByRole('button', { name: 'Remove cover' })).toBeVisible()

  await page.getByPlaceholder('seo, keywords, comma separated').fill('tbilisi, travel_tips')
  await page.locator('input[type=datetime-local]').fill('2026-10-22T09:15')
  await page.getByRole('button', { name: 'Save article' }).click()
  await expect(page).toHaveURL(/\/app\/blog\/c[a-z0-9]+$/)
  const id = page.url().split('/').pop()!
  expect(sql(`select kind || '|' || title || '|' || array_to_string(hashtags,',') || '|' || cardinality("mediaIds") from "Post" where id='${id}'`)).toBe(
    'BLOG|QA Guide to Tbilisi|tbilisi,travel_tips|1',
  )
  // Saved article opens in preview tab with its values.
  await expect(page.getByRole('heading', { name: 'Edit article' })).toBeVisible()
  await expect(page.getByPlaceholder('Article title')).toHaveValue('QA Guide to Tbilisi')
  await expect(page.locator('input[type=datetime-local]')).toHaveValue('2026-10-22T09:15')

  // Copy Markdown.
  await page.getByRole('button', { name: 'Copy Markdown' }).click()
  const clip = await page.evaluate(() => navigator.clipboard.readText())
  expect(clip).toBe('# QA Guide to Tbilisi\n\nIntro text.\n\n## First section\n\n- item one\n- item two\n\n### Sub\n\n**bold** and 1. done')

  // On planner as a blog item.
  await page.goto('/app/planner?m=2026-10')
  await expect(
    page.locator('div.group').filter({ has: page.getByLabel('New post on 2026-10-22', { exact: true }) }).getByText('QA Guide to Tbilisi'),
  ).toBeVisible()

  // Edit.
  await page.goto(`/app/blog/${id}`)
  await page.getByPlaceholder('Article title').fill('QA Guide to Tbilisi (v2)')
  await page.getByRole('button', { name: 'Save article' }).click()
  await expect.poll(() => sql(`select title from "Post" where id='${id}'`)).toBe('QA Guide to Tbilisi (v2)')

  // /app/posts/{blogId} redirects to the blog editor.
  await page.goto(`/app/posts/${id}`)
  await expect(page).toHaveURL(new RegExp(`/app/blog/${id}$`))

  // Delete.
  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: 'Delete' }).click()
  await expect(page).toHaveURL(/\/app\/planner\?view=list$/)
  expect(sql(`select count(*) from "Post" where id='${id}'`)).toBe('0')
  expect(sql(`select count(*) from "Media" where "workspaceId"='${ws}'`)).not.toBe('0')
})

test('Blog: multi-word keywords keep their spaces ("old town" is not saved as "oldtown")', async () => {
  await page.goto('/app/blog/new')
  await page.getByPlaceholder('Article title').fill('QA keywords')
  await page.getByPlaceholder('seo, keywords, comma separated').fill('old town, wine tour')
  await page.getByRole('button', { name: 'Save article' }).click()
  await expect(page).toHaveURL(/\/app\/blog\/c[a-z0-9]+$/)
  await expect(page.getByPlaceholder('seo, keywords, comma separated')).toHaveValue('old town, wine tour')
})

test('Blog: AI blog out of credits → clear error, nothing charged', async () => {
  const acct = accountIdOf(email)
  const before = sql(`select count(*) from "CreditEntry" where "accountId"='${acct}'`)
  sql(`update "Account" set "creditBalance"=2 where id='${acct}'`)
  try {
    await page.goto('/app/blog/ai')
    await expect(page.getByText('3 credits · 2 left')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Write article' })).toBeDisabled()
    await page.locator('main textarea').fill('Weekend guide to Tbilisi old town')
    await page.getByRole('button', { name: 'Write article' }).click()
    await expect(page.getByText('This needs 3 credits and you have 2.')).toBeVisible()
    expect(sql(`select count(*) from "CreditEntry" where "accountId"='${acct}'`)).toBe(before)
  } finally {
    sql(`update "Account" set "creditBalance"=50 where id='${acct}'`)
  }
})
