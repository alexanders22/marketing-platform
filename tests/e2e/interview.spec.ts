import { expect, test, type Page } from '@playwright/test'
import { newAccount, sql } from './helpers'

// Strategy interview: "what we know" → questions in the business's words →
// insights in money → goal with a reality check → plan. The interview is
// seeded (the AI writes it in real use); composing it and building the plan
// call the real model only with QA_STRATEGY_AI=1.

test.describe.configure({ mode: 'serial' })

const AI = process.env.QA_STRATEGY_AI === '1'
let page: Page
let ws = ''
const id = `iv${Date.now()}`

// A parcel service: customers are online shops.
const data = {
  language: 'English',
  currency: 'GEL',
  vocabulary: { customer: 'shop', customers: 'shops' },
  known: [
    { label: 'Business', text: 'Parcel delivery across Georgia and to the EU' },
    { label: 'Ads', text: '₾20 per enquiry over the last 60 days' },
  ],
  confirmed: null,
  correction: '',
  questions: [
    { key: 'customer_type', chapter: 'know', kind: 'choice', text: 'Who sends most of your parcels?', options: [{ label: 'Online shops', value: 'B2B' }, { label: 'Private senders', value: 'B2C' }], hint: '', estimate: null },
    { key: 'avg_sale', chapter: 'economics', kind: 'money', text: 'What does one shop pay you a month?', options: [{ label: 'Under ₾100', value: 60 }, { label: '₾100–300', value: 200 }, { label: '₾300+', value: 500 }], hint: 'Small e-shops usually send 40–120 parcels a month', estimate: 200 },
    { key: 'margin', chapter: 'economics', kind: 'percent', text: 'What is your margin per parcel?', options: [{ label: 'Under 15%', value: 10 }, { label: '15–25%', value: 20 }], hint: 'Courier services usually run 15–25%', estimate: 20 },
    { key: 'purchases', chapter: 'economics', kind: 'number', text: 'How many months a year does a shop send with you?', options: [{ label: '1–6', value: 4 }, { label: 'All year', value: 12 }], hint: '', estimate: 10 },
    { key: 'lead_to_sale', chapter: 'sales', kind: 'percent', text: 'Out of 10 shops that ask, how many sign?', options: [{ label: '1 or fewer', value: 10 }, { label: '2–3', value: 25 }], hint: '', estimate: 20 },
    { key: 'capacity', chapter: 'sales', kind: 'number', text: 'How many new shops a month can you take on?', options: [{ label: 'Up to 5', value: 5 }, { label: '5–20', value: 15 }], hint: '', estimate: null },
    { key: 'why_us', chapter: 'sales', kind: 'text', text: 'Why do shops choose you?', options: [], hint: '', estimate: null },
  ],
  answers: {},
  costs: { perLead: 20, perSale: null, source: 'ads' },
  estimateLeadToSale: 20,
  adSpendMonthly: 400,
  offerings: ['Domestic delivery', 'EU delivery'],
  goal: null,
  step: 0,
}

const fact = (key: string) => sql(`select source||'|'||(value->>'value')||'|'||(value->>'label') from "BusinessFact" where "workspaceId"='${ws}' and key='${key}'`)

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage()
  const { email } = await newAccount(page, 'interview', 'Geo Parcel')
  ws = sql(`select w.id from "Workspace" w join "AccountMember" m on m."accountId"=w."accountId" join "User" u on u.id=m."userId" where u.email='${email}'`)
  // Timestamps are UTC (the column has no zone).
  sql(`insert into "StrategyInterview" (id, "workspaceId", data, "createdAt", "updatedAt") values ('${id}', '${ws}', '${JSON.stringify(data).replace(/'/g, "''")}'::jsonb, now() at time zone 'utc', now() at time zone 'utc')`)
})
test.afterAll(async () => {
  await page.close()
})

const bot = (text: string | RegExp) => page.getByText(text).last()
const chip = (name: string | RegExp) => page.getByRole('button', { name, exact: typeof name === 'string' })

