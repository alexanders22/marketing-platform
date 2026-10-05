import { expect, test, type Page } from '@playwright/test'
import { magicSignIn, newAccount, sql, uniqueEmail } from './helpers'

// QA: onboarding (manual + website import), SSRF guard, plan picker / trial
// credits, brand settings, credits page.

const acct = (email: string, cols: string) =>
  sql(
    `select ${cols} from "Account" a join "AccountMember" m on m."accountId"=a.id join "User" u on u.id=m."userId" where u.email='${email}'`,
  )

async function toManualReview(page: Page) {
  await page.getByRole('button', { name: 'Set up manually' }).click()
  await page.getByRole('button', { name: /Continue/ }).click()
  await expect(page.getByText('Describe your brand')).toBeVisible()
}

const field = (page: Page, title: string) =>
  page.locator('section').filter({ has: page.locator('h3', { hasText: new RegExp(`^${title}`) }) })

// Rewrites the JSON body of the next server-action POST.
async function tamperNextAction(page: Page, urlGlob: string, edit: (body: string) => string) {
  let done = false
  await page.route(urlGlob, async (route) => {
    const req = route.request()
    if (!done && req.method() === 'POST' && req.headers()['next-action']) {
      done = true
      return route.continue({ postData: edit(req.postData() ?? '') })
    }
    return route.continue()
  })
}

test.describe('onboarding', () => {
  test('manual path: validation errors, then plan picker prices', async ({ page }) => {
    const email = uniqueEmail('qa-auth-onb')
    await magicSignIn(page, email)
    await expect(page).toHaveURL(/\/onboarding/)
    await toManualReview(page)

    const cont = page.getByRole('button', { name: /Continue/ })
    const err = page.locator('p.bg-red-50')

    await cont.click()
    await expect(err).toHaveText('Brand name is required')

    await field(page, 'Name').locator('input').fill('   ')
    await cont.click()
    await expect(err).toHaveText('Brand name is required')

    await field(page, 'Name').locator('input').fill('QA Onb Brand')
    await field(page, 'Website').locator('input').fill('not a url')
    await cont.click()
    await expect(err).toHaveText('Links must start with http:// or https://')

    await field(page, 'Website').locator('input').fill('javascript:alert(1)//x.y')
    await cont.click()
    await expect(err).toHaveText('Links must start with http:// or https://')

    await field(page, 'Website').locator('input').fill('https://qa-onb.example')
    await field(page, 'Logo').locator('input').fill('ftp://x.y/logo.png')
    await cont.click()
    await expect(err).toHaveText('Links must start with http:// or https://')

    await field(page, 'Logo').locator('input').fill('')
    await page.getByRole('button', { name: 'Add social link' }).click()
    await field(page, 'Social links').locator('input').fill('instagram')
    await cont.click()
    await expect(err).toHaveText('Social links must be full URLs')
    expect(acct(email, 'count(*)')).toBe('0')

    await field(page, 'Social links').locator('input').fill('https://instagram.com/qa')
    await cont.click()
    await expect(page.getByText('Choose your plan')).toBeVisible()
    expect(acct(email, 'a.name, a.plan, a."creditBalance"')).toBe('QA Onb Brand|NONE|0')
    expect(
      sql(
        `select b.website||'|'||array_to_string(b."socialLinks",',') from "BrandKit" b join "Workspace" w on w.id=b."workspaceId" join "AccountMember" m on m."accountId"=w."accountId" join "User" u on u.id=m."userId" where u.email='${email}'`,
      ),
    ).toBe('https://qa-onb.example|https://instagram.com/qa')

    // Monthly / yearly prices.
    for (const [m, y] of [
      ['$29', '$290'],
      ['$79', '$790'],
      ['$199', '$1,990'],
    ]) {
      await expect(page.getByText(`${m} / month`, { exact: true })).toBeVisible()
      void y
    }
    await page.getByRole('button', { name: 'Yearly (2 months free)' }).click()
    for (const y of ['$290', '$790', '$1,990']) await expect(page.getByText(`${y} / year`, { exact: true })).toBeVisible()

    // Pick Team, yearly.
    await page.getByRole('button', { name: /Start 7-day free trial/ }).nth(1).click()
    await page.waitForURL(/\/app\/planner/)
    expect(acct(email, 'a.plan, a."billingCycle", a."creditBalance"')).toBe('TEAM|YEARLY|50')
    const days = Number(acct(email, `round(extract(epoch from (a."trialEndsAt" - (now() at time zone 'utc')))/86400)`))
    expect(days).toBe(7)
    expect(acct(email, `(select count(*) from "CreditEntry" c where c."accountId"=a.id)`)).toBe('1')

    // Onboarding is done: visiting it again goes to the app.
    await page.goto('/onboarding')
    await expect(page).toHaveURL(/\/app\/planner/)

    // Second plan pick: no second grant, trial end unchanged.
    const trialBefore = acct(email, 'a."trialEndsAt"')
    await page.goto('/app/plan')
    await expect(page.getByRole('button', { name: 'Current plan' })).toBeVisible()
    await page.getByRole('button', { name: /Start 7-day free trial/ }).last().click()
    await page.waitForURL(/\/app\/credits/)
    expect(acct(email, 'a.plan, a."creditBalance"')).toBe('AGENCY|50')
    expect(acct(email, `(select count(*) from "CreditEntry" c where c."accountId"=a.id)`)).toBe('1')
    expect(acct(email, 'a."trialEndsAt"')).toBe(trialBefore)

    // Credits page.
    await expect(page.getByText('Agency', { exact: true })).toBeVisible()
    await expect(page.getByText(/Free trial until \d{2}\/\d{2}\/\d{4}/)).toBeVisible()
    await expect(page.locator('p.text-2xl', { hasText: /^50$/ })).toBeVisible()
    await expect(page.getByText('5,000 credits per month on Agency')).toBeVisible()
    const row = page.locator('li', { hasText: 'Free trial' })
    await expect(row).toContainText('Bonus')
    await expect(row).toContainText('+50')
  })

  test('closing the plan picker goes to the app without a plan or credits', async ({ page }) => {
    const email = uniqueEmail('qa-auth-noplan')
    await magicSignIn(page, email)
    await toManualReview(page)
    await field(page, 'Name').locator('input').fill('QA No Plan')
    await page.getByRole('button', { name: /Continue/ }).click()
    await expect(page.getByText('Choose your plan')).toBeVisible()
    await page.getByRole('button', { name: 'Close' }).click()
    await page.waitForURL(/\/app/)
    await expect(page.locator('aside').getByText('No plan — choose one').first()).toBeVisible()
    expect(acct(email, 'a.plan, a."creditBalance", a."trialEndsAt" is null')).toBe('NONE|0|t')
    await page.goto('/app/credits')
    await expect(page.getByText('No plan yet')).toBeVisible()
    await expect(page.getByText('No credit activity yet.')).toBeVisible()
  })

  test('website import (example.com) shows the review step', async ({ page }) => {
    await magicSignIn(page, uniqueEmail('qa-auth-import'))
    await page.locator('#site').fill('example.com')
    await page.getByRole('button', { name: /Continue/ }).click()
    await expect(page.getByText('Your brand is ready')).toBeVisible({ timeout: 30_000 })
    await expect(field(page, 'Name').locator('input')).toHaveValue('Example Domain')
    await expect(field(page, 'Website').locator('input')).toHaveValue('https://example.com/')
  })

  test('website import: empty URL error', async ({ page }) => {
    await magicSignIn(page, uniqueEmail('qa-auth-import-empty'))
    await page.getByRole('button', { name: /Continue/ }).click()
    await expect(page.locator('p.bg-red-50')).toHaveText('Enter your website address')
  })
})

