import { expect, test, type Page } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { newAccount, sql } from './helpers'

// Post images: upload, design in the Studio and edit an image in the Studio,
// each coming back into the same post. AI images are gated (real model).

test.describe.configure({ mode: 'serial' })
let page: Page
let postId = ''
const AI = process.env.QA_CONTENT_AI === '1'

// 1×1 red PNG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64')

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage()
  await newAccount(page, 'pmedia', 'Bloom Bakery')
})
test.afterAll(async () => page.close())

test('three ways to add an image', async () => {
  await page.goto('/app/posts/new')
  await expect(page.getByRole('button', { name: /Add images: upload/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Design in Studio/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Generate with AI/ })).toBeVisible()
  await page.getByRole('button', { name: /Generate with AI/ }).click()
  await expect(page.getByLabel('Describe the image')).toBeVisible()
  await expect(page.getByRole('button', { name: /Generate · 4 credits/ })).toBeVisible()
})

test('design in Studio from an empty new post comes back into it', async () => {
  await page.goto('/app/posts/new')
  await page.getByPlaceholder('What do you want to share?').fill('Fresh croissants every morning')
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: /Design in Studio/ }).click()
  await page.waitForURL(/\/app\/studio\?post=/)
  postId = new URL(page.url()).searchParams.get('post')!
  await expect(page.getByText('Designing an image for your post')).toBeVisible()
  expect(sql(`select status||':'||content from "Post" where id='${postId}'`)).toBe('DRAFT:Fresh croissants every morning')

  await page.getByRole('button', { name: /Blank/ }).first().click()
  await page.waitForURL(/\/app\/studio\/[^?]+\?post=/)
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: 'Save to post' }).click()
  await page.waitForURL(new RegExp(`/app/posts/${postId}`))
  expect(sql(`select cardinality("mediaIds") from "Post" where id='${postId}'`)).toBe('1')
  await expect(page.getByRole('button', { name: 'Edit image in Studio' })).toBeVisible()
})

test('edit an uploaded image in Studio replaces it in place', async () => {
  await page.goto(`/app/posts/${postId}`)
  await page.getByRole('button', { name: /Add images: upload/ }).click()
  await page.locator('input[type=file]').setInputFiles({ name: 'red.png', mimeType: 'image/png', buffer: PNG })
  const dialog = page.getByRole('dialog', { name: 'Add images' })
  await expect(dialog.getByRole('button', { name: 'Deselect image' })).toHaveCount(1)
  await dialog.getByRole('button', { name: /^Add/ }).last().click()
  await expect(page.getByRole('button', { name: 'Edit image in Studio' })).toHaveCount(2)
  const before = sql(`select "mediaIds"[1] from "Post" where id='${postId}'`)
  await page.getByRole('button', { name: 'Edit image in Studio' }).last().click()
  await page.waitForURL(/\/app\/studio\/[^?]+\?post=.*&replace=/)
  const replaced = new URL(page.url()).searchParams.get('replace')!
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: 'Save to post' }).click()
  await page.waitForURL(new RegExp(`/app/posts/${postId}`))
  const ids = sql(`select array_to_string("mediaIds", ',') from "Post" where id='${postId}'`).split(',')
  expect(ids).toHaveLength(2)
  expect(ids[0]).toBe(before)
  expect(ids).not.toContain(replaced)
})

test('media files are served inert; JPEG copies only of pictures of a sane size', async () => {
  const ws = sql(`select "workspaceId" from "Post" where id='${postId}'`)
  const add = (bytes: Buffer) => {
    const id = `pm${Date.now()}${Math.floor(Math.random() * 1e4)}`
    const rel = `${ws}/${id}.png`
    mkdirSync(path.join('storage', ws), { recursive: true })
    writeFileSync(path.join('storage', rel), bytes)
    sql(`insert into "Media"(id,"workspaceId",kind,mime,path,bytes) values ('${id}','${ws}','IMAGE','image/png','${rel}',${bytes.length})`)
    return id
  }
  const ok = add(PNG)
  const res = await page.request.get(`/media/${ok}`)
  expect(res.headers()['x-content-type-options']).toBe('nosniff')
  expect(res.headers()['content-security-policy']).toBe("default-src 'none'; sandbox")
  const jpeg = await page.request.get(`/media/${ok}?format=jpeg`)
  expect(jpeg.status()).toBe(200)
  expect(jpeg.headers()['content-type']).toBe('image/jpeg')
  // A picture whose header says 9000 pixels wide never reaches ffmpeg.
  const big = Buffer.from(PNG)
  big.writeUInt32BE(9000, 16)
  expect((await page.request.get(`/media/${add(big)}?format=jpeg`)).status()).toBe(500)
})

test('AI image is added to the post and charged', async () => {
  test.skip(!AI, 'set QA_CONTENT_AI=1 to run against the real model')
  test.setTimeout(180_000)
  await page.goto(`/app/posts/${postId}`)
  await page.getByRole('button', { name: /Generate with AI/ }).click()
  await page.getByRole('radio', { name: 'My own description' }).check()
  await page.getByLabel('Describe the image').fill('Croissants on a wooden table, morning light')
  await page.getByRole('radiogroup', { name: 'Image style' }).getByRole('radio', { name: 'Cinematic' }).click()
  await page.getByRole('button', { name: /Generate · 4 credits/ }).click()
  await expect(page.getByRole('button', { name: 'Edit image in Studio' })).toHaveCount(3, { timeout: 150_000 })
})
