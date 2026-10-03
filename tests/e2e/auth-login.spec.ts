import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { createHash, randomBytes, scryptSync } from 'node:crypto'
import { latestMail, linkFrom, magicSignIn, MAILPIT, newAccount, sql, uniqueEmail } from './helpers'

// QA: magic link, password reset, logout, protected routes.

async function mailCount(to: string, subjectIncludes: string) {
  const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}&limit=50`)
  const data = (await res.json()) as { messages: { Subject: string }[] }
  return data.messages.filter((m) => m.Subject.includes(subjectIncludes)).length
}

const userId = (email: string) => sql(`select id from "User" where email='${email}'`)
const sessionCount = (email: string) =>
  Number(sql(`select count(*) from "Session" s join "User" u on u.id=s."userId" where u.email='${email}'`))

async function requestMagic(page: Page, email: string, path = '/signup') {
  await page.goto(path)
  await page.getByPlaceholder('name@company.com').fill(email)
  await page.getByRole('button', { name: 'Send magic link' }).click()
  await expect(page.getByText('Check your inbox')).toBeVisible()
}

async function sessionCookie(ctx: BrowserContext) {
  return (await ctx.cookies()).find((c) => c.name === 'khma_session')
}

test.describe('magic link', () => {
  test('GET alone does not sign in; click signs in once; reuse is rejected', async ({ page, context }) => {
    const email = uniqueEmail('qa-auth-magic')
    await requestMagic(page, email)
    const link = linkFrom((await latestMail(email, 'sign-in link')).Text, '/auth/magic?token=')

    // A mail scanner only GETs the page.
    const res = await page.request.get(link)
    expect(res.status()).toBe(200)
    await page.goto(link)
    await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible()
    expect(sql(`select count(*) from "User" where email='${email}'`)).toBe('0')
    expect(sql(`select count(*) from "MagicLink" where email='${email}' and "usedAt" is not null`)).toBe('0')
    expect(await sessionCookie(context)).toBeUndefined()

    await page.getByRole('button', { name: 'Continue' }).click()
    await page.waitForURL(/\/onboarding/)
    expect(await sessionCookie(context)).toBeDefined()
    expect(sessionCount(email)).toBe(1)

    // Reuse from a clean browser.
    await context.clearCookies()
    await page.goto(link)
    await page.getByRole('button', { name: 'Continue' }).click()
    await page.waitForURL(/\/login\?error=link/)
    await expect(page.locator('p[role=alert]')).toContainText('invalid or has expired')
    expect(await sessionCookie(context)).toBeUndefined()
    expect(sessionCount(email)).toBe(1)
  })

  test('expired link is rejected', async ({ page, context }) => {
    const email = uniqueEmail('qa-auth-expired')
    await requestMagic(page, email)
    const link = linkFrom((await latestMail(email, 'sign-in link')).Text, '/auth/magic?token=')
    sql(`update "MagicLink" set "expiresAt" = (now() at time zone 'utc') - interval '1 minute' where email='${email}'`)
    await page.goto(link)
    await page.getByRole('button', { name: 'Continue' }).click()
    await page.waitForURL(/\/login\?error=link/)
    expect(await sessionCookie(context)).toBeUndefined()
    expect(sql(`select count(*) from "User" where email='${email}'`)).toBe('0')
  })

  test('magic link without token / garbage token', async ({ page, context }) => {
    await page.goto('/auth/magic')
    await expect(page).toHaveURL(/\/login\?error=link/)
    await page.goto('/auth/magic?token=garbage')
    await page.getByRole('button', { name: 'Continue' }).click()
    await page.waitForURL(/\/login\?error=link/)
    expect(await sessionCookie(context)).toBeUndefined()
  })

  test('rate limit: second request within 60s sends no second email', async ({ page }) => {
    const email = uniqueEmail('qa-auth-rate')
    await requestMagic(page, email)
    await latestMail(email, 'sign-in link')
    await requestMagic(page, email, '/login')
    await page.waitForTimeout(3000)
    expect(await mailCount(email, 'sign-in link')).toBe(1)
    expect(sql(`select count(*) from "MagicLink" where email='${email}'`)).toBe('1')
  })

  test('email is normalised (case / spaces) so rate limit and account are shared', async ({ page }) => {
    const email = uniqueEmail('qa-auth-case')
    await requestMagic(page, email.toUpperCase())
    await latestMail(email, 'sign-in link')
    expect(sql(`select email from "MagicLink" where email ilike '${email}'`)).toBe(email)
  })

  test('known and unknown emails get the same answer', async ({ page }) => {
    const known = uniqueEmail('qa-auth-known')
    await magicSignIn(page, known)
    await page.context().clearCookies()
    const unknown = uniqueEmail('qa-auth-unknown')

    const texts: string[] = []
    for (const e of [known, unknown]) {
      await requestMagic(page, e, '/login')
      texts.push((await page.locator('main, body').first().innerText()).replace(e, '<email>'))
    }
    expect(texts[0]).toBe(texts[1])
  })

  test('a password-reset token cannot be used as a sign-in link', async ({ page, context }) => {
    const email = uniqueEmail('qa-auth-purpose')
    await magicSignIn(page, email)
    await context.clearCookies()
    await page.goto('/forgot-password')
    await page.getByPlaceholder('name@company.com').fill(email)
    await page.getByRole('button', { name: 'Send reset link' }).click()
    await expect(page.getByText('Check your inbox')).toBeVisible()
    const reset = linkFrom((await latestMail(email, 'Reset your Loudpilot password')).Text, '/reset-password?token=')
    const token = new URL(reset).searchParams.get('token')!
    await page.goto(`/auth/magic?token=${token}`)
    await page.getByRole('button', { name: 'Continue' }).click()
    await page.waitForURL(/\/login\?error=link/)
    expect(await sessionCookie(context)).toBeUndefined()
  })
})

test.describe('password', () => {
  test('forgot → mismatch → success signs in, kills other sessions, link is single use, new password works', async ({
    page,
    context,
    browser,
  }) => {
    const email = uniqueEmail('qa-auth-reset')
    await magicSignIn(page, email) // session #1 in this browser
    const oldCookie = (await sessionCookie(context))!
    // Another device: a second live session row.
    const otherToken = randomBytes(32).toString('base64url')
    sql(
      `insert into "Session"(id,"userId","tokenHash","expiresAt") values ('qa-auth-${Date.now()}','${userId(email)}','${createHash('sha256').update(otherToken).digest('hex')}', (now() at time zone 'utc') + interval '1 day')`,
    )
    expect(sessionCount(email)).toBe(2)

    const ctx2 = await browser.newContext()
    const p2 = await ctx2.newPage()
    await p2.goto('/forgot-password')
    await p2.getByPlaceholder('name@company.com').fill(email)
    await p2.getByRole('button', { name: 'Send reset link' }).click()
    await expect(p2.getByText('Check your inbox')).toBeVisible()
    const link = linkFrom((await latestMail(email, 'Reset your Loudpilot password')).Text, '/reset-password?token=')

    await p2.goto(link)
    await p2.getByPlaceholder('New password (8+ characters)').fill('Correct-Horse-1')
    await p2.getByPlaceholder('Repeat new password').fill('Correct-Horse-2')
    await p2.getByRole('button', { name: 'Save and sign in' }).click()
    await expect(p2.locator('p[role=alert]')).toContainText("Passwords don't match")
    // A mismatch must not burn the link.
    expect(sql(`select count(*) from "MagicLink" where email='${email}' and purpose='PASSWORD_RESET' and "usedAt" is null`)).toBe('1')

    await p2.getByPlaceholder('New password (8+ characters)').fill('Correct-Horse-1')
    await p2.getByPlaceholder('Repeat new password').fill('Correct-Horse-1')
    await p2.getByRole('button', { name: 'Save and sign in' }).click()
    await p2.waitForURL(/\/(onboarding|app)/)
    expect(sessionCount(email)).toBe(1) // only the new one
    expect(sql(`select "passwordHash" like 'scrypt$%' from "User" where email='${email}'`)).toBe('t')

    // Old browser session is dead.
    await context.clearCookies()
    await context.addCookies([{ ...oldCookie }])
    await page.goto('/onboarding')
    await expect(page).toHaveURL(/\/login/)

    // Reused reset link rejected.
    const ctx3 = await browser.newContext()
    const p3 = await ctx3.newPage()
    await p3.goto(link)
    await p3.getByPlaceholder('New password (8+ characters)').fill('Another-Pass-9')
    await p3.getByPlaceholder('Repeat new password').fill('Another-Pass-9')
    await p3.getByRole('button', { name: 'Save and sign in' }).click()
    await expect(p3.locator('p[role=alert]')).toContainText('invalid or has expired')

    // Login with new password; wrong password gives the generic message.
    await p3.goto('/login')
    await p3.getByRole('button', { name: 'Password', exact: true }).click()
    await p3.getByPlaceholder('name@company.com').fill(email)
    await p3.getByPlaceholder('Password').fill('wrong-password')
    await p3.getByRole('button', { name: 'Log in' }).click()
    await expect(p3.locator('p[role=alert]')).toHaveText('Wrong email or password')
    await p3.getByPlaceholder('Password').fill('Correct-Horse-1')
    await p3.getByRole('button', { name: 'Log in' }).click()
    await p3.waitForURL(/\/(onboarding|app)/)

    // Unknown email gets the same wrong-password message.
    const ctx4 = await browser.newContext()
    const p4 = await ctx4.newPage()
    await p4.goto('/login')
    await p4.getByRole('button', { name: 'Password', exact: true }).click()
    await p4.getByPlaceholder('name@company.com').fill(uniqueEmail('qa-auth-nobody'))
    await p4.getByPlaceholder('Password').fill('whatever-123')
    await p4.getByRole('button', { name: 'Log in' }).click()
    await expect(p4.locator('p[role=alert]')).toHaveText('Wrong email or password')
    await Promise.all([ctx2.close(), ctx3.close(), ctx4.close()])
  })

  test('reset for a non-existent email: same response, no mail', async ({ page }) => {
    const email = uniqueEmail('qa-auth-noacct')
    await page.goto('/forgot-password')
    await page.getByPlaceholder('name@company.com').fill(email)
    await page.getByRole('button', { name: 'Send reset link' }).click()
    await expect(page.getByText('Check your inbox')).toBeVisible()
    await expect(page.getByText(`If ${email} has a Loudpilot account`)).toBeVisible()
    await page.waitForTimeout(3000)
    expect(await mailCount(email, 'Reset')).toBe(0)
    expect(sql(`select count(*) from "MagicLink" where email='${email}'`)).toBe('0')
  })

  test('reset password too short is rejected server-side', async ({ page, context }) => {
    const email = uniqueEmail('qa-auth-short')
    await magicSignIn(page, email)
    await context.clearCookies()
    await page.goto('/forgot-password')
    await page.getByPlaceholder('name@company.com').fill(email)
    await page.getByRole('button', { name: 'Send reset link' }).click()
    const link = linkFrom((await latestMail(email, 'Reset your Loudpilot password')).Text, '/reset-password?token=')
    await page.goto(link)
    // Bypass the browser's minLength to hit the server check.
    await page.evaluate(() => document.querySelectorAll('input[minlength]').forEach((i) => i.removeAttribute('minlength')))
    await page.getByPlaceholder('New password (8+ characters)').fill('short')
    await page.getByPlaceholder('Repeat new password').fill('short')
    await page.getByRole('button', { name: 'Save and sign in' }).click()
    await expect(page.locator('p[role=alert]')).toContainText('at least 8 characters')
    expect(sql(`select "passwordHash" is null from "User" where email='${email}'`)).toBe('t')
  })
})

test.describe('sessions & protected routes', () => {
  test('logout destroys cookie and DB row; the old token no longer works', async ({ page, context }) => {
    const { email } = await newAccount(page, 'qa-auth-logout')
    const cookie = (await sessionCookie(context))!
    expect(sessionCount(email)).toBe(1)
    await page.getByRole('button', { name: /qa-auth-logout Brand/ }).click()
    await page.getByRole('button', { name: 'Log out' }).click()
    await page.waitForURL(/\/login/)
    expect(await sessionCookie(context)).toBeUndefined()
    expect(sessionCount(email)).toBe(0)

    await context.addCookies([cookie])
    await page.goto('/app/planner')
    await expect(page).toHaveURL(/\/login/)
  })

  for (const path of ['/app', '/app/planner', '/app/brand', '/app/credits', '/app/plan', '/onboarding']) {
    test(`${path} redirects to /login without a session and with a forged cookie`, async ({ page, context }) => {
      await page.goto(path)
      await expect(page).toHaveURL(/\/login$/)
      await context.addCookies([{ name: 'khma_session', value: randomBytes(32).toString('base64url'), url: 'http://localhost:3100' }])
      await page.goto(path)
      await expect(page).toHaveURL(/\/login$/)
    })
  }

  test('expired session row is not accepted', async ({ page, context }) => {
    const { email } = await newAccount(page, 'qa-auth-sessexp')
    sql(`update "Session" set "expiresAt" = (now() at time zone 'utc') - interval '1 minute' where "userId"='${userId(email)}'`)
    await page.goto('/app/planner')
    await expect(page).toHaveURL(/\/login/)
    expect(await sessionCookie(context)).toBeDefined()
  })

  test('session cookie is httpOnly + SameSite=Lax', async ({ page, context }) => {
    await magicSignIn(page, uniqueEmail('qa-auth-cookie'))
    const c = (await sessionCookie(context))!
    expect(c.httpOnly).toBe(true)
    expect(c.sameSite).toBe('Lax')
    expect(c.value.length).toBeGreaterThanOrEqual(40)
  })
})

// Sets a known password directly (no shell, the hash contains "$").
function setPassword(email: string, password: string) {
  const salt = randomBytes(16)
  const hash = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 })
  const stored = `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`
  execFileSync('psql', ['-h', 'localhost', 'khma', '-Atc', `update "User" set "passwordHash"='${stored}' where email='${email}'`])
}

test('password login is throttled after many wrong attempts', async ({ page, context, browser }) => {
  const email = uniqueEmail('qa-auth-brute')
  await magicSignIn(page, email)
  await context.clearCookies()
  setPassword(email, 'Right-Password-1')

  const ctx = await browser.newContext()
  const p = await ctx.newPage()
  await p.goto('/login')
  await p.getByRole('button', { name: 'Password', exact: true }).click()
  await p.getByPlaceholder('name@company.com').fill(email)
  for (let i = 0; i < 25; i++) {
    await p.getByPlaceholder('Password').fill(`wrong-${i}`)
    await p.getByRole('button', { name: 'Log in' }).click()
    await expect(p.locator('p[role=alert]')).toBeVisible()
    await expect(p.getByRole('button', { name: 'Log in' })).toBeEnabled()
  }
  // After 25 straight failures the right password should not be accepted
  // instantly (lockout / captcha / delay). It is.
  await p.getByPlaceholder('Password').fill('Right-Password-1')
  await p.getByRole('button', { name: 'Log in' }).click()
  await p.waitForTimeout(3000)
  expect(p.url(), 'no brute-force protection: login succeeded right after 25 failures').toMatch(/\/login/)
  await ctx.close()
})
