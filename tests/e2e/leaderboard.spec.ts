import { expect, test, type Page } from '@playwright/test'
import { startFakeMeta } from './fake-meta'
import { newAccount, sql } from './helpers'

// "You vs competitors": public Instagram numbers (business discovery through
// the company's own connected account, fake Meta) — reactions per post,
// followers and their weekly growth, posts in 30 days; on the Dashboard and
// the Competitors page, explained in the chosen language.

test.describe.configure({ mode: 'serial' })

const meta = startFakeMeta()
let page: Page
let ws = ''

const board = () => page.getByRole('region', { name: 'You vs competitors' })
const row = (username: string) => board().getByRole('row').filter({ hasText: `@${username}` })

test.beforeAll(async ({ browser }) => {
  await meta.listen()
  page = await browser.newPage()
  const a = await newAccount(page, 'board', `Board ${Date.now()}`)
  ws = sql(`select id from "Workspace" where name='${a.brand}'`)
})
test.afterAll(async () => {
  await page.close()
  await meta.close()
})

test('first connect Instagram, then add competitors', async () => {
  await page.goto('/app/dashboard')
  await expect(board()).toContainText('Connect your Instagram business account')
  await expect(board().getByRole('link', { name: 'Connect Instagram' })).toHaveAttribute('href', '/app/channels')

  await page.goto('/app/channels')
  await page.locator('a[href="/auth/meta"]').click()
  await page.waitForURL(/connected=3/)
  await page.goto('/app/dashboard')
  await expect(board()).toContainText('Add your competitors’ Instagram')
})

test('the leaderboard: reactions per post, followers with the week’s growth, posts in 30 days', async () => {
  const t = Date.now()
  sql(
    `insert into "Competitor"(id, "workspaceId", name, instagram, "updatedAt") values ('bc1${t}', '${ws}', 'Rival One', '@rival.one', now()), ('bc2${t}', '${ws}', 'Rival Two', 'https://www.instagram.com/rival_two/', now()), ('bc3${t}', '${ws}', 'Private Cafe', 'ghost_account', now()), ('bc4${t}', '${ws}', 'No Instagram', null, now())`,
  )
  // A week ago the company had 1,100 followers.
  const before = new Date(Date.now() - 8 * 86_400_000).toISOString().slice(0, 10)
  sql(`insert into "InstagramBenchmark"(id, "workspaceId", username, date, followers, "updatedAt") values ('bb${t}', '${ws}', 'bloombakery', '${before}', 1100, now())`)

  await page.goto('/app/dashboard')
  await board().getByRole('button', { name: 'Refresh' }).click()
  await expect(board().getByTestId('board-place')).toHaveText('You are #2 of 3 by reactions per post.')
  // Rival One 100 + 20, you 40 + 5, Rival Two 20 + 2.
  await expect(board().getByTestId('reactions-rival.one')).toHaveText('120')
  await expect(board().getByTestId('reactions-bloombakery')).toHaveText('45')
  await expect(board().getByTestId('reactions-rival_two')).toHaveText('22')
  const rows = board().getByRole('row')
  await expect(rows.nth(1)).toContainText('Rival One')
  await expect(rows.nth(2)).toContainText('(you)')
  await expect(row('bloombakery')).toContainText('1,200')
  await expect(row('bloombakery')).toContainText('+100')
  await expect(row('rival.one')).toContainText('12')
  // Not a business account: listed, without numbers, and why.
  await expect(row('ghost_account')).toContainText('no numbers')
  await expect(row('ghost_account').getByTitle(/Not a business or creator account/)).toBeVisible()
  // A competitor without Instagram is not on the board.
  await expect(board()).not.toContainText('No Instagram')
  expect(sql(`select count(*) from "InstagramBenchmark" where "workspaceId"='${ws}' and date=to_char(now() at time zone 'utc', 'YYYY-MM-DD')`)).toBe('4')

  // The "?" explains in plain words.
  await board().getByRole('button', { name: 'What is this? Reactions' }).hover()
  await expect(page.getByRole('tooltip')).toHaveText(/Likes and comments an average post gets/)
})

test('in Russian and Georgian; also on the Competitors page', async () => {
  await page.locator('header').getByRole('radio', { name: 'Русский' }).click()
  await expect(page.getByRole('region', { name: 'Вы и конкуренты' }).getByTestId('board-place')).toHaveText('Вы на 2-м месте из 3 по реакциям на пост.')
  await page.locator('header').getByRole('radio', { name: 'ქართული' }).click()
  await expect(page.getByRole('region', { name: 'თქვენ და კონკურენტები' }).getByTestId('board-place')).toHaveText('თქვენი ადგილი: 2 / 3 — რეაქციებით თითო პოსტზე.')
  await page.locator('header').getByRole('radio', { name: 'English' }).click()

  await page.goto('/app/competitors')
  await expect(board().getByTestId('board-place')).toHaveText('You are #2 of 3 by reactions per post.')
})

test('a refresh the same day updates the row instead of adding one', async () => {
  meta.setFollowers('bloombakery', 1250)
  sql(`update "InstagramBenchmark" set "updatedAt"=now() - interval '1 hour' where "workspaceId"='${ws}'`)
  await page.goto('/app/dashboard')
  await board().getByRole('button', { name: 'Refresh' }).click()
  await expect(row('bloombakery')).toContainText('+150')
  expect(sql(`select count(*) from "InstagramBenchmark" where "workspaceId"='${ws}' and username='bloombakery'`)).toBe('2')
})

test('another workspace sees nothing of it', async ({ browser }) => {
  const other = await browser.newPage()
  await newAccount(other, 'board-other')
  await other.goto('/app/dashboard')
  await expect(other.getByRole('region', { name: 'You vs competitors' })).toContainText('Connect your Instagram business account')
  await other.close()
})
