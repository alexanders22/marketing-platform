import { expect, test, type Page } from '@playwright/test'
import path from 'node:path'
import ffmpegPath from 'ffmpeg-static'
import { spawnSync } from 'node:child_process'
import { newAccount, sql } from './helpers'

// AI clips with Google Veo. "[test]" prompts never reach Google outside
// production: a coloured clip with sound arrives after ~3 seconds. QA_VEO=1
// runs one real (cheap, 4-second) clip.

test.describe.configure({ mode: 'serial' })
const REAL = process.env.QA_VEO === '1'
const FF = ffmpegPath as unknown as string
let page: Page
let videoId = ''
let accountId = ''

const balance = () => Number(sql(`select "creditBalance" from "Account" where id='${accountId}'`))

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage()
  const { email } = await newAccount(page, 'veo', 'Bloom Bakery')
  accountId = sql(`select m."accountId" from "AccountMember" m join "User" u on u.id=m."userId" where u.email='${email}'`)
  // Veo is for paying customers: a paid month.
  sql(`update "Account" set "trialEndsAt"=null, "paidUntil"=now() + interval '30 days', "creditBalance"="creditBalance"+100 where id='${accountId}'`)
  sql(`insert into "CreditEntry"(id,"accountId",amount,reason,note) values ('ce${Date.now()}','${accountId}',100,'GRANT','test top-up')`)
  await page.goto('/app/studio?tab=video')
  await page.getByRole('button', { name: 'New Reel / Story video' }).click()
  await page.waitForURL(/\/app\/studio\/video\//)
  videoId = page.url().split('/').pop()!
})
test.afterAll(async () => page.close())

test('generate a clip for a scene: charged, pending, then it arrives', async () => {
  const before = balance()
  await page.getByRole('button', { name: 'Generate clip with AI' }).click()
  await page.getByLabel('Clip description').fill('[test] baker dusting sugar over croissants')
  await expect(page.getByRole('radiogroup', { name: 'Clip quality' }).getByRole('radio', { name: /Quick/ })).toHaveAttribute('aria-checked', 'true')
  await page.getByRole('button', { name: 'Generate · 4 credits' }).click()
  await expect(page.getByText(/Generating the AI clip/)).toBeVisible()
  await expect(page.getByLabel('AI clip generating')).toBeVisible()
  await expect(page.getByRole('button', { name: /Render video/ })).toBeDisabled()
  expect(balance()).toBe(before - 4)

  await expect(page.getByText(/Generating the AI clip/)).toHaveCount(0, { timeout: 30_000 })
  await expect(page.getByLabel('AI clip generating')).toHaveCount(0)
  await expect.poll(() => sql(`select data->'scenes'->0->'media'->>'kind' from "Video" where id='${videoId}'`), { timeout: 10_000 }).toBe('video')
  expect(sql(`select status||':'||credits||':'||quality||':'||aspect from "ClipJob" where "videoId"='${videoId}'`)).toBe('DONE:4:quick:9:16')
  // The ledger knows what was bought: for the admin's unit economics.
  expect(sql(`select action||':'||units from "CreditEntry" where "accountId"='${accountId}' and action is not null order by "createdAt" desc limit 1`)).toBe('clipQuick:4')
  expect(sql(`select m.kind||':'||(m."posterId" is not null) from "ClipJob" j join "Media" m on m.id=j."mediaId" where j."videoId"='${videoId}'`)).toBe('VIDEO:true')
})

test('a failed clip gives the credits back once', async () => {
  const before = balance()
  await page.getByRole('button', { name: 'Add scene' }).click()
  await page.getByRole('button', { name: 'Generate clip with AI' }).click()
  await page.getByLabel('Clip description').fill('[test] fail on purpose')
  await page.getByRole('radiogroup', { name: 'Clip quality' }).getByRole('radio', { name: /Pro/ }).click()
  await page.getByRole('radiogroup', { name: 'Clip length' }).getByRole('radio', { name: '6s' }).click()
  await page.getByRole('button', { name: 'Generate · 24 credits' }).click()
  await expect(page.getByText(/AI clip failed: The clip was blocked by safety filters/)).toBeVisible({ timeout: 30_000 })
  expect(balance()).toBe(before)
  const job = sql(`select id from "ClipJob" where "videoId"='${videoId}' and status='FAILED'`)
  expect(sql(`select count(*)||':'||sum(amount) from "CreditEntry" where "refId"='${job}' and reason='REFUND'`)).toBe('1:24')
  // The scene is free again.
  await expect(page.getByRole('button', { name: 'Generate clip with AI' })).toBeVisible()
})

