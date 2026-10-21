import { expect, test, type Page } from '@playwright/test'
import { newAccount, onceAppDialog, sql } from './helpers'

// "Make it like this": styles copied from a reference picture or video. The
// copying itself calls the real model (QA_CONTENT_AI=1); here the styles are
// seeded and the rest is checked — links that can't be read, the pickers,
// the video recipe in the AI video dialog, deleting, isolation.

test.describe.configure({ mode: 'serial' })

const AI = process.env.QA_CONTENT_AI === '1'
let page: Page
let ws = ''
let email = ''
const imageId = `sty${Date.now()}i`
const videoId = `sty${Date.now()}v`

const look = { name: 'Rustic Artisan Dark', summary: 'Warm rustic food photography on dark wood.', prompt: 'moody side light, dark weathered wood, flour dust', palette: ['#2C221E', '#8C6847', '#D9B48F'] }
const recipe = {
  ...look,
  name: 'Fast Pop Promo',
  summary: 'Quick cuts, bold words, upbeat pop.',
  hook: 'A close-up with a bold question',
  beats: [
    { role: 'hook', seconds: 2, shot: 'close-up of the product', camera: 'zoom-in', text: 'a question in 4 words' },
    { role: 'product', seconds: 3, shot: 'hands using it', camera: 'pan-right', text: '' },
    { role: 'benefit', seconds: 3, shot: 'happy customer', camera: 'none', text: 'the benefit in 3 words' },
    { role: 'cta', seconds: 2, shot: 'product and logo', camera: 'zoom-out', text: 'order today' },
  ],
  textStyle: 'box',
  textPosition: 'top',
  transition: 'cut',
  voice: { used: true, tone: 'upbeat, friendly', gender: 'female' },
  music: { used: true, mood: 'upbeat pop', prompt: 'upbeat pop, 120 bpm, claps and synth' },
}
const seed = (id: string, workspace: string, kind: string, data: object) =>
  sql(`insert into "StyleRef" (id, "workspaceId", kind, name, data, "createdAt") values ('${id}', '${workspace}', '${kind}', '${(data as { name: string }).name}', '${JSON.stringify(data).replace(/'/g, "''")}'::jsonb, now() at time zone 'utc')`)
const balance = () => sql(`select a."creditBalance" from "Account" a join "AccountMember" m on m."accountId"=a.id join "User" u on u.id=m."userId" where u.email='${email}'`)

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage()
  ;({ email } = await newAccount(page, 'style', 'Bloom Copy'))
  ws = sql(`select w.id from "Workspace" w join "AccountMember" m on m."accountId"=w."accountId" join "User" u on u.id=m."userId" where u.email='${email}'`)
})
test.afterAll(async () => {
  await page.close()
})

test('Studio: an invitation to copy a look; closed networks are explained, nothing is charged', async () => {
  await page.goto('/app/studio')
  await expect(page.getByRole('heading', { name: 'Pictures like this' })).toBeVisible()
  await expect(page.getByText('Saw a post you love? Make yours look like it.')).toBeVisible()
  const before = balance()
  await page.getByRole('button', { name: 'Copy from a video' }).click()
  const dialog = page.getByRole('dialog', { name: 'Make a video like this one' })
  await expect(dialog.getByText('From Instagram, TikTok or Facebook?')).toBeVisible()
  await dialog.getByRole('button', { name: /Copy the style · 2 credits/ }).click()
  await expect(dialog.getByRole('alert')).toHaveText('Paste a link or upload a video')
  for (const link of ['https://www.instagram.com/reel/C9abc123/', 'https://vm.tiktok.com/ZM123/', 'https://fb.watch/abc/']) {
    await dialog.getByLabel('Link').fill(link)
    await dialog.getByRole('button', { name: /Copy the style/ }).click()
    await expect(dialog.getByRole('alert')).toContainText('only shows its videos and pictures to signed-in people')
  }
  await dialog.getByLabel('Link').fill('not a link at all')
  await dialog.getByRole('button', { name: /Copy the style/ }).click()
  await expect(dialog.getByRole('alert')).toContainText(/link/i)
  expect(balance()).toBe(before)
  expect(sql(`select count(*) from "StyleRef" where "workspaceId"='${ws}'`)).toBe('0')
  await page.keyboard.press('Escape')
})

