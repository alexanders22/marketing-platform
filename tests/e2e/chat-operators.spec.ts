import { expect, test, type Page } from '@playwright/test'
import { startFakeSocial, TG_OWNER, TG_STRANGER } from './fake-social'
import { latestMail, newAccount, sql, uniqueEmail } from './helpers'

// Website chat operators: hand-overs go to a free operator in turn, a busy
// one is skipped, only the assigned operator is e-mailed, "Mine" lists
// one's own chats, and a chat can be passed to someone else.

test.describe.configure({ mode: 'serial' })

let page: Page
let ws = ''
let key = ''
let owner = ''
const ana = uniqueEmail('ana-operator')

// A visitor writes a red-flag message: the chat is handed over at once.
// Each visitor has their own IP (one IP may start only 5 chats an hour).
async function refund(n: number) {
  const res = await page.request.post('/api/chat/send', {
    headers: { 'content-type': 'text/plain', 'x-forwarded-for': `10.0.0.${n}` },
    data: JSON.stringify({ s: key, v: `visitor-${Date.now()}-${n}`, text: `I want a refund #${n}` }),
  })
  expect(res.status()).toBe(200)
  const conv = sql(`select c.id from "ChatConversation" c join "ChatMessage" m on m."conversationId"=c.id where c."workspaceId"='${ws}' and m.text='I want a refund #${n}'`)
  return { id: conv, operator: () => sql(`select coalesce(u.email, '-') from "ChatConversation" c left join "ChatOperator" o on o.id=c."operatorId" left join "User" u on u.id=o."userId" where c.id='${conv}'`) }
}

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage()
  const acc = await newAccount(page, 'ops', `Ops ${Date.now()}`)
  owner = acc.email
  ws = sql(`select id from "Workspace" where name='${acc.brand}'`)
  const account = sql(`select "accountId" from "Workspace" where id='${ws}'`)
  // A teammate (as if invited and signed up).
  const userId = `u${Date.now()}`
  sql(`insert into "User"(id, email, name) values ('${userId}', '${ana}', 'Ana')`)
  sql(`insert into "AccountMember"(id, "accountId", "userId", role) values ('m${userId}', '${account}', '${userId}', 'EDITOR')`)
})
test.afterAll(async () => {
  await page?.close()
})

test('add operators and switch the chat on', async () => {
  await page.goto('/app/chat/settings')
  await page.getByLabel('Red-flag topics').fill('refund')
  await page.getByLabel('Show the chat on my website').check()
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible()
  key = sql(`select key from "Site" where "workspaceId"='${ws}'`)

  for (const [i, who] of [owner, ana].entries()) {
    const value = await page.getByLabel('Team member').locator('option', { hasText: who }).getAttribute('value')
    await page.getByLabel('Team member').selectOption(value!)
    await page.getByRole('button', { name: 'Add operator' }).click()
    await expect(page.getByRole('list', { name: 'Operators' }).getByRole('listitem')).toHaveCount(i + 1)
  }
  await expect(page.getByRole('list', { name: 'Operators' })).toContainText('Ana')
  await expect(page.getByText('Everyone on the team is an operator.')).toBeVisible()
  await expect(page.getByLabel('Also e-mail every hand-over to')).toBeVisible()
})

test('hand-overs go to a free operator in turn; only they are e-mailed', async () => {
  const first = await refund(1)
  expect(first.operator()).toBe(owner)
  await latestMail(owner, 'Website chat')

  // The owner is busy now: the next one goes to Ana.
  const second = await refund(2)
  expect(second.operator()).toBe(ana)
  const mail = await latestMail(ana, 'Website chat')
  expect(mail.Text).toContain('Assigned to: Ana')
  expect(mail.Text).toContain('I want a refund #2')

  // Both busy with one chat: whoever waited longest.
  expect((await refund(3)).operator()).toBe(owner)

  // Ana's chat is closed: she is free again and gets the next one.
  sql(`update "ChatConversation" set status='CLOSED' where id='${second.id}'`)
  expect((await refund(4)).operator()).toBe(ana)

  // An operator who doesn't take new chats is skipped.
  await page.goto('/app/chat/settings')
  const anaRow = page.getByRole('list', { name: 'Operators' }).getByRole('listitem').filter({ hasText: 'Ana' })
  await anaRow.getByLabel('Takes new chats').uncheck()
  await expect.poll(() => sql(`select active from "ChatOperator" o join "User" u on u.id=o."userId" where u.email='${ana}'`)).toBe('f')
  expect((await refund(5)).operator()).toBe(owner)
})

