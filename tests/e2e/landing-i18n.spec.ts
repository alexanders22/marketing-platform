import { expect, test } from '@playwright/test'

// The landing in English (/), Georgian (/ka) and Russian (/ru): same page,
// translated, with a language dropdown that keeps you on the same page.

test('each language has its own address, title and lang attribute', async ({ page }) => {
  await page.goto('/ka')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('კონტენტი, ვიდეო და რეკლამა')
  await expect(page.locator('html')).toHaveAttribute('lang', 'ka')
  await expect(page).toHaveTitle(/AI მარკეტინგი/)
  await page.goto('/ru')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Контент, видео и реклама. Под управлением AI.')
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru')
  await expect(page.getByRole('link', { name: 'Попробовать', exact: true })).toHaveAttribute('href', '/signup')
  // Prices section in Russian, with the Veo allowance.
  await expect(page.getByText('AI-клипы (Veo) / мес').first()).toBeVisible()
  expect((await page.request.get('/en')).status()).toBe(404)
  expect((await page.request.get('/de')).status()).toBe(404)
})

test('hreflang alternates point at every language', async ({ page }) => {
  await page.goto('/ru/features/video')
  const alt = await page.locator('link[rel="alternate"][hreflang]').evaluateAll((els) => els.map((e) => `${e.getAttribute('hreflang')} ${new URL(e.getAttribute('href')!).pathname}`))
  expect(alt.sort()).toEqual(['en /features/video', 'ka /ka/features/video', 'ru /ru/features/video'])
})

test('the dropdown switches language on the same page and is remembered', async ({ page }) => {
  await page.goto('/features/inbox')
  const trigger = page.getByRole('button', { name: 'Language: English' })
  await trigger.click()
  const list = page.getByRole('listbox', { name: 'Language' })
  await expect(list.getByRole('option')).toHaveText([/English/, /ქართული/, /Русский/])
  await expect(list.getByRole('option', { name: /English/ })).toHaveAttribute('aria-selected', 'true')
  await list.getByRole('option', { name: /Русский/ }).click()
  await page.waitForURL(/\/ru\/features\/inbox$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Все переписки в одном инбоксе')
  // Links stay in Russian.
  await expect(page.getByRole('link', { name: 'Посмотреть цены' })).toHaveAttribute('href', '/ru#pricing')

  // Keyboard: open, arrow to Georgian, Enter.
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: 'Язык: Русский' }).focus()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('listbox', { name: 'Язык' })).toBeFocused()
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('Enter')
  await page.waitForURL(/\/ka\/features\/inbox$/)

  // Next visit to / opens the Georgian landing.
  await page.goto('/')
  await expect(page).toHaveURL(/\/ka$/)
  // Choosing English goes back and sticks.
  await page.getByRole('button', { name: /ენა/ }).first().click()
  await page.getByRole('option', { name: /English/ }).click()
  await page.waitForURL((u) => u.pathname === '/')
  await page.goto('/')
  await expect(page).toHaveURL((u) => u.pathname === '/')
})

test('mobile: the switcher is next to the menu button', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 760 })
  await page.goto('/ru')
  await page.getByRole('button', { name: 'Язык: Русский' }).click()
  await page.getByRole('option', { name: /ქართული/ }).click()
  await page.waitForURL(/\/ka$/)
  await page.getByRole('button', { name: 'მენიუს გახსნა' }).click()
  await expect(page.getByRole('navigation', { name: 'Mobile' }).getByRole('link', { name: 'ფასები' })).toHaveAttribute('href', '/ka#pricing')
})