test('render with the clip and its own sound', async () => {
  test.setTimeout(120_000)
  await page.getByRole('list', { name: 'Scenes' }).getByRole('button', { name: 'Scene 2' }).click()
  await page.getByRole('button', { name: 'Delete scene' }).click()
  await page.getByRole('list', { name: 'Scenes' }).getByRole('button', { name: 'Scene 1' }).click()
  await page.getByLabel(/Use the clip's own sound/).check()
  await page.getByLabel('On-screen text').fill('Fresh every morning')
  await expect.poll(() => sql(`select data->'scenes'->0->>'keepAudio' from "Video" where id='${videoId}'`), { timeout: 10_000 }).toBe('true')
  await page.getByRole('button', { name: 'Render video' }).click()
  await expect(page.getByLabel('Rendered video')).toBeVisible({ timeout: 100_000 })
  const out = sql(`select m.path from "Video" v join "Media" m on m.id=v."outputMediaId" where v.id='${videoId}'`)
  // The clip's 330 Hz tone is in the final mix: the audio is not silent.
  const r = spawnSync(FF, ['-hide_banner', '-i', path.resolve('storage', out), '-t', '3', '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' })
  const mean = Number(r.stderr.match(/mean_volume: (-?[\d.]+) dB/)?.[1] ?? -91)
  expect(mean).toBeGreaterThan(-60)
})

test('monthly Veo limit: the meter, refunds give seconds back, over the limit is refused', async () => {
  // Starter: 32 s a month. One 4 s clip made, the failed Pro clip given back.
  await page.getByRole('button', { name: 'Generate clip with AI' }).click()
  await expect(page.getByText('AI clips this month')).toBeVisible()
  await expect(page.getByText('4 / 32s')).toBeVisible()
  // Pretend 26 more seconds were used this month: 2 s left.
  sql(`insert into "CreditEntry"(id,"accountId",amount,reason,note,action,units) values ('ce${Date.now()}','${accountId}',-26,'AI_VIDEO','test usage','clipQuick',26)`)
  sql(`update "Account" set "creditBalance"="creditBalance"+26 where id='${accountId}'`)
  await page.reload()
  await page.getByRole('button', { name: 'Generate clip with AI' }).click()
  await page.getByLabel('Clip description').fill('[test] over the limit')
  await expect(page.getByText(/2s left this month/)).toBeVisible()
  await expect(page.getByRole('button', { name: /Generate · 4 credits/ })).toBeDisabled()
  sql(`delete from "CreditEntry" where "accountId"='${accountId}' and note='test usage'`)
  await page.reload()
  await page.getByRole('button', { name: 'Generate clip with AI' }).click()
  await expect(page.getByText('4 / 32s')).toBeVisible()
})

test('trial accounts see Veo locked and cannot start a clip', async ({ browser }) => {
  const trial = await browser.newPage()
  await newAccount(trial, 'veo-trial')
  await trial.goto('/app/studio?tab=video')
  await trial.getByRole('button', { name: 'New Reel / Story video' }).click()
  await trial.waitForURL(/\/app\/studio\/video\//)
  await expect(trial.getByText('AI clips with Google Veo are part of paid plans.')).toBeVisible()
  await expect(trial.getByRole('button', { name: 'Generate clip with AI' })).toHaveCount(0)
  await trial.goto('/app/studio?tab=video')
  await trial.getByRole('button', { name: 'Create video with AI' }).click()
  await expect(trial.getByRole('button', { name: 'AI clips (Veo)' })).toBeDisabled()
  await trial.close()
})

test('another workspace cannot read the clip job', async ({ browser }) => {
  const job = sql(`select id from "ClipJob" where "videoId"='${videoId}' and status='DONE'`)
  const media = sql(`select "mediaId" from "ClipJob" where id='${job}'`)
  const other = await browser.newPage()
  await newAccount(other, 'veo-other')
  expect((await other.request.get(`/media/${media}`)).status()).toBe(404)
  await other.close()
})

test('real Veo: a 4-second clip from Google', async () => {
  test.skip(!REAL, 'set QA_VEO=1 to generate one real clip (costs about $0.40)')
  test.setTimeout(400_000)
  await page.getByRole('button', { name: 'Add scene' }).click()
  await page.getByRole('button', { name: 'Generate clip with AI' }).click()
  await page.getByLabel('Clip description').fill('Close-up of steam rising from a fresh loaf of sourdough on a wooden board, warm morning light')
  await page.getByRole('button', { name: 'Generate · 4 credits' }).click()
  await expect(page.getByText(/Generating the AI clip/)).toBeVisible()
  await expect(page.getByText(/Generating the AI clip/)).toHaveCount(0, { timeout: 360_000 })
  const job = sql(`select status||':'||coalesce(error,'') from "ClipJob" where "videoId"='${videoId}' order by "createdAt" desc limit 1`)
  console.log('REAL VEO', job)
  expect(job.startsWith('DONE')).toBe(true)
})
