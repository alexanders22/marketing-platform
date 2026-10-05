import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/EmptyState'
import { requireContext } from '@/lib/context'
import { PLANS } from '@/lib/plans'
import { prisma } from '@/lib/prisma'
import { seatLimit, seatsUsed } from '@/lib/team'
import { InviteForm, MemberActions, RevokeButton } from './TeamForms'

export const metadata: Metadata = { title: 'Team — Loudpilot' }

const ROLE_LABEL = { OWNER: 'Owner', ADMIN: 'Admin', EDITOR: 'Editor' } as const

export default async function TeamPage() {
  const { user, account, role, asAdmin } = await requireContext()
  const now = new Date()
  const [members, invites, seats] = await Promise.all([
    prisma.accountMember.findMany({
      where: { accountId: account.id },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { id: 'asc' },
    }),
    prisma.invitation.findMany({ where: { accountId: account.id, acceptedAt: null, expiresAt: { gt: now } }, orderBy: { createdAt: 'desc' } }),
    seatsUsed(account.id),
  ])
  const limit = seatLimit(account.plan)
  const canManage = role !== 'EDITOR' || asAdmin
  const full = seats.used >= limit && !asAdmin
  const plan = PLANS.find((p) => p.id === account.plan)

  return (
    <>
      <PageHeader
        title="Team"
        sub={`Everyone here works on all companies of ${account.name}. Owners and admins manage channels, billing and the team; editors create and publish.`}
      />

      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl bg-zinc-50 px-4 py-3 text-sm ring-1 ring-zinc-200">
        <span>
          <b className="tabular-nums">{seats.used}</b> of <b className="tabular-nums">{limit}</b> seat{limit === 1 ? '' : 's'} used
          {seats.pending > 0 && <span className="text-zinc-500"> · {seats.pending} invitation{seats.pending === 1 ? '' : 's'} pending</span>}
        </span>
        <span className="text-zinc-500">{plan ? `${plan.name} plan` : 'No plan'}</span>
        {full && (
          <Link href="/app/plan" className="ml-auto font-medium text-indigo-700 hover:underline">
            Need more seats? See plans
          </Link>
        )}
      </div>

      {canManage && <InviteForm disabled={full} limit={limit} />}

      <ul className="mt-6 divide-y divide-zinc-100 rounded-xl border border-zinc-200">
        {members.map((m) => (
          <li key={m.id} className="flex min-w-0 flex-wrap items-center gap-3 p-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-zinc-100 text-sm font-semibold text-zinc-600">
              {(m.user.name || m.user.email)[0].toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {m.user.name} {m.user.id === user.id && <span className="text-zinc-400">(you)</span>}
              </p>
              <p className="truncate text-xs text-zinc-500">{m.user.email}</p>
            </div>
            <MemberActions
              id={m.id}
              role={m.role}
              label={ROLE_LABEL[m.role]}
              canEdit={canManage && m.role !== 'OWNER'}
              canLeave={m.user.id === user.id && m.role !== 'OWNER'}
              name={m.user.name || m.user.email}
            />
          </li>
        ))}
        {invites.map((i) => (
          <li key={i.id} className="flex min-w-0 flex-wrap items-center gap-3 p-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-dashed border-zinc-300 text-xs text-zinc-400">
              @
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{i.email}</p>
              <p className="truncate text-xs text-zinc-500">Invited as {ROLE_LABEL[i.role]} · waiting to join</p>
            </div>
            {canManage && <RevokeButton id={i.id} email={i.email} />}
          </li>
        ))}
      </ul>
    </>
  )
}
