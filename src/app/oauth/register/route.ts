import { z } from 'zod'
import { CORS } from '@/lib/mcp/server'
import { prisma } from '@/lib/prisma'
import { validRedirect } from '@/lib/oauth'

const Input = z.object({
  client_name: z.string().max(100).optional(),
  redirect_uris: z.array(z.string().max(2000)).min(1).max(10),
  token_endpoint_auth_method: z.string().optional(),
})

// RFC 7591 dynamic client registration: AI apps (Claude, ChatGPT, Cursor …)
// register themselves. Public clients only — PKCE instead of a secret.
export async function POST(req: Request) {
  const fail = (description: string) =>
    Response.json({ error: 'invalid_client_metadata', error_description: description }, { status: 400, headers: CORS })
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return fail('Body must be JSON')
  }
  const parsed = Input.safeParse(raw)
  if (!parsed.success) return fail(parsed.error.issues[0].message)
  if (!parsed.data.redirect_uris.every(validRedirect)) {
    return Response.json({ error: 'invalid_redirect_uri', error_description: 'redirect_uris must be https, http on localhost or an app scheme' }, { status: 400, headers: CORS })
  }
  const client = await prisma.oAuthClient.create({
    data: { name: (parsed.data.client_name || 'AI assistant').slice(0, 100), redirectUris: parsed.data.redirect_uris },
  })
  return Response.json(
    {
      client_id: client.id,
      client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
      client_name: client.name,
      redirect_uris: client.redirectUris,
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
    },
    { status: 201, headers: CORS },
  )
}
export const OPTIONS = () => new Response(null, { status: 204, headers: CORS })