test('a copied picture style: in Studio and in every image style picker', async () => {
  seed(imageId, ws, 'IMAGE', look)
  await page.goto('/app/studio')
  const card = page.getByRole('radiogroup', { name: 'Your styles' }).getByRole('radio', { name: /Rustic Artisan Dark/ })
  await expect(card).toBeVisible()
  await card.click()
  await expect(page.getByText('New images in “Rustic Artisan Dark”')).toBeVisible()
  await expect(page.getByRole('button', { name: /Make 2 · 8 credits/ })).toBeVisible()
  await page.getByRole('button', { name: /Make 2/ }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Describe the picture' })).toBeVisible()

  // The post editor's picker lists it next to the built-in looks.
  await page.goto('/app/posts/new')
  await page.getByRole('button', { name: /Generate with AI/ }).click()
  const picker = page.getByRole('radiogroup', { name: 'Image style' })
  await expect(picker.getByRole('radio', { name: 'Cinematic' })).toBeVisible()
  await picker.getByRole('radio', { name: 'Rustic Artisan Dark' }).click()
  await expect(picker.getByRole('radio', { name: 'Rustic Artisan Dark' })).toHaveAttribute('aria-checked', 'true')
  await expect(picker.getByRole('button', { name: 'Copy a style…' })).toBeVisible()
})

test('a copied video style: the AI video follows its scenes, voice and music', async () => {
  seed(videoId, ws, 'VIDEO', recipe)
  await page.goto('/app/studio?tab=video')
  await page.getByRole('button', { name: 'Like a video I saw' }).click()
  const dialog = page.getByRole('dialog', { name: 'A video like one you saw' })
  await expect(dialog.getByRole('radio', { name: 'Like a video I saw' })).toHaveAttribute('aria-checked', 'true')
  // Only video styles are offered here, the newest picked.
  const styles = dialog.getByRole('radiogroup', { name: 'Your video styles' })
  await expect(styles.getByRole('radio')).toHaveCount(1)
  await expect(styles.getByRole('radio', { name: /Fast Pop Promo/ })).toHaveAttribute('aria-checked', 'true')
  await expect(styles).toContainText('4 scenes · voice-over · upbeat pop')
  // The reference sets the scenes; AI pictures in its look by default.
  await expect(dialog.getByLabel('Scenes')).toBeDisabled()
  await expect(dialog.getByLabel('Scenes')).toHaveValue('4')
  await expect(dialog.getByRole('button', { name: /AI images/ })).toHaveAttribute('aria-pressed', 'true')
  // script 1 + voice 1 + 4 images + music 1.
  await expect(dialog.getByRole('button', { name: /Create · up to 7 credits/ })).toBeVisible()
  await dialog.getByLabel(/AI music like the reference \(upbeat pop\)/).uncheck()
  await expect(dialog.getByRole('button', { name: /Create · up to 6 credits/ })).toBeVisible()
  // Back to the standard look: scenes free again (the title changes too).
  await dialog.getByRole('radio', { name: /^Standard/ }).click()
  await expect(page.getByRole('dialog', { name: 'Create video with AI' }).getByLabel('Scenes')).toBeEnabled()
  await page.keyboard.press('Escape')
})

test('another workspace never sees these styles; deleting one', async ({ browser }) => {
  const other = await browser.newPage()
  await newAccount(other, 'style-other')
  await other.goto('/app/studio')
  await expect(other.getByText('Saw a post you love? Make yours look like it.')).toBeVisible()
  await other.close()

  await page.goto('/app/studio')
  const card = page.getByRole('listitem').filter({ has: page.getByRole('radio', { name: /Rustic Artisan Dark/ }) })
  await card.hover()
  onceAppDialog(page, (d) => d.accept())
  await card.getByRole('button', { name: 'Delete style Rustic Artisan Dark' }).click()
  await expect(page.getByRole('radio', { name: /Rustic Artisan Dark/ })).toHaveCount(0)
  expect(sql(`select count(*) from "StyleRef" where id='${imageId}'`)).toBe('0')
})

test('AI: copying a look from a picture link, then images in it', async () => {
  test.skip(!AI, 'set QA_CONTENT_AI=1 to run against the real model')
  test.setTimeout(240_000)
  await page.goto('/app/studio')
  await page.getByRole('button', { name: 'Copy from a picture' }).click()
  const dialog = page.getByRole('dialog', { name: 'Make pictures like this one' })
  await dialog.getByLabel('Link').fill('https://images.unsplash.com/photo-1509440159596-0249088772ff?w=1200&q=80')
  await dialog.getByRole('button', { name: /Copy the style · 1 credit/ }).click()
  await expect(dialog.getByText('Style saved')).toBeVisible({ timeout: 120_000 })
  await dialog.getByRole('button', { name: 'Use this style' }).click()
  await page.getByLabel('What should the picture show').fill('A birthday cake with berries')
  await page.getByRole('button', { name: /Make 2/ }).click()
  await expect(page.getByRole('list', { name: 'New images' }).getByRole('listitem')).toHaveCount(2, { timeout: 180_000 })
})
