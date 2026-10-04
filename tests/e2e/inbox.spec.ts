import { expect, test, type Page } from '@playwright/test'
import { startFakeMeta } from './fake-meta'
import { newAccount, sql } from './helpers'

// Inbox: Messenger and Instagram DMs read from Meta, replies sent through
// the Send API, unread counts, the 24-hour rule, missing permissions.

test.describe.configure({ mode: 'serial' })

const meta = startFakeMeta()
const AI = process.env.QA_CONTENT_AI === '1'
let page: Page
let ws = ''

test.beforeAll(async ({ browser }) => {
  await meta.listen()
  page = await browser.newPage()
  await newAccount(page, 'inbox', 'Bloom Bakery')
  await page.goto('/app/channels')
  await page.locator('a[href="/auth/meta"]').click()
  await page.waitForURL(/connected=3/)
  ws = sql(`select "workspaceId" from "SocialAccount" where network='FACEBOOK' order by "createdAt" desc limit 1`)
})
test.afterAll(async () => {
  await page.close()
  await meta.close()
})

test('conversations from Messenger and Instagram, with unread counts', async () => {
  await page.goto('/app/inbox')
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: 'Check for new messages' }).click()
  const list = page.getByRole('list', { name: 'Conversations' })
  await expect(list.getByRole('link', { name: /Nino Beridze/ })).toBeVisible()
  await expect(list.getByRole('link', { name: /@levan\.k/ })).toBeVisible()
  await expect(list.getByRole('link', { name: /Nino Beridze/ })).toContainText('Do you have gluten-free bread today?')
  await expect(page.getByLabel('2 unread conversations')).toBeVisible()
  expect(sql(`select count(*) from "Message" m join "Conversation" c on c.id=m."conversationId" where c."workspaceId"='${ws}'`)).toBe('3')
})

test('opening a thread marks it read; a reply goes through the Send API once', async () => {
  await page.getByRole('list', { name: 'Conversations' }).getByRole('link', { name: /Nino Beridze/ }).click()
  await expect(page.getByRole('heading', { name: 'Nino Beridze' })).toBeVisible()
  await expect(page.getByLabel('Messages').getByText('Hello!')).toBeVisible()
  await expect(page.getByLabel('1 unread conversations')).toBeVisible()

  await page.getByLabel('Reply').fill('Yes! Two loaves left — shall we keep one for you?')
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByLabel('Messages').getByText('Two loaves left')).toBeVisible()
  const sent = meta.calls.filter((c) => c.method === 'POST' && c.path === '/page-1/messages').at(-1)!
  expect(JSON.parse(sent.params.recipient)).toEqual({ id: 'psid-1' })
  expect(sent.params.messaging_type).toBe('RESPONSE')

  // Re-reading the thread from Meta doesn't duplicate the reply.
  await page.getByRole('button', { name: 'Check for new messages' }).click()
  await page.waitForTimeout(1500)
  expect(sql(`select count(*) from "Message" m join "Conversation" c on c.id=m."conversationId" where c."workspaceId"='${ws}' and m.text like 'Yes! Two loaves%'`)).toBe('1')
  await expect(page.getByRole('list', { name: 'Conversations' }).getByRole('link', { name: /Nino Beridze/ })).toContainText('You: Yes! Two loaves')
})

test('outside the 24-hour window: a clear error, the account stays connected', async () => {
  await page.getByLabel('Reply').fill('LATE reply')
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByText(/Meta only lets you reply within 24 hours/)).toBeVisible()
  expect(sql(`select status from "SocialAccount" where "workspaceId"='${ws}' and network='FACEBOOK'`)).toBe('ACTIVE')

  // The Instagram thread is 30 hours old: warned before typing.
  await page.getByRole('list', { name: 'Conversations' }).getByRole('link', { name: /@levan\.k/ }).click()
  await expect(page.getByText(/older than 24 hours/)).toBeVisible()
})

test('AI drafts a reply from the thread', async () => {
  test.skip(!AI, 'set QA_CONTENT_AI=1 to run against the real model')
  test.setTimeout(90_000)
  await page.getByRole('list', { name: 'Conversations' }).getByRole('link', { name: /Nino Beridze/ }).click()
  await expect(page.getByRole('heading', { name: 'Nino Beridze' })).toBeVisible()
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: /Draft with AI/ }).click()
  await expect(page.getByLabel('Reply')).not.toHaveValue('', { timeout: 60_000 })
  console.log('DRAFT', await page.getByLabel('Reply').inputValue())
})

test('accounts connected without messaging permission ask to reconnect', async () => {
  sql(`update "SocialAccount" set scopes=array['pages_show_list'] where "workspaceId"='${ws}' and network='INSTAGRAM'`)
  await page.goto('/app/inbox')
  await expect(page.getByText('Allow messages', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Reconnect Meta' })).toHaveAttribute('href', '/auth/meta')
  await page.getByRole('list', { name: 'Conversations' }).getByRole('link', { name: /@levan\.k/ }).click()
  await expect(page.getByText('Reconnect Meta and allow messages to reply from Loudpilot.')).toBeVisible()
})

test('another workspace cannot open or answer the conversation', async ({ browser }) => {
  const conv = sql(`select id from "Conversation" where "workspaceId"='${ws}' and network='FACEBOOK'`)
  const other = await browser.newPage()
  await newAccount(other, 'inbox-other')
  await other.goto(`/app/inbox?c=${conv}`)
  await expect(other.getByRole('heading', { name: 'Nino Beridze' })).toHaveCount(0)
  await other.close()
})
