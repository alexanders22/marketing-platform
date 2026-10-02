import { expect, test } from '@playwright/test'
import { newAccount, sql } from './helpers'

test('new account lands in planner with 50 trial credits', async ({ page }) => {
  const { email } = await newAccount(page, 'smoke')
  await expect(page.getByText('Credits left')).toBeVisible()
  expect(sql(`select a."creditBalance" from "Account" a join "AccountMember" m on m."accountId"=a.id join "User" u on u.id=m."userId" where u.email='${email}'`)).toBe('50')
})
