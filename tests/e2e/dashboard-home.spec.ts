import { expect, test, type Page } from '@playwright/test'
import { startFakeMeta } from './fake-meta'
import { newAccount, sql } from './helpers'

// The Dashboard for someone who does not run ads: how the business is doing
// in one sentence, a few numbers with plain explanations ("?"), goals, what
// to do next — in English, Georgian or Russian. The details are in Analytics.

test.describe.configure({ mode: 'serial' })

const meta = startFakeMeta()
let page: Page
let ws = ''

const metric = (name: string) => page.getByRole('list', { name: 'Your numbers' }).getByRole('listitem', { name, exact: true })
const lang = (name: string) => page.locator('header').getByRole('radiogroup', { name: 'Language' }).getByRole('radio', { name })

test.beforeAll(async ({ browser }) => {
  await meta.listen()
  page = await browser.newPage()
  const a = await newAccount(page, 'home', `Home ${Date.now()}`)
  ws = sql(`select id from "Workspace" where name='${a.brand}'`)
})
test.afterAll(async () => {
  await page.close()
  await meta.close()
})

test('a new account: start measuring, plain explanations, the checklist and the plan', async () => {
  await page.goto('/app/dashboard')
  await expect(page.getByTestId('health')).toHaveText('Let’s start measuring')
  await expect(page.getByRole('region', { name: 'How it is going' })).toContainText('Connect Facebook and Instagram and install the Loudpilot Tag')
  await expect(metric('Leads')).toContainText('Not measured yet')
  await expect(metric('Leads').getByRole('link', { name: /Install the Loudpilot Tag/ })).toHaveAttribute('href', '/app/website/tag')
  // "?" explains a number in plain words.
  await metric('Views').getByRole('button', { name: 'What is this? Views' }).hover()
  await expect(page.getByRole('tooltip')).toHaveText(/How many times your ads and posts appeared on people’s screens/)
  await expect(page.getByRole('region', { name: 'Goals' })).toContainText('No goals yet')
  await expect(page.getByText('Profile readiness')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'What do you want to achieve?' })).toBeVisible()
  // The ad and website details moved to Analytics.
  await expect(page.getByText('Ad campaigns')).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Detailed analytics' })).toHaveAttribute('href', '/app/analytics?days=30')
})

test('Georgian and Russian: the sentence, the explanations and the checklist; the choice is remembered', async () => {
  await lang('ქართული').click()
  await expect(page.getByTestId('health')).toHaveText('დავიწყოთ გაზომვა')
  await expect(metric('Leads')).toContainText('ჯერ არ იზომება')
  // Metric names stay in English.
  await metric('Leads').getByRole('button', { name: 'რა არის ეს? Leads' }).hover()
  await expect(page.getByRole('tooltip')).toHaveText(/ლიდი არის ადამიანი, რომელმაც შეიძლება იყიდოს/)
  await expect(page.getByText('პროფილის მზადყოფნა')).toBeVisible()
  await expect(page.getByRole('link', { name: 'დეტალური ანალიტიკა' })).toBeVisible()

  await lang('Русский').click()
  await expect(page.getByTestId('health')).toHaveText('Начнём измерять')
  await expect(page.getByText('Готовность профиля')).toBeVisible()
  await page.reload()
  await expect(page.getByTestId('health')).toHaveText('Начнём измерять')
  // Analytics explains in the same language.
  await page.goto('/app/analytics')
  await page.getByRole('listitem', { name: 'Became leads' }).getByRole('button', { name: /^Что это\?/ }).hover()
  await expect(page.getByRole('tooltip')).toHaveText(/Лид \(заявка\) — это человек/)

  await page.goto('/app/dashboard')
  await lang('English').click()
  await expect(page.getByTestId('health')).toHaveText('Let’s start measuring')
})

test('with ads and the website tag: more leads than the week before, what a lead cost', async () => {
  await page.goto('/app/channels')
  await page.locator('a[href="/auth/meta"]').click()
  await page.waitForURL(/connected=3/)
  await expect.poll(() => sql(`select count(*) from "AdInsightDay" i join "AdCampaign" c on c.id=i."campaignId" where c."workspaceId"='${ws}'`), { timeout: 20_000 }).toBe('730')

  // Two leads this week, one the week before.
  await page.goto('/app/website/tag')
  const site = sql(`select id from "Site" where "workspaceId"='${ws}'`)
  const t = Date.now()
  for (const [i, ago] of [[1, '1 day'], [2, '2 days'], [3, '10 days']] as const) {
    sql(`insert into "Visitor"(id, "siteId", "cookieId") values ('hv${i}${t}', '${site}', 'hc${i}${t}')`)
    sql(`insert into "Visit"(id, "siteId", "visitorId", sid, "landingUrl", source, medium, "startedAt") values ('hs${i}${t}', '${site}', 'hv${i}${t}', 'hx${i}${t}', 'https://bloom.ge/', 'facebook', 'paid', now() - interval '${ago}')`)
    sql(`insert into "TagEvent"(id, "siteId", "visitId", "visitorId", name, "eventId", "createdAt") values ('he${i}${t}', '${site}', 'hs${i}${t}', 'hv${i}${t}', 'Lead', 'hl${i}${t}', now() - interval '${ago}')`)
  }
  sql(`update "Site" set "lastEventAt"=now() where id='${site}'`)

  await page.goto('/app/dashboard?days=7')
  await expect(page.getByTestId('health')).toHaveText('Things are going well')
  await expect(page.getByRole('region', { name: 'How it is going' })).toContainText('Leads: 2 — 100% more than the 7 days before.')
  await expect(page.getByTestId('metric-leads')).toHaveText('2')
  await expect(page.getByTestId('metric-visits')).toHaveText('2')
  expect(Number((await page.getByTestId('metric-views').getAttribute('title'))!.replace(/,/g, ''))).toBeGreaterThan(0)
  // ₾210 of ads this week ÷ 2 leads.
  await expect(metric('Ad spend')).toContainText('₾210')
  await expect(metric('Ad spend')).toContainText('one lead cost ₾105')

  await lang('Русский').click()
  await expect(page.getByRole('region', { name: 'How it is going' })).toContainText('Заявки: 2 — на 100% больше, чем за прошлые 7 дней.')
  await expect(metric('Ad spend')).toContainText('одна заявка стоила ₾105')
  await lang('English').click()
})