test.describe('SSRF guard on website import', () => {
  const internal = [
    'http://127.0.0.1:3100/login',
    'http://localhost:5432',
    'http://169.254.169.254/latest/meta-data/',
    'http://[::1]:3100/login',
    'http://0x7f000001:3100/login',
    'http://2130706433:3100/login',
    'http://127.1:3100/login',
    'http://localhost.:3100/login',
    'http://127.0.0.1.nip.io:3100/login',
    // IPv4-mapped IPv6 (WHATWG URL rewrites the dotted form to hex).
    'http://[::ffff:127.0.0.1]:3100/login',
    'http://[::ffff:7f00:1]:3100/login',
  ]
  for (const url of internal) {
    test(`refuses ${url}`, async ({ page }) => {
      await magicSignIn(page, uniqueEmail('qa-auth-ssrf'))
      await page.locator('#site').fill(url)
      await page.getByRole('button', { name: /Continue/ }).click()
      await expect(page.locator('p.bg-red-50, h1:has-text("Your brand is ready")').first()).toBeVisible({ timeout: 30_000 })
      // If the guard fails, the review step shows what was read from the internal address.
      if (await page.getByText('Your brand is ready').count()) {
        const leaked = {
          name: await field(page, 'Name').locator('input').inputValue(),
          website: await field(page, 'Website').locator('input').inputValue(),
        }
        throw new Error(`SSRF: internal URL was fetched and parsed: ${JSON.stringify(leaked)}`)
      }
      await expect(page.locator('p.bg-red-50')).toContainText("We couldn't read that website")
    })
  }
})

