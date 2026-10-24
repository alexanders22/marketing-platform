import { expect, test } from '@playwright/test'
import { latestMail, newAccount, sql } from './helpers'

// Admin → Usage: customers per plan, companies, profiles, posts and credits;
// and the admins' email about every new sign-up.

test('a new sign-up emails the admins; Admin → Usage counts its company, profiles and posts', async ({ browser }) => {
  const admin = await browser.newPage()
  const { email: adminEmail } = await newAccount(admin, 'useadmin')
  sql(`update "User" set role='SUPER_ADMIN' where email='${adminEmail}'`)

  const customer = await browser.newPage()
  const brand = `Usage Bakery ${Date.now()}`
  const { email } = await newAccount(customer, 'usage', brand)
  await customer.close()
  const mail = await latestMail(adminEmail, `New sign-up: ${brand}`)
  expect(mail.Text).toContain(`${brand} signed up (${email}).`)
  expect(mail.Text).toContain('/admin/companies')

  // 80 posts this month and two social profiles: the most active company.
  const ws = sql(`select id from "Workspace" where name='${brand}'`)
  sql(`insert into "Post"(id,"workspaceId",content,status,"updatedAt") select 'usage-'||g||'-${Date.now()}','${ws}','Post '||g,(case when g<=10 then 'PUBLISHED' else 'DRAFT' end)::"PostStatus",now() from generate_series(1,80) g`)
  sql(`insert into "SocialAccount"(id,"workspaceId",network,"externalId",name,scopes,"updatedAt") values ('usage-fb-${Date.now()}','${ws}','FACEBOOK','u-fb-${Date.now()}','Bakery Page','{}',now()),('usage-ig-${Date.now()}','${ws}','INSTAGRAM','u-ig-${Date.now()}','bakery','{}',now())`)

  await admin.goto('/admin/usage')
  await expect(admin.getByRole('heading', { name: 'Usage' })).toBeVisible()
  const byPlan = admin.getByRole('table', { name: 'Usage by plan' })
  await expect(byPlan.getByRole('row').filter({ hasText: /^Start/ })).toBeVisible()
  await expect(byPlan.getByRole('row').filter({ hasText: /^Business/ })).toBeVisible()
  await expect(byPlan.getByRole('row').filter({ hasText: /^Agency/ })).toBeVisible()
  const top = admin.getByRole('table', { name: 'Most active companies' }).getByRole('row').filter({ hasText: brand })
  await expect(top).toContainText('Start')
  await expect(top).toContainText(/2\s*80$/)
  await expect(admin.getByRole('list', { name: 'Companies by activity' })).toContainText('60+ (very active)')
  await expect(admin.getByRole('list', { name: 'Social profiles by network' })).toContainText('Instagram')
  await admin.close()
})
