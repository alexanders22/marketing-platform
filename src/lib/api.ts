import { NextResponse } from 'next/server'
import type { Partner, Workspace } from '@prisma/client'
import { ZodError, type ZodType } from 'zod'
import { prisma } from './prisma'
import { sha256 } from './crypto'
import { apiAllowed } from './plans'

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message)
  }
}

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status })
}

// Wraps a route handler: turns ApiError / ZodError into JSON responses so
// partners always get { error: { code, message } }.
export function handler<C>(fn: (req: Request, ctx: C) => Promise<Response>) {
  return async (req: Request, ctx: C) => {
    try {
      return await fn(req, ctx)
    } catch (e) {
      if (e instanceof ApiError) {
        return json({ error: { code: e.code, message: e.message } }, e.status)
      }
      if (e instanceof ZodError) {
        return json({ error: { code: 'invalid_request', message: 'Invalid request body', issues: e.issues } }, 400)
      }
      console.error(e)
      return json({ error: { code: 'internal', message: 'Internal error' } }, 500)
    }
  }
}

export async function body<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    throw new ApiError(400, 'invalid_json', 'Body must be JSON')
  }
  return schema.parse(raw)
}

// Server-to-server auth: `Authorization: Bearer lp_live_…`.
export async function requirePartner(req: Request): Promise<Partner> {
  const header = req.headers.get('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!token) throw new ApiError(401, 'unauthorized', 'Missing API key')

  const apiKey = await prisma.apiKey.findUnique({
    where: { keyHash: sha256(token) },
    include: { partner: true },
  })
  if (!apiKey || apiKey.revokedAt) throw new ApiError(401, 'unauthorized', 'Invalid API key')
  if (apiKey.partner.status !== 'ACTIVE') throw new ApiError(403, 'partner_suspended', 'Partner is suspended')
  // A customer's own API access lives with their plan: Agency, or any plan
  // during the free trial.
  if (apiKey.partner.ownerAccountId) {
    const owner = await prisma.account.findUnique({
      where: { id: apiKey.partner.ownerAccountId },
      select: { plan: true, trialEndsAt: true, paidUntil: true, pausedAt: true },
    })
    if (!owner || owner.pausedAt) throw new ApiError(403, 'account_paused', 'This account is paused')
    if (!apiAllowed(owner)) throw new ApiError(403, 'plan_required', 'The API is part of the Agency plan')
  }

  // Fire-and-forget; a failed timestamp must not fail the request.
  prisma.apiKey.update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } }).catch(() => {})
  return apiKey.partner
}

// A partner can only ever reach its own workspaces, addressed by its own id.
export async function partnerWorkspace(partner: Partner, externalId: string): Promise<Workspace> {
  const ws = await prisma.workspace.findUnique({
    where: { partnerId_externalId: { partnerId: partner.id, externalId } },
    include: { account: { select: { pausedAt: true } } },
  })
  if (!ws) throw new ApiError(404, 'workspace_not_found', 'Workspace not found')
  if (ws.account?.pausedAt) throw new ApiError(403, 'account_paused', 'This account is paused')
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { account, ...rest } = ws
  return rest
}