test('the Strategy page starts with the interview; the quick form stays', async () => {
  await page.goto('/app/strategy')
  await expect(page.getByRole('link', { name: 'Quick form' })).toHaveAttribute('href', '/app/strategy/new')
  await page.getByRole('link', { name: 'New plan' }).click()
  await page.waitForURL(/\/app\/strategy\/interview$/)
  await expect(page.getByRole('heading', { name: 'Strategy interview' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Continue where you left off' })).toHaveAttribute('href', `/app/strategy/interview/${id}`)
})

test('what we know: corrected in the owner’s words', async () => {
  await page.goto(`/app/strategy/interview/${id}`)
  const known = page.getByRole('definition').filter({ hasText: 'Parcel delivery across Georgia' })
  await expect(known).toBeVisible()
  await chip(/Fix something/).click()
  await page.getByLabel('What is different').fill('Mostly online shops; prices start at 5 ₾')
  await chip('Send').click()
  await expect(bot('Who sends most of your parcels?')).toBeVisible()
  expect(fact('correction')).toBe('OWNER|Mostly online shops; prices start at 5 ₾|Mostly online shops; prices start at 5 ₾')
})

test('answers turn into money: value of a shop, cost of an enquiry, capacity', async () => {
  await chip('Online shops').click()
  await expect(bot('What does one shop pay you a month?')).toBeVisible()
  await expect(page.getByText('Small e-shops usually send 40–120 parcels a month')).toBeVisible()
  await chip('₾100–300').click()

  // Own number instead of the chips.
  await expect(bot('What is your margin per parcel?')).toBeVisible()
  await chip('Other…').click()
  await page.getByLabel('Your answer').fill('120')
  await chip('Send').click()
  await expect(page.getByText('Enter a percent from 0 to 100')).toBeVisible()
  await page.getByLabel('Your answer').fill('25')
  await chip('Send').click()

  // "Not sure" takes the typical value and says so.
  await expect(bot('How many months a year does a shop send with you?')).toBeVisible()
  await chip('Not sure').click()
  await expect(page.getByText('Not sure — about 10')).toBeVisible()
  // 200 × 25% × 10 = 500 a year; ads bring a shop for 20 ÷ 20% = 100.
  await expect(page.getByRole('note').filter({ hasText: 'One shop brings you about ₾500 profit in a year' })).toContainText('Your ads bring one for about ₾100 — that pays off.')

  await expect(bot('Out of 10 shops that ask, how many sign?')).toBeVisible()
  await chip('2–3').click()
  await expect(page.getByRole('note').filter({ hasText: 'So an enquiry may cost up to ₾125; right now one costs ₾20.' })).toBeVisible()
  // Back: the last answer is asked again.
  await page.getByRole('button', { name: 'Change the last answer' }).click()
  await expect(page.getByText('So an enquiry may cost up to ₾125')).toHaveCount(0)
  await chip('1 or fewer').click()
  await expect(page.getByRole('note').filter({ hasText: 'So an enquiry may cost up to ₾50; right now one costs ₾20.' })).toBeVisible()

  await expect(bot('How many new shops a month can you take on?')).toBeVisible()
  await chip('Up to 5').click()
  await expect(page.getByText('Noted: ads will aim for no more than about 5 new shops a month.')).toBeVisible()
  await expect(bot('Why do shops choose you?')).toBeVisible()
  await chip('Skip').click()
  await expect(page.getByText('Skipped')).toBeVisible()

  expect(fact('customer_type')).toBe('OWNER|B2B|Online shops')
  expect(fact('avg_sale')).toBe('OWNER|200|₾100–300')
  expect(fact('margin')).toBe('OWNER|25|25%')
  expect(fact('purchases')).toBe('ESTIMATE|10|Not sure — about 10')
  expect(fact('lead_to_sale')).toBe('OWNER|10|1 or fewer')
  expect(fact('capacity')).toBe('OWNER|5|Up to 5')
  // Skipped answers are not facts.
  expect(fact('why_us')).toBe('')
  expect(sql(`select (data->'answers'->'why_us'->>'source')||':'||(data->>'step') from "StrategyInterview" where id='${id}'`)).toBe('SKIPPED:8')
})

test('goal: suggestions from capacity, reality check against budget, realistic or stretch', async () => {
  await expect(bot('Now the goal. What should advertising bring you first?')).toBeVisible()
  await chip('New shops').click()
  await chip('2 months').click()
  // Up to 5 a month × 2 months: 1, 3, 5, 10.
  await expect(bot('How many new shops would you like in 2 months?')).toBeVisible()
  for (const n of ['1', '3', '5', '10']) await expect(chip(n)).toBeVisible()
  await chip('10').click()
  await expect(bot(/What can you spend on ads per month\? You spent about ₾400/)).toBeVisible()
  await chip('₾400').click()
  await expect(bot('Anything to focus on?')).toBeVisible()
  await chip('EU delivery').click()
  await chip('Done').click()

  // A shop costs 20 ÷ 10% = 200: 400 × 2 months buys 4, not 10.
  const goal = page.getByText(/new shops in 2 months$/)
  await expect(goal).toHaveText('4 new shops in 2 months')
  await expect(page.getByRole('note').filter({ hasText: 'At about ₾200 per shop (your own ads), ₾400 a month brings around 4 new shops, not 10.' })).toContainText(
    'For 10 you’d need about ₾1,000 a month.',
  )
  await expect(page.getByText('EU delivery', { exact: true }).last()).toBeVisible()
  await chip('Keep 10 and show what it takes').click()
  await expect(goal).toHaveText('10 new shops in 2 months')
  await expect(page.getByRole('button', { name: /^Build my plan/ })).toBeVisible()
})

test('the dossier shows the business numbers', async () => {
  await page.goto('/app/dossier')
  const numbers = page.getByLabel('Business numbers')
  await expect(numbers).toContainText('Margin25%')
  await expect(numbers).toContainText('Not sure — about 10(typical)')
  await expect(page.getByRole('link', { name: 'Update in the interview' })).toHaveAttribute('href', '/app/strategy/interview')
})

test('another workspace cannot open the interview', async ({ browser }) => {
  const other = await browser.newPage()
  await newAccount(other, 'interview-other')
  const res = await other.goto(`/app/strategy/interview/${id}`)
  expect(res?.status()).toBe(404)
  await other.close()
})

test('AI: the interview is written for the business and skips what the owner already told', async () => {
  test.skip(!AI, 'set QA_STRATEGY_AI=1 to run against the real model')
  test.setTimeout(240_000)
  await page.goto('/app/strategy/interview')
  await page.getByRole('button', { name: /Start over|Start the interview/ }).click()
  await page.waitForURL(/\/app\/strategy\/interview\/c/, { timeout: 120_000 })
  const row = sql(`select data::text from "StrategyInterview" where "workspaceId"='${ws}' and id<>'${id}' order by "createdAt" desc limit 1`)
  const composed = JSON.parse(row)
  // Fresh answers are not asked again.
  expect(composed.questions.map((q: { key: string }) => q.key)).not.toContain('margin')
  expect(composed.answers.margin.value).toBe(25)
})
