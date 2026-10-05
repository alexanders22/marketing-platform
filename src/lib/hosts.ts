// Two hosts: the marketing site (APP_URL, loudpilot.app) and the signed-in
// product (TERMINAL_URL, terminal.loudpilot.app). Without TERMINAL_URL
// (local dev, tests) everything lives on APP_URL.
//
// OAuth redirect URIs, signed media links, the MCP issuer and the partner
// API stay on APP_URL: they are registered with Meta / Google / clients and
// work on both hosts. A callback that lands on the site is forwarded to the
// terminal, where its state cookie lives.

const trim = (u: string) => u.replace(/\/$/, '')

export const siteUrl = () => trim(process.env.APP_URL ?? 'http://localhost:3100')
export const terminalUrl = () => trim(process.env.TERMINAL_URL || siteUrl())

// Pages that need the session cookie — they belong to the terminal.
const TERMINAL_PATHS = [
  '/app',
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/onboarding',
  '/admin',
  '/paused',
  '/auth',
  '/connect',
  '/oauth/authorize',
  '/oauth/consent',
]
// Public pages — they belong to the site.
const SITE_PATHS = ['/ka', '/ru', '/features', '/docs', '/privacy', '/terms', '/data-deletion', '/b']

const under = (path: string, list: string[]) => list.some((p) => path === p || path.startsWith(p + '/'))

// Where a request should go instead, or null to serve it here. Anything
// else (API, media, assets, /oauth/token…) is served on both hosts.
export function crossHost(host: string | null, path: string, site: string, terminal: string | undefined): string | null {
  if (!host || !terminal) return null
  const siteHost = new URL(site).host
  const terminalHost = new URL(terminal).host
  if (siteHost === terminalHost) return null
  if (host === terminalHost) {
    if (path === '/') return `${trim(terminal)}/app`
    if (under(path, SITE_PATHS)) return `${trim(site)}${path}`
    return null
  }
  if ((host === siteHost || host === `www.${siteHost}`) && under(path, TERMINAL_PATHS)) return `${trim(terminal)}${path}`
  return null
}
