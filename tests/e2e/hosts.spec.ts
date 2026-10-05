import { expect, test } from '@playwright/test'
import { crossHost } from '../../src/lib/hosts'

const SITE = 'https://loudpilot.app'
const TERMINAL = 'https://terminal.loudpilot.app'
const go = (host: string, path: string) => crossHost(host, path, SITE, TERMINAL)

test('product pages move to the terminal host', () => {
  for (const p of ['/app', '/app/planner', '/login', '/signup', '/reset-password', '/onboarding/company', '/admin', '/auth/meta/callback', '/auth/magic', '/connect/meta', '/oauth/authorize', '/paused']) {
    expect(go('loudpilot.app', p), p).toBe(TERMINAL + p)
    expect(go('www.loudpilot.app', p), p).toBe(TERMINAL + p)
    expect(go('terminal.loudpilot.app', p), p).toBeNull()
  }
})

test('site pages move to the site host; the terminal opens the app', () => {
  expect(go('terminal.loudpilot.app', '/')).toBe(TERMINAL + '/app')
  for (const p of ['/ka', '/ru/features/video', '/features/inbox', '/docs', '/privacy', '/terms', '/b/acme']) {
    expect(go('terminal.loudpilot.app', p), p).toBe(SITE + p)
    expect(go('loudpilot.app', p), p).toBeNull()
  }
  expect(go('loudpilot.app', '/')).toBeNull()
})

test('shared paths stay, and nothing moves without a terminal host', () => {
  for (const p of ['/api/v1/workspaces', '/api/mcp', '/media/abc', '/oauth/token', '/oauth/register', '/application', '/apps']) {
    expect(go('loudpilot.app', p), p).toBeNull()
    expect(go('terminal.loudpilot.app', p), p).toBeNull()
  }
  expect(crossHost('loudpilot.app', '/app', SITE, undefined)).toBeNull()
  expect(crossHost('localhost:3100', '/app', 'http://localhost:3100', 'http://localhost:3100')).toBeNull()
  expect(crossHost('evil.example', '/app', SITE, TERMINAL)).toBeNull()
})