test('"Mine", the assignee in the list, and passing a chat on', async () => {
  await page.goto('/app/chat?f=mine')
  const list = page.getByRole('list', { name: 'Chats' })
  await expect(list.getByRole('link')).toHaveCount(3)
  await expect(list).not.toContainText('#4')

  const first = sql(`select c.id from "ChatConversation" c join "ChatMessage" m on m."conversationId"=c.id where c."workspaceId"='${ws}' and m.text='I want a refund #1'`)
  await page.goto(`/app/chat?c=${first}`)
  await page.getByLabel('Operator').selectOption({ label: 'Ana' })
  await expect.poll(() => sql(`select u.email from "ChatConversation" c join "ChatOperator" o on o.id=c."operatorId" join "User" u on u.id=o."userId" where c.id='${first}'`)).toBe(ana)
  await latestMail(ana, 'Passed to you by')
  await expect(page.getByRole('list', { name: 'Chats' }).locator(`a[href*="c=${first}"]`)).toContainText('Ana')
})

test('a reply makes an unassigned chat the replier’s', async () => {
  sql(`update "ChatOperator" set active=false where "workspaceId"='${ws}'`)
  const chat = await refund(6)
  expect(chat.operator()).toBe('-')
  await page.goto(`/app/chat?c=${chat.id}`)
  await page.getByLabel('Your answer').fill('Hi, I can help with that.')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect.poll(() => chat.operator()).toBe(owner)
})

test('one IP can start only a few new chats an hour on a site', async () => {
  const start = (n: number) =>
    page.request.post('/api/chat/send', {
      headers: { 'content-type': 'text/plain', 'x-forwarded-for': '10.9.9.9' },
      data: JSON.stringify({ s: key, v: `flood-${Date.now()}-${n}`, text: `I want a refund, flood ${n}` }),
    })
  for (let n = 1; n <= 5; n++) expect((await start(n)).status()).toBe(200)
  expect((await start(6)).status()).toBe(429)
  expect(sql(`select count(*) from "ChatMessage" m join "ChatConversation" c on c.id=m."conversationId" where c."workspaceId"='${ws}' and m.text like 'I want a refund, flood %'`)).toBe('5')
})

test('Telegram alerts: the link has a random code that works once, and not from two chats', async () => {
  const social = startFakeSocial()
  await social.listen()
  try {
    await page.goto('/app/chat/settings')
    const box = page.getByRole('group', { name: /^(Shared Telegram \(every hand-over\)|Telegram alerts)$/ })
    const code = async () => {
      await box.getByRole('button', { name: 'Connect Telegram' }).click()
      return new URL((await box.getByRole('link', { name: 'the Loudpilot bot' }).getAttribute('href'))!).searchParams.get('start')!
    }
    const first = await code()
    expect(first).toMatch(/^[\w-]{20,}$/)
    // Someone else who saw the link sends it too: it stops working.
    social.tgSay(TG_STRANGER, `/start ${first}`)
    social.tgSay(TG_OWNER, `/start ${first}`)
    await box.getByRole('button', { name: /Start was pressed/ }).click()
    await expect(box.getByText(/more than one Telegram chat/)).toBeVisible()

    await page.reload()
    const second = await code()
    expect(second).not.toBe(first)
    social.tgSay(TG_OWNER, `/start ${second}`)
    await box.getByRole('button', { name: /Start was pressed/ }).click()
    await expect(page.getByText(`User ${TG_OWNER}`)).toBeVisible()
    expect(sql(`select "telegramChatId" from "ChatBot" where "workspaceId"='${ws}'`)).toBe(String(TG_OWNER))
    expect(sql(`select count(*) from "TelegramCode" where "workspaceId"='${ws}' and "usedAt" is not null`)).toBe('2')
  } finally {
    await social.close()
  }
})
