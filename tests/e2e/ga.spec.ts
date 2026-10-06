import { expect, test, type Page } from '@playwright/test'
import { startFakeGoogle } from './fake-google'
import { newAccount, sql } from './helpers'

// Google Analytics 4: connect (one or several properties), daily numbers in
// the dashboard next to ad spend, errors that ask for a reconnect.

test.describe.configure({ mode: 'serial' })

const google = startFakeGoogle()
let page: Page
let ws = ''

test.beforeAll(async ({ browser }) => {
  await google.listen()
  page = await browser.newPage()
  const { email } = await newAccount(page, 'ga', 'Bloom Bakery')
  ws = sql(`select w.id from "Workspace" w join "AccountMember" m on m."accountId"=w."accountId" join "User" u on u.id=m."userId" where u.email='${email}'`)
})
test.afterAll(async () => {
  await page.close()
  await google.close()
})

const section = () => page.locator('section', { has: page.getByRole('heading', { name: 'Google Analytics' }) })

test('connect one property: read right away, numbers on the dashboard', async () => {
  await page.goto('/app/channels')
  await section().getByRole('link', { name: 'Connect' }).click()
  await page.waitForURL(/\/app\/channels\?connected=1/)
  await expect(section().getByText('Bloom Bakery website')).toBeVisible()
  // The first read happens after the response: wait for the rows.
  await expect.poll(() => sql(`select count(*) from "WebsiteDay" where "workspaceId"='${ws}'`), { timeout: 20_000 }).toBe('14')
  // Tokens are stored encrypted, never in clear.
  const enc = sql(`select "refreshTokenEnc" from "SocialAccount" where "workspaceId"='${ws}' and network='GOOGLE_ANALYTICS'`)
  expect(enc).not.toContain('fake-refresh')
  expect(google.reports.map((r) => r.dimensions.join('+')).sort()).toEqual(['date', 'date+eventName', 'date+sessionCampaignName', 'date+sessionDefaultChannelGroup'])

  await page.goto('/app/dashboard?days=30')
  const site = page.getByRole('region', { name: 'Website' })
  await expect(site).toBeVisible()
  // 14 days of 100…113 visits, 3 key events a day (2 sign-ups, 1 lead).
  await expect(site.getByRole('group', { name: 'Visits', exact: true })).toContainText('1,491')
  await expect(site.getByText('42', { exact: true })).toBeVisible()
  await expect(site.getByText('sign_up')).toBeVisible()
  await expect(site.getByText('generate_lead')).toBeVisible()
  await expect(site.getByText('Paid Social')).toBeVisible()
})

test('several properties: pick the website on the Channels page', async () => {
  google.setProperties([
    { property: 'properties/111', displayName: 'Bloom Bakery website' },
    { property: 'properties/222', displayName: 'Bloom Shop' },
  ])
  google.reports.length = 0
  await page.goto('/app/channels')
  await section().getByRole('link', { name: 'Add or refresh' }).click()
  await page.waitForURL(/\/app\/channels\?ga=pick/)
  const picker = page.getByRole('radiogroup', { name: 'Google Analytics property' })
  await picker.getByRole('radio', { name: /Bloom Shop/ }).check()
  await page.getByRole('button', { name: 'Use this property' }).click()
  await page.waitForURL(/connected=1/)
  await expect(section().getByText('Bloom Shop')).toBeVisible()
  await expect.poll(() => google.reports.some((r) => r.property === 'properties/222'), { timeout: 20_000 }).toBe(true)
  expect(sql(`select count(*) from "SocialAccount" where "workspaceId"='${ws}' and network='GOOGLE_ANALYTICS' and "externalId" like 'pending:%'`)).toBe('0')
})

test('Google refusing access marks the property for reconnecting', async () => {
  google.failData({ status: 403, message: 'User does not have sufficient permissions for this property.' })
  await page.goto('/app/channels')
  await section().getByRole('button', { name: 'Update website numbers now' }).first().click()
  await expect(section().getByText(/Needs reconnecting — User does not have sufficient permissions/).first()).toBeVisible()
  google.failData(null)
})

test('without the analytics permission the connection is refused', async () => {
  google.setScope('openid')
  await page.goto('/app/channels')
  await section().getByRole('link', { name: 'Add or refresh' }).click()
  await page.waitForURL(/error=ga-api/)
  await expect(page.getByText('Google did not accept the connection. Please try again.')).toBeVisible()
  google.setScope(null)
})

test('a website goal: sign-ups a week, checked against Google Analytics, shown on the dashboard', async () => {
  await page.goto('/app/goals')
  await page.getByRole('button', { name: 'New goal' }).click()
  const dialog = page.getByRole('dialog', { name: 'New goal' })
  await dialog.getByRole('button', { name: /^Website/ }).click()
  await dialog.locator('select').filter({ has: page.locator('option', { hasText: 'Website visits' }) }).selectOption('site_key_events')
  await dialog.getByLabel('Key event', { exact: true }).selectOption('sign_up')
  await dialog.locator('input[inputmode], input[type=number], input[type=text]').last().fill('40')
  await dialog.getByRole('button', { name: /Save|Create|Add goal/ }).click()
  await expect(dialog).toHaveCount(0)
  // Two properties are connected by now (earlier test), 2 sign-ups a day
  // each: 28 over the last 7 complete days, under 85% of 40.
  const goals = page.getByRole('list', { name: 'Goals' })
  await expect(goals.getByText('Key events (sign-ups, leads, sales) — Website · sign_up')).toBeVisible()
  await expect(goals.getByRole('listitem').first()).toContainText(/28\s*\/\s*≥\s*40/)
  await expect(goals.getByText('Off track')).toBeVisible()

  await page.goto('/app/dashboard')
  const card = page.getByRole('region', { name: 'Goals' })
  await expect(card.getByText(/1 active · 1 need attention/)).toBeVisible()
  await expect(card.getByText('Key events (sign-ups, leads, sales) — Website · sign_up')).toBeVisible()
})

test('dashboard date filter: presets and a custom range compared with the days before', async () => {
  await page.goto('/app/dashboard')
  await page.getByRole('button', { name: 'Dates' }).click()
  const dlg = page.getByRole('dialog', { name: 'Choose dates' })
  const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10)
  await dlg.getByLabel('From').fill(day(6))
  await dlg.getByLabel('To').fill(day(2))
  await dlg.getByRole('button', { name: 'Apply' }).click()
  await page.waitForURL(new RegExp(`from=${day(6)}&to=${day(2)}`))
  await expect(page.getByText(`${day(6)} – ${day(2)} · ads, posts and website in one place`)).toBeVisible()
  await expect(page.getByRole('button', { name: `${day(6)} – ${day(2)}`, exact: true })).toBeVisible()
  // Five days of the fake: 107…111 visits = 545 per property, two properties.
  await expect(page.getByRole('region', { name: 'Website' }).getByRole('group', { name: 'Visits', exact: true }).getByText('1,090')).toBeVisible()
  // A preset.
  await page.getByRole('button', { name: `${day(6)} – ${day(2)}`, exact: true }).click()
  await page.getByRole('dialog', { name: 'Choose dates' }).getByRole('button', { name: 'This month' }).click()
  await page.waitForURL(/from=\d{4}-\d{2}-01&to=/)
  // Back to the standard periods.
  await page.getByRole('navigation', { name: 'Period' }).getByRole('link', { name: '7 days' }).click()
  await page.waitForURL(/days=7/)
  await expect(page.getByRole('button', { name: 'Dates' })).toBeVisible()
})
