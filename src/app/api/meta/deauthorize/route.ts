import { forgetMetaUser } from '@/lib/meta-cleanup'
import { metaEnabled, parseSignedRequest } from '@/lib/meta'

// Meta calls this when someone removes the Loudpilot app from their account.
export async function POST(req: Request) {
  if (!metaEnabled()) return new Response('Not configured', { status: 404 })
  const form = await req.formData().catch(() => null)
  const data = parseSignedRequest(String(form?.get('signed_request') ?? ''))
  if (!data) return new Response('Bad signature', { status: 400 })
  await forgetMetaUser(data.user_id)
  return Response.json({ ok: true })
}
