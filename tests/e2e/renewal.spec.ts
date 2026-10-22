import { expect, test, type Page } from '@playwright/test'
import { createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { latestMail, linkFrom, MAILPIT, newAccount, sql } from './helpers'

// Paid periods don't renew by themselves: owners are emailed before the end
// and on the day it ends, once each, and the email's button leads to a
// one-click renewal. Auto-renewing accounts get no reminder.

test.describe.configure({ mode: 'serial' })

let page: Page
let email: string
let accountId: string
const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^"|"$/g, '')]),
)
const cron = createHmac('sha256', `cron:${env.KHMA_ENCRYPTION_KEY}`).update('tick').digest('hex')
const tick = () => page.request.post('/api/cron/tick?reminders=1', { headers: { 'x-khma-cron': cron } }).then((r) => r.json())
const mails = async (subject: string) => {
  const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}" subject:"${subject}"`)}&limit=20`)
  return ((await res.json()) as { messages: unknown[] }).messages.length
}

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage()
  ;({ email } = await newAccount(page, 'renew'))
  accountId = sql(`select m."accountId" from "AccountMember" m join "User" u on u.id=m."userId" where u.email='${email}'`)
  // A Business month paid until the day after tomorrow, trial long over.
  sql(`update "Account" set plan='TEAM', "billingCycle"='MONTHLY', "trialEndsAt"=now() - interval '40 days', "paidUntil"=now() + interval '2 days' where id='${accountId}'`)
})
test.afterAll(() => page.close())

test('three days before the end: one reminder, its button opens a one-click renewal', async () => {
  expect((await tick()).reminders).toBeGreaterThanOrEqual(1)
  const mail = await latestMail(email, 'Your Loudpilot Business plan ends on')
  expect(mail.Text).toContain('Your Business plan is paid until')
  await tick()
  expect(await mails('Your Loudpilot Business plan ends on')).toBe(1)

  await page.goto(linkFrom(mail.Text, '/app/credits?renew=1'))
  const renew = page.getByRole('region', { name: 'Renew your plan' })
  await expect(renew.getByText(/^Paid until .*Renewing adds a month from that date\.$/)).toBeVisible()
  await expect(renew.getByRole('button', { name: 'Renew 1 month · $75 + VAT' })).toBeVisible()
})

test('the day it ends: one more reminder and a renew banner in the app', async () => {
  sql(`update "Account" set "paidUntil"=now() - interval '1 hour' where id='${accountId}'`)
  await tick()
  const mail = await latestMail(email, 'Your Loudpilot Business plan has ended')
  expect(mail.Text).toContain('Paid features are paused until you renew')
  await tick()
  expect(await mails('Your Loudpilot Business plan has ended')).toBe(1)

  await page.goto('/app/dashboard')
  await expect(page.getByText(/^Your plan ended on /)).toBeVisible()
  await page.getByRole('link', { name: 'Renew', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Renew your plan' }).getByText(/^It ended on .*Renewing starts a new month today\.$/)).toBeVisible()
})

test('an auto-renewing plan gets no reminder', async () => {
  const until = `now() + interval '1 day'`
  sql(`update "Account" set "paidUntil"=${until}, "renewalReminder"=null where id='${accountId}'`)
  sql(`insert into "Subscription"(id, "accountId", plan, cycle, "refId", status, "checkedAt", "updatedAt") values ('sub-renew-${Date.now()}', '${accountId}', 'TEAM', 'MONTHLY', 'ref', 'ACTIVE', now(), now())`)
  try {
    await tick()
    expect(sql(`select coalesce("renewalReminder", '') from "Account" where id='${accountId}'`)).toBe('')
  } finally {
    sql(`delete from "Subscription" where "accountId"='${accountId}'`)
  }
})
