import { issueOAuthTokens, refreshOAuthTokens } from '@/lib/access-tokens'
import { sha256 } from '@/lib/crypto'
import { CORS } from '@/lib/mcp/server'
import { pkceOk } from '@/lib/oauth'
import { prisma } from '@/lib/prisma'

const fail = (error: string, description: string, status = 400) =>
  Response.json({ error, error_description: description }, { status, headers: { ...CORS, 'cache-control': 'no-store' } })

export async function POST(req: Request) {
  const type = req.headers.get('content-type') ?? ''
  const p: Record<string, string> = type.includes('application/json')
    ? await req.json().catch(() => ({}))
    : Object.fromEntries((await req.formData().catch(() => new FormData())).entries() as Iterable<[string, string]>)

  if (p.grant_type === 'authorization_code') {
    const code = p.code ? await prisma.oAuthCode.findUnique({ where: { codeHash: sha256(p.code) } }) : null
    if (!code || code.usedAt || code.expiresAt < new Date()) return fail('invalid_grant', 'The code is invalid or expired')
    if (code.clientId !== p.client_id || code.redirectUri !== p.redirect_uri) return fail('invalid_grant', 'client_id or redirect_uri does not match')
    if (!pkceOk(p.code_verifier ?? '', code.codeChallenge)) return fail('invalid_grant', 'PKCE verification failed')
    // One use only, even under a race.
    const used = await prisma.oAuthCode.updateMany({ where: { id: code.id, usedAt: null }, data: { usedAt: new Date() } })
    if (used.count !== 1) return fail('invalid_grant', 'The code was already used')
    const client = await prisma.oAuthClient.findUnique({ where: { id: code.clientId } })
    const tokens = await issueOAuthTokens(code.userId, code.workspaceId, code.clientId, client?.name ?? 'AI assistant')
    return Response.json(tokens, { headers: { ...CORS, 'cache-control': 'no-store' } })
  }

  if (p.grant_type === 'refresh_token') {
    const tokens = p.refresh_token && p.client_id ? await refreshOAuthTokens(p.refresh_token, p.client_id) : null
    if (!tokens) return fail('invalid_grant', 'The refresh token is invalid')
    return Response.json(tokens, { headers: { ...CORS, 'cache-control': 'no-store' } })
  }

  return fail('unsupported_grant_type', 'Use authorization_code or refresh_token')
}
export const OPTIONS = () => new Response(null, { status: 204, headers: CORS })
