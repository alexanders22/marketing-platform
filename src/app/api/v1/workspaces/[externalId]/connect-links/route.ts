import { z } from 'zod'
import { ApiError, body, handler, json, partnerWorkspace, requirePartner } from '@/lib/api'
import { appUrl } from '@/lib/mail'
import { metaEnabled } from '@/lib/meta'
import { seal } from '@/lib/signed'

const Input = z.object({
  network: z.literal('meta'),
  // Where the customer is sent afterwards, with ?loudpilot_status=connected|error.
  returnUrl: z.url().refine((u) => u.startsWith('https://') || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(u), 'returnUrl must be https'),
})

// A one-hour link the partner opens for its customer to connect Facebook,
// Instagram and Meta ad accounts to this workspace — no Loudpilot login needed.
export const POST = handler(async (req, ctx: RouteContext<'/api/v1/workspaces/[externalId]/connect-links'>) => {
  const partner = await requirePartner(req)
  const ws = await partnerWorkspace(partner, (await ctx.params).externalId)
  const input = await body(req, Input)
  if (!metaEnabled()) throw new ApiError(503, 'not_configured', 'Meta connections are not available yet')
  const ttl = 3600
  const token = seal({ ws: ws.id, ret: input.returnUrl }, ttl)
  return json({ url: `${appUrl()}/connect/meta?token=${token}`, expiresAt: new Date(Date.now() + ttl * 1000) }, 201)
})
