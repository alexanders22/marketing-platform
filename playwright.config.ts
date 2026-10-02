import { defineConfig } from '@playwright/test'

// E2E tests run against an already running dev server (npx next dev -p 3100)
// with mailpit on :1025/:18025 for emails.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3100',
    viewport: { width: 1360, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
})
