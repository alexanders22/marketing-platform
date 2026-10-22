import { expect, test, type Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import ffmpegPath from 'ffmpeg-static'
import { startFakeGemini } from './fake-gemini'
import { newAccount, sql } from './helpers'

// Editing your own clip: trim it, split a scene in two, subtitles from what
// is said in the clip (fake Gemini), burnt into the MP4. And the AI video
// form, step by step.

test.describe.configure({ mode: 'serial' })
const gemini = startFakeGemini()
const FF = ffmpegPath as unknown as string
const dir = mkdtempSync(path.join(tmpdir(), 'lpvedit-'))
const clip = path.join(dir, 'talk.mp4')
const ff = (...a: string[]) => execFileSync(FF, ['-hide_banner', '-loglevel', 'error', '-y', ...a])
let page: Page
let videoId = ''

const doc = () => JSON.parse(sql(`select data::text from "Video" where id='${videoId}'`))
const output = () => path.resolve('storage', sql(`select m.path from "Video" v join "Media" m on m.id=v."outputMediaId" where v.id='${videoId}'`))
// A grey 54×96 frame of the rendered video at `t` seconds.
const frame = (file: string, t: number) => execFileSync(FF, ['-hide_banner', '-loglevel', 'error', '-ss', String(t), '-i', file, '-frames:v', '1', '-vf', 'scale=54:96,format=gray', '-f', 'rawvideo', '-'])
// Mean difference of two frames over rows [from, to) of 96.
const diff = (a: Buffer, b: Buffer, from: number, to: number) => {
  let sum = 0
  for (let i = from * 54; i < to * 54; i++) sum += Math.abs(a[i] - b[i])
  return sum / ((to - from) * 54)
}

test.beforeAll(async ({ browser }) => {
  // A 6-second clip with sound (a tone stands in for speech).
  ff('-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=30:duration=6', '-f', 'lavfi', '-i', 'sine=frequency=330:duration=6', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', clip)
  await gemini.listen()
  page = await browser.newPage()
  await newAccount(page, 'vedit', 'Bloom Bakery')
})
test.afterAll(async () => {
  await page.close()
  await gemini.close()
})

test('trim a clip: start and end, played and kept in the scene', async () => {
  await page.goto('/app/studio?tab=video')
  await page.getByRole('button', { name: 'New Reel / Story video' }).click()
  await page.waitForURL(/\/app\/studio\/video\//)
  videoId = page.url().split('/').pop()!
  await page.getByRole('button', { name: 'Add photo or clip' }).click()
  const dialog = page.getByRole('dialog', { name: 'Photo or clip' })
  await dialog.locator('input[type=file]').setInputFiles(clip)
  await expect(dialog.getByRole('button', { name: 'Deselect video' })).toBeVisible({ timeout: 30_000 })
  await dialog.getByRole('button', { name: /^Use/ }).click()

  const trim = page.getByLabel('Trim the clip')
  await expect(trim).toContainText('0.0–6.0s of 6.0s')
  await trim.getByLabel('Clip start').fill('1')
  await trim.getByLabel('Clip end').fill('5')
  await expect(trim).toContainText('1.0–5.0s of 6.0s')
  await expect.poll(() => doc().scenes[0], { timeout: 10_000 }).toMatchObject({ clipStart: 1, duration: 4 })
  // The end can't come before the start: at least a second is kept.
  await trim.getByLabel('Clip end').fill('0.5')
  await expect(trim).toContainText('1.0–2.0s')
  await trim.getByLabel('Clip end').fill('5')
  await expect(trim).toContainText('1.0–5.0s')
})

test('split a scene at the playhead; delete a part to cut it out', async () => {
  const trim = page.getByLabel('Trim the clip')
  // The playhead to 3.0 s (the middle of the bar).
  const bar = trim.locator('div.cursor-pointer')
  const box = (await bar.boundingBox())!
  await bar.click({ position: { x: box.width / 2, y: box.height / 2 } })
  await trim.getByRole('button', { name: 'Split here' }).click()
  await expect(page.getByRole('list', { name: 'Scenes' }).getByRole('button')).toHaveCount(2)
  await expect.poll(() => doc().scenes.map((s: { clipStart: number; duration: number }) => [s.clipStart, s.duration]), { timeout: 10_000 }).toEqual([
    [1, 2],
    [3, 2],
  ])
})

test('subtitles from the speech in a clip: transcribed, edited, shown in the preview', async () => {
  await page.getByRole('button', { name: 'Scene 1' }).click()
  await page.getByRole('button', { name: 'Turn them on' }).click()
  const subs = page.getByLabel('Subtitles', { exact: true })
  const before = Number(sql(`select "creditBalance" from "Account" a join "Workspace" w on w."accountId"=a.id join "Video" v on v."workspaceId"=w.id where v.id='${videoId}'`))
  await subs.getByRole('button', { name: /Subtitles from speech/ }).click()
  await expect(subs.getByLabel('Subtitle 1', { exact: true })).toHaveValue('Fresh bread every morning')
  // The scene is 2 s long: the second line ends with it.
  await expect(subs.getByLabel('Subtitle 2 end')).toHaveValue('2')
  expect(sql(`select count(*) from "CreditEntry" c join "Video" v on v."workspaceId"=c."workspaceId" where v.id='${videoId}' and c.action='subtitles' and c.amount=-1`)).toBe('1')
  expect(Number(sql(`select "creditBalance" from "Account" a join "Workspace" w on w."accountId"=a.id join "Video" v on v."workspaceId"=w.id where v.id='${videoId}'`))).toBe(before - 1)

  await subs.getByLabel('Subtitle 2', { exact: true }).fill('Order before 10 am')
  await expect(page.getByLabel('Subtitle', { exact: true })).toHaveAttribute('alt', 'Fresh bread every morning')
  await expect
    .poll(() => doc(), { timeout: 10_000 })
    .toMatchObject({ subtitles: { on: true, style: 'box' }, scenes: [{ keepAudio: true, subs: [{ text: 'Fresh bread every morning' }, { text: 'Order before 10 am', end: 2 }] }, {}] })
})

test('the rendered MP4 carries the subtitles, low in the frame, only while said', async () => {
  test.setTimeout(240_000)
  await page.getByRole('button', { name: 'Render video' }).click()
  await expect(page.getByLabel('Rendered video')).toBeVisible({ timeout: 150_000 })
  const withSubs = output()

  // The same video without subtitles, to compare.
  await page.getByRole('tab', { name: 'Edit preview' }).click()
  await page.getByRole('button', { name: 'Video', exact: true }).click()
  await page.getByLabel('Show subtitles').uncheck()
  await expect.poll(() => doc().subtitles.on, { timeout: 10_000 }).toBe(false)
  await page.getByRole('button', { name: 'Render again' }).click()
  await expect.poll(() => output(), { timeout: 150_000 }).not.toBe(withSubs)
  await expect(page.getByLabel('Rendered video')).toBeVisible({ timeout: 150_000 })
  const plain = output()

  // 0.6 s: the first line is on screen in the lower part (rows 66–80 of 96), the top is the same.
  const a = frame(withSubs, 0.6)
  const b = frame(plain, 0.6)
  expect(diff(a, b, 66, 80)).toBeGreaterThan(8)
  expect(diff(a, b, 5, 40)).toBeLessThan(2)
  // Scene 2 has no lines: the frames match.
  const c = frame(withSubs, 3)
  const d = frame(plain, 3)
  expect(diff(c, d, 60, 85)).toBeLessThan(2)
})

test('the AI video form: steps, what fills the frames, subtitles with the voice-over', async () => {
  await page.goto('/app/studio?tab=video')
  await page.getByRole('button', { name: 'Create video with AI' }).click()
  const d = page.getByRole('dialog', { name: 'Create video with AI' })
  for (const h of ['What is the video about?', 'Look', 'What is in the frames?', 'Format and sound']) await expect(d.getByRole('heading', { name: h })).toBeVisible()
  await expect(d.getByRole('button', { name: 'My photos & videos' })).toHaveAttribute('aria-pressed', 'true')
  await expect(d.getByRole('button', { name: 'Pick photos & videos' })).toBeVisible()
  await d.getByRole('button', { name: 'AI pictures' }).click()
  await expect(d.getByRole('button', { name: 'AI pictures' })).toHaveAttribute('aria-pressed', 'true')
  await expect(d.getByRole('button', { name: 'Pick photos & videos' })).toHaveCount(0)
  const subs = d.getByLabel('Subtitles of the voice-over')
  await expect(subs).toBeChecked()
  await d.getByLabel('Voice-over', { exact: true }).uncheck()
  await expect(subs).toBeDisabled()
  await expect(subs).not.toBeChecked()
  // Wide enough for the four choices in a row.
  expect((await d.boundingBox())!.width).toBeGreaterThan(700)
})
