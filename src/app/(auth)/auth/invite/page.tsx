import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { sha256 } from '@/lib/crypto'
import { prisma } from '@/lib/prisma'
import { acceptInvite } from './actions'

export const metadata: Metadata = { title: 'Join the team — Loudpilot' }

// The emailed link lands here; joining needs one click, so link scanners
// that only GET the page cannot use up the invitation.
export default async function InvitePage({ searchParams }: PageProps<'/auth/invite'>) {
  const { token } = await searchParams
  if (typeof token !== 'string' || !token) redirect('/login?error=invite')
  const invite = await prisma.invitation.findUnique({
    where: { tokenHash: sha256(token) },
    include: { account: { select: { name: true } } },
  })
  const valid = invite && !invite.acceptedAt && invite.expiresAt > new Date()
  if (!valid) {
    return (
      <div className="text-center">
        <h1 className="text-xl font-semibold">This invitation can&apos;t be used</h1>
        <p className="mt-2 text-sm text-zinc-500">It was already used, cancelled or has expired. Ask your teammate to send a new one.</p>
      </div>
    )
  }
  return (
    <form action={acceptInvite} className="text-center">
      <input type="hidden" name="token" value={token} />
      <h1 className="text-xl font-semibold">Join {invite.account.name}</h1>
      <p className="mt-1 text-sm text-zinc-500">
        You&apos;ll be signed in as <b className="text-zinc-700">{invite.email}</b>.
      </p>
      <button className="mt-6 w-full rounded-lg bg-zinc-900 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800">Join the team</button>
    </form>
  )
}
