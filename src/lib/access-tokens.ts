import 'server-only'
import { randomBytes } from 'node:crypto'
import { sha256 } from './crypto'
import { prisma } from './prisma'

// Keys for the MCP server: personal tokens a user creates, and OAuth tokens
// issued to AI apps. Both act as that user in one workspace; only hashes
// are stored.

const OAUTH_TTL_MS = 30 * 86_400_000

const newSecret = (prefix: string) => `${prefix}${randomBytes(30).toString('base64url')}`

export async function createPersonalToken(userId: string, workspaceId: string, name: string) {
  const token = newSecret('lp_pat_')
  const row = await prisma.accessToken.create({
    data: { userId, workspaceId, kind: 'PERSONAL', name: name.slice(0, 80) || 'Personal token', prefix: token.slice(0, 13), tokenHash: sha256(token) },
  })
  return { token, row }
}

export async function issueOAuthTokens(userId: string, workspaceId: string, clientId: string, clientName: string) {
  const access = newSecret('lp_oat_')
  const refresh = newSecret('lp_ort_')
  await prisma.accessToken.create({
    data: {
      userId,
      workspaceId,
      kind: 'OAUTH',
      name: clientName.slice(0, 80),
      prefix: access.slice(0, 13),
      tokenHash: sha256(access),
      refreshHash: sha256(refresh),
      clientId,
      expiresAt: new Date(Date.now() + OAUTH_TTL_MS),
    },
  })
  return { access_token: access, refresh_token: refresh, token_type: 'Bearer', expires_in: Math.floor(OAUTH_TTL_MS / 1000), scope: 'loudpilot' }
}

// Refresh rotates: the old pair stops working.
export async function refreshOAuthTokens(refreshToken: string, clientId: string) {
  const old = await prisma.accessToken.findUnique({ where: { refreshHash: sha256(refreshToken) } })
  if (!old || old.revokedAt || old.clientId !== clientId) return null
  await prisma.accessToken.update({ where: { id: old.id }, data: { revokedAt: new Date(), refreshHash: null } })
  return issueOAuthTokens(old.userId, old.workspaceId, clientId, old.name)
}

export type Caller = Awaited<ReturnType<typeof authenticate>>

// Bearer token → user, workspace, account and role; null if not valid.
export async function authenticate(req: Request) {
  const header = req.headers.get('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  // khma_ prefixes: tokens issued before the rename to Loudpilot.
  if (!/^(lp|khma)_(pat|oat)_/.test(token)) return null
  const row = await prisma.accessToken.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: true, workspace: { include: { account: true, brandKit: true } } },
  })
  if (!row || row.revokedAt || (row.expiresAt && row.expiresAt < new Date())) return null
  if (row.user.disabledAt || row.workspace.account?.pausedAt) return null
  // The user must still belong to the account that owns the workspace.
  const member = row.workspace.accountId
    ? await prisma.accountMember.findFirst({ where: { userId: row.userId, accountId: row.workspace.accountId } })
    : null
  if (!member || !row.workspace.account) return null
  prisma.accessToken.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }).catch(() => {})
  return { token: row, user: row.user, workspace: row.workspace, account: row.workspace.account, brand: row.workspace.brandKit, role: member.role }
}
