import { expect, type Page } from '@playwright/test'
import { execSync } from 'node:child_process'

export const MAILPIT = process.env.MAILPIT_URL ?? 'http://localhost:18025'

export const uniqueEmail = (prefix: string) => `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e4)}@khma.test`

// Latest email for `to` from mailpit, polled until it arrives.
export async function latestMail(to: string, subjectIncludes: string, timeoutMs = 20_000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}&limit=5`)
    const data = (await res.json()) as { messages: { ID: string; Subject: string }[] }
    const hit = data.messages.find((m) => m.Subject.includes(subjectIncludes))
    if (hit) {
      const full = (await (await fetch(`${MAILPIT}/api/v1/message/${hit.ID}`)).json()) as { Text: string; HTML: string }
      return full
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`No "${subjectIncludes}" email for ${to}`)
}

export const linkFrom = (text: string, path: string) => {
  const m = text.match(new RegExp(`https?://[^\\s"']+${path.replace(/[/?]/g, '\\$&')}[^\\s"']*`))
  if (!m) throw new Error(`No ${path} link in email`)
  return m[0]
}

// Sign up (or in) via magic link; ends on /onboarding for a new user.
export async function magicSignIn(page: Page, email: string) {
  await page.goto('/signup')
  await page.getByPlaceholder('name@company.com').fill(email)
  await page.getByRole('button', { name: 'Send magic link' }).click()
  await expect(page.getByText('Check your inbox')).toBeVisible()
  const mail = await latestMail(email, 'sign-in link')
  await page.goto(linkFrom(mail.Text, '/auth/magic?token='))
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.waitForURL(/\/(onboarding|app)/)
}

// Fresh user with a manually entered brand and a started trial (50 credits).
export async function newAccount(page: Page, prefix: string, brand = `${prefix} Brand`) {
  const email = uniqueEmail(prefix)
  await magicSignIn(page, email)
  await expect(page).toHaveURL(/\/onboarding/)
  await page.getByRole('button', { name: 'Set up manually' }).click()
  await page.getByRole('button', { name: /Continue/ }).click()
  await page.locator('input').first().fill(brand)
  await page.getByRole('button', { name: /Continue/ }).click()
  await expect(page.getByText('Choose your plan')).toBeVisible()
  await page.getByRole('button', { name: /Start 7-day free trial/ }).first().click()
  await page.waitForURL(/\/app\/planner/)
  return { email, brand }
}

// Direct DB access for assertions (local dev DB "khma").
export function sql(query: string): string {
  return execSync(`psql -h localhost khma -Atc ${JSON.stringify(query)}`, { encoding: 'utf8' }).trim()
}

// The app's own confirm/alert dialog (components/ui/Dialog.tsx) answered the
// way a browser dialog is: d.message(), d.accept() (the main, last button) or
// d.dismiss() (the first one — Cancel). onceAppDialog answers the next one,
// onAppDialog every one while the page is open.
export type AppDialog = { message: () => string; accept: () => Promise<void>; dismiss: () => Promise<void>; choose: (label: string | RegExp) => Promise<void> }

// Dialogs already answered, per page (each request has its own data-request).
const answered = new WeakMap<Page, Set<string>>()

function watchAppDialog(page: Page, handler: (d: AppDialog) => unknown, once: boolean) {
  const done = answered.get(page) ?? new Set<string>()
  answered.set(page, done)
  const loop = async () => {
    while (!page.isClosed()) {
      const handle = await page.waitForFunction(
        (skip) => {
          const d = document.querySelector<HTMLDialogElement>('dialog[aria-labelledby="app-dialog-title"][open]')
          return d && !skip.includes(d.dataset.request ?? '') ? d.dataset.request : null
        },
        [...done],
        { timeout: 0, polling: 100 },
      )
      const id = String(await handle.jsonValue())
      done.add(id)
      const dlg = page.locator(`dialog[data-request="${id}"][open]`)
      const text = await dlg.innerText()
      await handler({
        message: () => text,
        accept: () => dlg.locator('[data-choice]').last().click(),
        dismiss: () => dlg.locator('[data-choice]').first().click(),
        choose: (label) => dlg.getByRole('button', { name: label }).click(),
      })
      if (once) return
    }
  }
  void loop().catch(() => {})
}
export const onceAppDialog = (page: Page, handler: (d: AppDialog) => unknown) => watchAppDialog(page, handler, true)
export const onAppDialog = (page: Page, handler: (d: AppDialog) => unknown) => watchAppDialog(page, handler, false)