test.describe('brand settings', () => {
  test('edit, save, persisted', async ({ page }) => {
    const { email } = await newAccount(page, 'qa-auth-brand')
    await page.goto('/app/brand')
    await field(page, 'Name').locator('input').fill('QA Brand Renamed')
    await field(page, 'Website').locator('input').fill('https://qa-brand.example')
    await field(page, 'Description').locator('textarea').fill('We sell QA.')
    await field(page, 'Logo').locator('input').fill('https://qa-brand.example/logo.png')
    await page.getByRole('button', { name: 'Add color' }).click()
    await page.getByRole('button', { name: 'Bold', exact: true }).click()
    await field(page, 'Target audience').locator('textarea').fill('Testers')
    await field(page, 'Fonts').locator('input').fill('Inter, Playfair Display')
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByText('Saved', { exact: true })).toBeVisible()

    await page.reload()
    await expect(field(page, 'Name').locator('input')).toHaveValue('QA Brand Renamed')
    await expect(field(page, 'Description').locator('textarea')).toHaveValue('We sell QA.')
    await expect(field(page, 'Fonts').locator('input')).toHaveValue('Inter, Playfair Display')
    await expect(page.getByRole('button', { name: 'Bold', exact: true })).toHaveAttribute('aria-pressed', 'true')
    expect(
      sql(
        `select w.name||'|'||b.website||'|'||array_to_string(b.colors,',')||'|'||b.voice||'|'||b.audience from "BrandKit" b join "Workspace" w on w.id=b."workspaceId" join "AccountMember" m on m."accountId"=w."accountId" join "User" u on u.id=m."userId" where u.email='${email}'`,
      ),
    ).toBe('QA Brand Renamed|https://qa-brand.example|#7c3aed|Bold|Testers')
  })

  test('invalid URL / colour / name rejected', async ({ page }) => {
    const { email } = await newAccount(page, 'qa-auth-brandbad')
    await page.goto('/app/brand')
    const err = page.locator('p.bg-red-50')
    const save = page.getByRole('button', { name: 'Save changes' })

    await field(page, 'Website').locator('input').fill('qa-brand.example')
    await save.click()
    await expect(err).toHaveText('Links must start with http:// or https://')
    await field(page, 'Website').locator('input').fill('')

    await field(page, 'Name').locator('input').fill('')
    await save.click()
    await expect(err).toHaveText('Brand name is required')
    await field(page, 'Name').locator('input').fill('Still Fine')

    // The colour input can't produce a bad value, so tamper with the action payload.
    await page.getByRole('button', { name: 'Add color' }).click()
    await tamperNextAction(page, '**/app/brand', (b) => b.replace('#7c3aed', 'red;background:url(x)'))
    await save.click()
    await expect(err).toHaveText('Colours must be hex like #FF6000')

    await page.reload()
    await page.getByRole('button', { name: 'Add social link' }).click()
    await field(page, 'Social links').locator('input').fill('javascript:alert(1)')
    await save.click()
    await expect(err).toHaveText('Social links must be full URLs')

    expect(
      sql(
        `select w.name from "Workspace" w join "AccountMember" m on m."accountId"=w."accountId" join "User" u on u.id=m."userId" where u.email='${email}'`,
      ),
    ).toBe('qa-auth-brandbad Brand')
  })
})

test('credits history labels every reason (AI_BLOG)', async ({ page }) => {
  const { email } = await newAccount(page, 'qa-auth-reason')
  const accountId = acct(email, 'a.id')
  sql(`insert into "CreditEntry"(id,"accountId",amount,reason,note) values ('qaauthce${Date.now()}','${accountId}',-3,'AI_BLOG','Blog article')`)
  await page.goto('/app/credits')
  const row = page.locator('li', { hasText: 'Blog article' })
  await expect(row).toContainText('-3')
  await expect(row).not.toContainText('AI_BLOG')
})

test('concurrent completeOnboarding calls create only one account', async ({ page }) => {
  const email = uniqueEmail('qa-auth-onbrace')
  await magicSignIn(page, email)
  await toManualReview(page)
  await field(page, 'Name').locator('input').fill('QA Race Brand')
  let fired = false
  await page.route('**/onboarding', async (route) => {
    const req = route.request()
    if (fired || req.method() !== 'POST' || !req.headers()['next-action']) return route.continue()
    fired = true
    const id = req.headers()['next-action']
    const body = req.postData() ?? ''
    await page.evaluate(
      ({ id, body }) =>
        Promise.all(
          Array.from({ length: 5 }, () =>
            fetch('/onboarding', { method: 'POST', headers: { 'Next-Action': id, 'Content-Type': 'text/plain;charset=UTF-8', Accept: 'text/x-component' }, body }),
          ),
        ),
      { id, body },
    )
    return route.abort()
  })
  await page.getByRole('button', { name: /Continue/ }).click()
  await expect.poll(() => acct(email, 'count(*)'), { timeout: 15_000 }).not.toBe('0')
  await page.waitForTimeout(2000)
  expect(acct(email, 'count(*)'), 'accounts created for one user').toBe('1')
})
