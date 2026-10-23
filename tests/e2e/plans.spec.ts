import { expect, test } from '@playwright/test'
import { latestMail, linkFrom, newAccount, sql, uniqueEmail } from './helpers'

// Plan limits (companies, social profiles; users are unlimited), the paid state, monthly
// plan credits and the Agency API.

const acct = (email: string) =>
  sql(`select m."accountId" from "AccountMember" m join "User" u on u.id=m."userId" where u.email='${email}'`)

test('every plan has unlimited users; Start invites teammates by email', async ({ page, browser }) => {
  const { email } = await newAccount(page, 'team')
  const id = acct(email)
  // No plan: no invitations.
  sql(`update "Account" set plan='NONE' where id='${id}'`)
  await page.goto('/app/team')
  await expect(page.getByLabel('Teammate email')).toBeDisabled()

  sql(`update "Account" set plan='STARTER' where id='${id}'`)
  await page.reload()
  await expect(page.getByText(/1\s*member/)).toBeVisible()
  await expect(page.getByText('Start plan · unlimited users')).toBeVisible()
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

  // Many pending invitations: still room for one more.
  for (let i = 0; i < 6; i++) {
    sql(
      `insert into "Invitation" (id, "accountId", email, role, "tokenHash", "invitedById", "expiresAt") values ('inv-${Date.now()}-${i}', '${id}', 'x${i}-${Date.now()}@khma.test', 'EDITOR', 'h-${Date.now()}-${i}', 'x', now() + interval '1 day')`,
    )
  }
  await page.reload()
  await expect(page.getByText(/2\s*members\s*·\s*6 invitations pending/)).toBeVisible()
  const next = uniqueEmail('mate2')
  await page.getByLabel('Teammate email').fill(next)
  await page.getByRole('button', { name: 'Send invite' }).click()
  await expect(page.getByText(`Invitation sent to ${next}`)).toBeVisible()
  // Cancelling one removes it.
  await page.getByRole('button', { name: /Cancel invitation for x0-/ }).click()
  await expect(page.getByText(/6 invitations pending/)).toBeVisible()
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
  // Start $29 plus 18% VAT ($5.22).
  await expect(admin.getByText(/Paid until \d{4}-\d{2}-\d{2} · \$34\.22 incl\. \$5\.22 VAT · \+200 credits/)).toBeVisible()
  // A second month paid ahead: paid longer, but this month's credits only once.
  await admin.getByRole('textbox', { name: 'Note' }).first().fill('bank transfer #2')
  await admin.getByRole('button', { name: 'Record payment' }).click()
  await expect(admin.getByText(/Paid until \d{4}-\d{2}-\d{2} · \$34\.22 incl\. \$5\.22 VAT$/)).toBeVisible()
  expect(sql(`select details->>'net' from "AdminLog" where action='payment.record' and "targetId"='${id}' order by "createdAt" desc limit 1`)).toBe('29')
  await admin.goto('/admin/payments')
  await expect(admin.getByText('VAT 18% to pay')).toBeVisible()
  await admin.close()
  expect(Number(sql(`select extract(day from "paidUntil" - now()) from "Account" where id='${id}'`))).toBeGreaterThan(55)
  expect(sql(`select "creditBalance" from "Account" where id='${id}'`)).toBe('250')
  expect(sql(`select count(*) from "CreditEntry" where "accountId"='${id}' and "idempotencyKey" like 'plan:%'`)).toBe('1')

  await page.reload()
  await expect(page.getByText('Your free trial has ended.')).toHaveCount(0)
  await expect(page.getByRole('link', { name: /Start plan/ }).first()).toBeAttached()
})

test('a plan smaller than the account is refused; a cheaper plan converts paid time; a dearer one is paid for even after the end', async ({ page }) => {
  const { email } = await newAccount(page, 'fit')
  const id = acct(email)
  // A trial on Agency with three companies: Start (1 company) is refused.
  sql(`update "Account" set plan='AGENCY' where id='${id}'`)
  for (const n of [1, 2]) sql(`insert into "Workspace"(id, name, "accountId", "updatedAt") values ('fit-${n}-${Date.now()}', 'Extra ${n}', '${id}', now())`)
  await page.goto('/app/plan')
  await page.getByRole('button', { name: 'Choose Start' }).click()
  await expect(page.getByText('You have 3 companies; Start includes 1. Remove 2 to switch.')).toBeVisible()
  expect(sql(`select plan from "Account" where id='${id}'`)).toBe('AGENCY')

  // Paid Agency, 30 days left: Business (3 companies) applies at once, the days converted at $75.
  sql(`update "Account" set "paidUntil"=now() + interval '30 days' where id='${id}'`)
  await page.reload()
  await page.getByRole('button', { name: 'Switch to Business' }).click()
  await page.waitForURL(/\/app\/credits$/)
  expect(sql(`select plan from "Account" where id='${id}'`)).toBe('TEAM')
  const days = Number(sql(`select extract(epoch from "paidUntil" - now()) / 86400 from "Account" where id='${id}'`))
  expect(days).toBeGreaterThan(78)
  expect(days).toBeLessThan(81)

  // Ended two days ago (the grace days): Agency is still bought, not picked.
  sql(`update "Account" set "paidUntil"=now() - interval '2 days' where id='${id}'`)
  await page.goto('/app/plan')
  await page.getByRole('button', { name: 'Choose Agency' }).click()
  await page.waitForURL(/\/app\/credits\?upgrade=AGENCY/)
  expect(sql(`select plan from "Account" where id='${id}'`)).toBe('TEAM')
  await expect(page.getByRole('region', { name: 'Upgrade your plan' }).getByText('Your Business plan has ended — a month of Agency starts today.')).toBeVisible()
})

test('Agency API: own keys, own companies, closed when the plan ends', async ({ page, request }) => {
  const { email } = await newAccount(page, 'api')
  const id = acct(email)
  const base = '/api/v1'
  // Trial on Start: the API is open.
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
  // Companies made through the API count against the plan: Start includes one.
  const second = await request.post(`${base}/workspaces`, { headers: auth, data: { externalId: 'client-1', name: 'Client One' } })
  expect(second.status()).toBe(409)
  expect((await second.json()).error.code).toBe('company_limit')

  // Trial over on Start: closed. Agency paid: open again.
  sql(`update "Account" set "trialEndsAt"=now() - interval '1 day' where id='${id}'`)
  const closed = await request.get(`${base}/ping`, { headers: auth })
  expect(closed.status()).toBe(403)
  expect((await closed.json()).error.code).toBe('plan_required')
  await page.reload()
  await expect(page.getByRole('heading', { name: 'The API is part of the Agency plan' })).toBeVisible()
  sql(`update "Account" set plan='AGENCY', "paidUntil"=now() + interval '20 days' where id='${id}'`)
  expect((await request.get(`${base}/ping`, { headers: auth })).status()).toBe(200)
  // A company made through the API belongs to the account.
  const made = await request.post(`${base}/workspaces`, { headers: auth, data: { externalId: 'client-1', name: 'Client One' } })
  expect(made.status()).toBe(200)
  expect(sql(`select count(*) from "Workspace" where "accountId"='${id}'`)).toBe('2')
})

test('social profiles count is shown against the plan', async ({ page }) => {
  await newAccount(page, 'prof')
  await page.goto('/app/channels')
  await expect(page.getByText(/Social profiles:\s*0\s*of 3 on your plan/)).toBeVisible()
})
