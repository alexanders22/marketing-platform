import { expect, test } from '@playwright/test'
import { latestMail, linkFrom, newAccount, sql, uniqueEmail } from './helpers'

// Plan limits (companies, seats, social profiles), the paid state, monthly
// plan credits and the Agency API.

const acct = (email: string) =>
  sql(`select m."accountId" from "AccountMember" m join "User" u on u.id=m."userId" where u.email='${email}'`)

test('Starter has one seat; Team invites teammates by email up to five seats', async ({ page, browser }) => {
  const { email } = await newAccount(page, 'team')
  const id = acct(email)
  await page.goto('/app/team')
  await expect(page.getByText(/1\s*of\s*1\s*seat used/)).toBeVisible()
  await expect(page.getByLabel('Teammate email')).toBeDisabled()

  sql(`update "Account" set plan='TEAM' where id='${id}'`)
  await page.reload()
  await expect(page.getByText(/1\s*of\s*5\s*seats used/)).toBeVisible()
  const mate = uniqueEmail('mate')
  await page.getByLabel('Teammate email').fill(mate)
  await page.getByLabel('Role').selectOption('ADMIN')
  await page.getByRole('button', { name: 'Send invite' }).click()
  await expect(page.getByText(`Invitation sent to ${mate}`)).toBeVisible()
  await expect(page.getByText('Invited as Admin · waiting to join')).toBeVisible()

  // The teammate opens the email link in their own browser and joins.
  const mail = await latestMail(mate, 'invited you')
  const other = await browser.newPage()
  await other.goto(linkFrom(mail.Text, '/auth/invite?token='))
  await expect(other.getByRole('heading', { name: /^Join / })).toBeVisible()
  await other.getByRole('button', { name: 'Join the team' }).click()
  await other.waitForURL(/\/app/)
  expect(sql(`select m.role from "AccountMember" m join "User" u on u.id=m."userId" where u.email='${mate}' and m."accountId"='${id}'`)).toBe('ADMIN')
  // The link works once.
  await other.goto(linkFrom(mail.Text, '/auth/invite?token='))
  await expect(other.getByText("This invitation can't be used")).toBeVisible()
  await other.close()

  // Fill the remaining seats with pending invitations: the next is refused.
  for (let i = 0; i < 3; i++) {
    sql(
      `insert into "Invitation" (id, "accountId", email, role, "tokenHash", "invitedById", "expiresAt") values ('inv-${Date.now()}-${i}', '${id}', 'x${i}-${Date.now()}@khma.test', 'EDITOR', 'h-${Date.now()}-${i}', 'x', now() + interval '1 day')`,
    )
  }
  await page.reload()
  await expect(page.getByText(/5\s*of\s*5\s*seats used/)).toBeVisible()
  await expect(page.getByText('All 5 seats are taken.')).toBeVisible()
  // Cancelling one frees a seat.
  await page.getByRole('button', { name: /Cancel invitation for x0-/ }).click()
  await expect(page.getByText(/4\s*of\s*5\s*seats used/)).toBeVisible()
})

test('a trial is not a payment; a recorded payment unlocks paid features and grants plan credits', async ({ page, browser }) => {
  const { email } = await newAccount(page, 'bill')
  const id = acct(email)
  // Trial over without payment: "trial ended", not paid.
  sql(`update "Account" set "trialEndsAt"=now() - interval '1 day' where id='${id}'`)
  await page.goto('/app/studio?tab=video')
  await expect(page.getByText('Your free trial has ended.')).toBeVisible()
  await expect(page.getByRole('link', { name: /trial ended/ }).first()).toBeAttached()

  // Super admin books a payment for one month.
  const admin = await browser.newPage()
  const a = await newAccount(admin, 'billadmin', 'Billing HQ')
  sql(`update "User" set role='SUPER_ADMIN' where email='${a.email}'`)
  await admin.goto(`/admin/companies/${id}`)
  await admin.getByRole('textbox', { name: 'Note' }).first().fill('bank transfer #1')
  await admin.getByRole('button', { name: 'Record payment' }).click()
  await expect(admin.getByText(/Paid until \d{4}-\d{2}-\d{2} · \+300 credits/)).toBeVisible()
  // A second month paid ahead: paid longer, but this month's credits only once.
  await admin.getByRole('textbox', { name: 'Note' }).first().fill('bank transfer #2')
  await admin.getByRole('button', { name: 'Record payment' }).click()
  await expect(admin.getByText(/Paid until \d{4}-\d{2}-\d{2}$/)).toBeVisible()
  await admin.close()
  expect(Number(sql(`select extract(day from "paidUntil" - now()) from "Account" where id='${id}'`))).toBeGreaterThan(55)
  expect(sql(`select "creditBalance" from "Account" where id='${id}'`)).toBe('350')
  expect(sql(`select count(*) from "CreditEntry" where "accountId"='${id}' and "idempotencyKey" like 'plan:%'`)).toBe('1')

  await page.reload()
  await expect(page.getByText('Your free trial has ended.')).toHaveCount(0)
  await expect(page.getByRole('link', { name: /Starter plan/ }).first()).toBeAttached()
})

test('Agency API: own keys, own companies, closed when the plan ends', async ({ page, request }) => {
  const { email } = await newAccount(page, 'api')
  const id = acct(email)
  const base = '/api/v1'
  // Trial on Starter: the API is open.
  await page.goto('/app/api')
  await expect(page.getByText('The API is open during your free trial.')).toBeVisible()
  await page.getByLabel('API key name').fill('CRM')
  await page.getByRole('button', { name: 'Create API key' }).click()
  const key = (await page.getByTestId('new-api-key').textContent())!.trim()
  expect(key).toMatch(/^lp_live_/)
  const auth = { Authorization: `Bearer ${key}` }

  expect((await request.get(`${base}/ping`, { headers: auth })).status()).toBe(200)
  // The existing company is reachable by its id.
  const list = await (await request.get(`${base}/workspaces`, { headers: auth })).json()
  const own = sql(`select id from "Workspace" where "accountId"='${id}'`)
  expect(list.workspaces.map((w: { externalId: string }) => w.externalId)).toEqual([own])
  // A company made through the API belongs to the account, within the limit.
  const made = await request.post(`${base}/workspaces`, { headers: auth, data: { externalId: 'client-1', name: 'Client One' } })
  expect(made.status()).toBe(200)
  expect(sql(`select count(*) from "Workspace" where "accountId"='${id}'`)).toBe('2')
  const third = await request.post(`${base}/workspaces`, { headers: auth, data: { externalId: 'client-2', name: 'Client Two' } })
  expect(third.status()).toBe(409)
  expect((await third.json()).error.code).toBe('company_limit')

  // Trial over on Starter: closed. Agency paid: open again.
  sql(`update "Account" set "trialEndsAt"=now() - interval '1 day' where id='${id}'`)
  const closed = await request.get(`${base}/ping`, { headers: auth })
  expect(closed.status()).toBe(403)
  expect((await closed.json()).error.code).toBe('plan_required')
  await page.reload()
  await expect(page.getByRole('heading', { name: 'The API is part of the Agency plan' })).toBeVisible()
  sql(`update "Account" set plan='AGENCY', "paidUntil"=now() + interval '20 days' where id='${id}'`)
  expect((await request.get(`${base}/ping`, { headers: auth })).status()).toBe(200)
})

test('social profiles count is shown against the plan', async ({ page }) => {
  await newAccount(page, 'prof')
  await page.goto('/app/channels')
  await expect(page.getByText(/Social profiles:\s*0\s*of 5 on your plan/)).toBeVisible()
})
