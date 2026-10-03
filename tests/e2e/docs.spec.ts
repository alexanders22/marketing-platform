import { expect, test } from '@playwright/test'
import { METRICS } from '../../src/lib/goal-metrics'

test('API docs: every section linked, every goal metric documented, code copyable', async ({ page }) => {
  await page.goto('/docs')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('marketing module')
  const broken = await page.$$eval('a[href^="#"]', (as) => as.map((a) => a.getAttribute('href')!).filter((h) => !document.querySelector(h)))
  expect(broken).toEqual([])
  const metrics = page.locator('#metrics table')
  for (const m of METRICS) await expect(metrics).toContainText(m.id)
  for (const path of ['/connect-links', '/channels', '/analytics', '/goals', '/alerts']) {
    await expect(page.locator('main')).toContainText(`/workspaces/{externalId}${path}`)
  }
  await expect(page.getByRole('button', { name: 'Copy code' }).first()).toBeVisible()
})
