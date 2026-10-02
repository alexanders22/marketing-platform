import { randomBytes } from 'node:crypto'
import { appUrl } from '@/lib/mail'
import { forgetMetaUser } from '@/lib/meta-cleanup'
import { metaEnabled, parseSignedRequest } from '@/lib/meta'
import { prisma } from '@/lib/prisma'

// Meta "data deletion request" callback: delete at once and return a code
// the person can check on /data-deletion.
export async function POST(req: Request) {
  if (!metaEnabled()) return new Response('Not configured', { status: 404 })
  const form = await req.formData().catch(() => null)
  const data = parseSignedRequest(String(form?.get('signed_request') ?? ''))
  if (!data) return new Response('Bad signature', { status: 400 })

  const code = randomBytes(9).toString('base64url')
  await prisma.metaDeletion.create({ data: { code, metaUserId: data.user_id } })
  await forgetMetaUser(data.user_id)
  await prisma.metaDeletion.update({ where: { code }, data: { completedAt: new Date() } })
  return Response.json({ url: `${appUrl()}/data-deletion?code=${code}`, confirmation_code: code })
}
