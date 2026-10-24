import { randomBytes } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { META_STATE_COOKIE, metaAuthUrl, metaEnabled } from '@/lib/meta'
import { prisma } from '@/lib/prisma'
import { seal, unseal } from '@/lib/signed'

// Connect link made by a partner through the API: no Loudpilot login needed. The
// partner's customer lands here, signs in to Facebook, and is sent back to
// the partner's returnUrl.
//
// Whatever is connected lands in the link's workspace, so the visitor first
// sees on a Loudpilot page which company and which partner they connect to,
// and goes on to Facebook only by clicking (a link someone else sent can't
// take their Pages in one step). The state cookie is set here; without
// this page there is no valid state for the callback.

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

const page = (p: { company: string; partner: string; back: string; to: string; cancel: string }) => `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="robots" content="noindex">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Connect Facebook and Instagram — Loudpilot</title>
<style>
  body { margin: 0; background: #fafafa; color: #18181b; font: 15px/1.55 Inter, system-ui, -apple-system, 'Segoe UI', sans-serif; }
  main { max-width: 480px; margin: 10vh auto 0; padding: 0 16px; }
  .card { background: #fff; border: 1px solid #e4e4e7; border-radius: 16px; padding: 28px 24px; }
  .brand { font-weight: 700; font-size: 14px; letter-spacing: .01em; margin: 0 0 20px; }
  h1 { font-size: 20px; line-height: 1.3; margin: 0 0 12px; }
  p { margin: 0 0 12px; color: #3f3f46; }
  .warn { background: #fffbeb; border: 1px solid #fde68a; border-radius: 10px; padding: 10px 12px; color: #78350f; font-size: 14px; }
  .actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 20px; }
  .go { display: inline-block; padding: 11px 20px; background: #18181b; color: #fff; border-radius: 10px; text-decoration: none; font-weight: 600; }
  .no { display: inline-block; padding: 11px 16px; color: #52525b; text-decoration: none; }
  .small { font-size: 13px; color: #71717a; margin-top: 16px; }
</style>
<main>
  <div class="card">
    <p class="brand">Loudpilot</p>
    <h1>Connect Facebook and Instagram to ${esc(p.company)}</h1>
    <p><b>${esc(p.partner)}</b> asks you to connect the Facebook Pages, Instagram accounts and Meta ad accounts you choose to the company <b>${esc(p.company)}</b> on Loudpilot. It can then publish posts and see the results and ad data of those accounts.</p>
    <p class="warn">Continue only if ${esc(p.company)} is your company and you opened this from ${esc(p.partner)}. If someone sent you this link unexpectedly, close this page.</p>
    <div class="actions">
      <a class="go" href="${esc(p.to)}" rel="noreferrer">Continue to Facebook</a>
      <a class="no" href="${esc(p.cancel)}" rel="noreferrer">Cancel</a>
    </div>
    <p class="small">Afterwards you go back to ${esc(p.back)}.</p>
  </div>
</main>
</html>`

export async function GET(req: NextRequest) {
  const link = unseal<{ ws: string; ret: string }>(req.nextUrl.searchParams.get('token'))
  if (!link) return new Response('This connect link has expired. Please start again from the app you came from.', { status: 410 })
  const join = (q: string) => `${link.ret}${link.ret.includes('?') ? '&' : '?'}${q}`
  const back = (q: string) => NextResponse.redirect(join(q))
  if (!metaEnabled()) return back('loudpilot_status=error&loudpilot_reason=not_configured')
  const ws = await prisma.workspace.findUnique({ where: { id: link.ws }, select: { id: true, name: true, partner: { select: { name: true, ownerAccountId: true } } } })
  if (!ws) return back('loudpilot_status=error&loudpilot_reason=workspace_not_found')
  // Only partners make connect links (a customer's own API key can't).
  if (!ws.partner || ws.partner.ownerAccountId) return new Response('This connect link is not valid.', { status: 410 })

  const state = randomBytes(16).toString('base64url')
  const res = new NextResponse(
    page({
      company: ws.name,
      partner: ws.partner.name,
      back: new URL(link.ret).host,
      to: metaAuthUrl(state),
      cancel: join('loudpilot_status=error&loudpilot_reason=cancelled'),
    }),
    { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } },
  )
  res.cookies.set(META_STATE_COOKIE, seal({ s: state, ws: link.ws, ret: link.ret }, 900), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/auth/meta',
    maxAge: 900,
  })
  return res
}
