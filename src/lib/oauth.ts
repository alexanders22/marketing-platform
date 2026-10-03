import 'server-only'
import { createHash, randomBytes } from 'node:crypto'
import { sha256 } from './crypto'
import { appUrl } from './mail'
import { prisma } from './prisma'

// OAuth 2.1 for AI apps connecting to the MCP server: dynamic client
// registration, authorization code with PKCE (S256), refresh tokens.

export const NEXT_COOKIE = 'khma_next'

export const metadata = () => ({
  issuer: appUrl(),
  authorization_endpoint: `${appUrl()}/oauth/authorize`,
  token_endpoint: `${appUrl()}/oauth/token`,
  registration_endpoint: `${appUrl()}/oauth/register`,
  response_types_supported: ['code'],
  grant_types_supported: ['authorization_code', 'refresh_token'],
  code_challenge_methods_supported: ['S256'],
  token_endpoint_auth_methods_supported: ['none'],
  scopes_supported: ['loudpilot'],
})

export const resourceMetadata = () => ({
  resource: `${appUrl()}/api/mcp`,
  authorization_servers: [appUrl()],
  bearer_methods_supported: ['header'],
  scopes_supported: ['loudpilot'],
  resource_name: 'Loudpilot',
})

// https anywhere, http only on this machine, or an app's own scheme
// (cursor://, vscode://) — never javascript:, data: and friends.
export function validRedirect(uri: string) {
  try {
    const u = new URL(uri)
    if (u.hash) return false
    if (u.protocol === 'https:') return true
    if (u.protocol === 'http:') return ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)
    return /^[a-z][a-z0-9+.-]*:$/.test(u.protocol) && !['javascript:', 'data:', 'file:', 'vbscript:', 'blob:', 'about:'].includes(u.protocol)
  } catch {
    return false
  }
}

export type AuthorizeParams = {
  client_id: string
  redirect_uri: string
  code_challenge: string
  code_challenge_method: string
  state?: string
  response_type: string
}

export async function checkAuthorize(p: Partial<AuthorizeParams>) {
  if (p.response_type !== 'code') return { error: 'unsupported_response_type' }
  const client = p.client_id ? await prisma.oAuthClient.findUnique({ where: { id: p.client_id } }) : null
  if (!client) return { error: 'This app is not registered with Loudpilot.' }
  if (!p.redirect_uri || !client.redirectUris.includes(p.redirect_uri)) return { error: 'The return address does not match this app.' }
  if (p.code_challenge_method !== 'S256' || !p.code_challenge || !/^[A-Za-z0-9_-]{43,128}$/.test(p.code_challenge)) {
    return { error: 'PKCE (S256) is required.', redirect: true }
  }
  return { client }
}

export async function createCode(p: AuthorizeParams, userId: string, workspaceId: string) {
  const code = randomBytes(32).toString('base64url')
  await prisma.oAuthCode.create({
    data: {
      codeHash: sha256(code),
      clientId: p.client_id,
      userId,
      workspaceId,
      redirectUri: p.redirect_uri,
      codeChallenge: p.code_challenge,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    },
  })
  return code
}

export const pkceOk = (verifier: string, challenge: string) =>
  /^[A-Za-z0-9._~-]{43,128}$/.test(verifier) && createHash('sha256').update(verifier).digest('base64url') === challenge

export function withQuery(uri: string, q: Record<string, string | undefined>) {
  const u = new URL(uri)
  for (const [k, v] of Object.entries(q)) if (v !== undefined) u.searchParams.set(k, v)
  return u.toString()
}
