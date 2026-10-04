import { expect, test, type Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import ffmpegPath from 'ffmpeg-static'
import { startFakeMeta } from './fake-meta'
import { newAccount, sql } from './helpers'

// Video Studio: upload a clip, a photo and music, build scenes with text,
// render an MP4 on the server, and send it to a post. AI video is gated.

test.describe.configure({ mode: 'serial' })
const AI = process.env.QA_CONTENT_AI === '1'
const meta = startFakeMeta()
const FF = ffmpegPath as unknown as string
let page: Page
let videoId = ''
const dir = mkdtempSync(path.join(tmpdir(), 'lpvideo-'))

// Small test files made with the same ffmpeg the app uses.
const clip = path.join(dir, 'clip.mp4')
const photo = path.join(dir, 'photo.jpg')
const music = path.join(dir, 'music.m4a')
const ff = (...a: string[]) => execFileSync(FF, ['-hide_banner', '-loglevel', 'error', '-y', ...a])

test.beforeAll(async ({ browser }) => {
  ff('-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=30:duration=3', '-pix_fmt', 'yuv420p', clip)
  ff('-f', 'lavfi', '-i', 'testsrc2=size=1200x800', '-frames:v', '1', photo)
  ff('-f', 'lavfi', '-i', 'sine=frequency=440:duration=6', '-c:a', 'aac', music)
  await meta.listen()
  page = await browser.newPage()
  await newAccount(page, 'video', 'Bloom Bakery')
})
test.afterAll(async () => {
  await page.close()
  await meta.close()
})

const probe = (file: string) => {
  try {
    execFileSync(FF, ['-hide_banner', '-i', file], { stdio: 'pipe' })
  } catch (e) {
    return String((e as { stderr?: Buffer }).stderr ?? '')
  }
  return ''
}

test('new Reel from the Studio', async () => {
  await page.goto('/app/studio')
  await page.getByRole('navigation', { name: 'Studio' }).getByRole('link', { name: 'Video' }).click()
  await page.getByRole('button', { name: 'New Reel / Story video' }).click()
  await page.waitForURL(/\/app\/studio\/video\//)
  videoId = page.url().split('/').pop()!
  await expect(page.getByRole('list', { name: 'Scenes' }).getByRole('button')).toHaveCount(1)
  expect(sql(`select format||':'||status from "Video" where id='${videoId}'`)).toBe('9:16:DRAFT')
})

test('scenes from an uploaded clip and photo, with text, music and fade', async () => {
  // Scene 1: video clip.
  await page.getByRole('button', { name: 'Add photo or clip' }).click()
  const dialog = page.getByRole('dialog', { name: 'Photo or clip' })
  await dialog.locator('input[type=file]').setInputFiles(clip)
  await expect(dialog.getByRole('button', { name: 'Deselect video' })).toBeVisible({ timeout: 30_000 })
  await dialog.getByRole('button', { name: /^Use/ }).click()
  await page.getByLabel('On-screen text').fill('Fresh every morning')

  // Scene 2: photo with a zoom.
  await page.getByRole('button', { name: 'Add scene' }).click()
  await page.getByRole('button', { name: 'Add photo or clip' }).click()
  await page.getByRole('dialog', { name: 'Photo or clip' }).locator('input[type=file]').setInputFiles(photo)
  await expect(page.getByRole('dialog', { name: 'Photo or clip' }).getByRole('button', { name: 'Deselect image' })).toBeVisible({ timeout: 30_000 })
  await page.getByRole('dialog', { name: 'Photo or clip' }).getByRole('button', { name: /^Use/ }).click()
  await page.getByLabel('On-screen text').fill('Order cakes by Thursday')
  await page.getByRole('radiogroup', { name: 'Text style' }).getByRole('radio', { name: 'Brand box' }).click()
  await page.getByRole('radiogroup', { name: 'Camera motion' }).getByRole('radio', { name: 'Zoom out' }).click()

  // Music.
  await page.getByRole('button', { name: 'Video', exact: true }).click()
  await page.getByRole('button', { name: 'Add music' }).click()
  await page.getByRole('dialog', { name: 'Music' }).locator('input[type=file]').setInputFiles(music)
  await expect(page.getByRole('dialog', { name: 'Music' }).getByRole('button', { name: /music\.m4a/ })).toBeVisible({ timeout: 30_000 })
  await page.getByRole('dialog', { name: 'Music' }).getByRole('button', { name: /^Use/ }).click()
  // Autosave: wait until the server has the music too.
  await expect.poll(() => sql(`select data->'music'->>'name' from "Video" where id='${videoId}'`), { timeout: 10_000 }).toBe('music.m4a')

  const doc = JSON.parse(sql(`select data::text from "Video" where id='${videoId}'`))
  expect(doc.scenes.map((s: { media: { kind: string } }) => s.media.kind)).toEqual(['video', 'image'])
  expect(doc.scenes[1]).toMatchObject({ text: 'Order cakes by Thursday', style: 'box', motion: 'zoom-out' })
  expect(doc.music.name).toBe('music.m4a')
  // The uploaded clip has its length and a poster frame.
  expect(sql(`select "durationMs" between 2900 and 3100 and "posterId" is not null from "Media" where id='${doc.scenes[0].media.id}'`)).toBe('t')
})

test('render: an H.264/AAC MP4 of the right size and length', async () => {
  test.setTimeout(180_000)
  await page.getByRole('button', { name: 'Render video' }).click()
  await expect(page.getByRole('button', { name: /Rendering/ })).toBeVisible()
  await expect(page.getByLabel('Rendered video')).toBeVisible({ timeout: 150_000 })
  expect(sql(`select status from "Video" where id='${videoId}'`)).toBe('READY')
  const out = sql(`select m.path from "Video" v join "Media" m on m.id=v."outputMediaId" where v.id='${videoId}'`)
  const info = probe(path.resolve('storage', out))
  expect(info).toMatch(/Video: h264.*1080x1920/)
  expect(info).toMatch(/Audio: aac/)
  // 3s clip + 3s photo + 2.5s end card − two 0.4s crossfades = 7.7s.
  const [, m, s] = info.match(/Duration: 00:(\d+):(\d+\.\d+)/)!
  expect(Number(m) * 60 + Number(s)).toBeCloseTo(7.7, 0)
  // The file streams with ranges (video players seek).
  const url = await page.getByLabel('Rendered video').getAttribute('src')
  const res = await page.request.get(url!, { headers: { range: 'bytes=0-99' } })
  expect(res.status()).toBe(206)
  expect(res.headers()['content-range']).toMatch(/^bytes 0-99\//)
  expect(readFileSync(path.resolve('storage', out)).subarray(4, 8).toString()).toBe('ftyp')
})

test('use the video in a post', async () => {
  await page.getByRole('button', { name: 'Use in post' }).click()
  await page.waitForURL(/\/app\/posts\//)
  const postId = page.url().split('/').pop()!
  expect(sql(`select m.kind from "Post" p join "Media" m on m.id=p."mediaIds"[1] where p.id='${postId}'`)).toBe('VIDEO')
  await expect(page.getByLabel('Post video')).toBeVisible()
})

test('publishing the video: Facebook video and Instagram Reel, fetched through a signed link', async () => {
  test.setTimeout(120_000)
  const postId = page.url().split('/').pop()!
  await page.goto('/app/channels')
  await page.locator('a[href="/auth/meta"]').click()
  await page.waitForURL(/connected=3/)
  await page.goto(`/app/posts/${postId}`)
  await page.waitForLoadState('networkidle')
  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: 'Publish now' }).click()
  await expect(page.getByText(/Published to 2 accounts/)).toBeVisible({ timeout: 60_000 })
  const fb = meta.calls.filter((c) => c.method === 'POST' && c.path === '/page-1/videos').at(-1)!
  expect(fb.params.file_url).toMatch(/\/media\/[a-z0-9]+\?exp=\d+&sig=/)
  const ig = meta.calls.filter((c) => c.method === 'POST' && c.path === '/ig-1/media').at(-1)!
  expect(ig.params).toMatchObject({ media_type: 'REELS', share_to_feed: 'true' })
  const fetched = meta.fetchedImages.filter((f) => f.url === fb.params.file_url || f.url === ig.params.video_url)
  expect(fetched.map((f) => `${f.status} ${f.type}`)).toEqual(['200 video/mp4', '200 video/mp4'])
})

test('uploads are checked: wrong type and fake video are refused', async () => {
  const fake = await page.request.post('/api/media/upload?name=x.mp4', { headers: { 'content-type': 'video/mp4' }, data: Buffer.from('not a video at all') })
  expect(fake.status()).toBe(415)
  const exe = await page.request.post('/api/media/upload', { headers: { 'content-type': 'application/x-msdownload' }, data: Buffer.from('MZ') })
  expect(exe.status()).toBe(415)
})

test('another workspace cannot open the video or its file', async ({ browser }) => {
  const other = await browser.newPage()
  await newAccount(other, 'video-other')
  const res = await other.goto(`/app/studio/video/${videoId}`)
  expect(res?.status()).toBe(404)
  const media = sql(`select "outputMediaId" from "Video" where id='${videoId}'`)
  expect((await other.request.get(`/media/${media}`)).status()).toBe(404)
  await other.close()
})

test('AI video: script, voice-over and scenes from my photos', async () => {
  test.skip(!AI, 'set QA_CONTENT_AI=1 to run against the real model')
  test.setTimeout(300_000)
  await page.goto('/app/studio?tab=video')
  await page.getByRole('button', { name: 'Create video with AI' }).click()
  const d = page.getByRole('dialog', { name: 'Create video with AI' })
  await d.locator('textarea').fill('Weekend custom cakes: order by Thursday, delivery across Tbilisi')
  await d.getByRole('button', { name: 'Pick photos & clips' }).click()
  const pick = page.getByRole('dialog', { name: 'Photos and clips' })
  await pick.getByRole('button', { name: /Select (image|video)/ }).first().click()
  await pick.getByRole('button', { name: /^Use/ }).click()
  await d.getByRole('button', { name: /Create · up to/ }).click()
  await page.waitForURL(/\/app\/studio\/video\//, { timeout: 240_000 })
  const id = page.url().split('/').pop()!
  const doc = JSON.parse(sql(`select data::text from "Video" where id='${id}'`))
  console.log('AI VIDEO', JSON.stringify(doc.scenes.map((s: { text: string; voice: string; voiceMs: number }) => [s.text, s.voice, s.voiceMs])), doc.caption)
  expect(doc.scenes.length).toBe(5)
  expect(doc.scenes.every((s: { voiceMediaId: string | null }) => s.voiceMediaId)).toBe(true)
  await page.getByRole('button', { name: 'Render video' }).click()
  await expect(page.getByLabel('Rendered video')).toBeVisible({ timeout: 200_000 })
})
