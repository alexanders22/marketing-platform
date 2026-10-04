import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireSuperAdmin } from '@/lib/admin'
import { prisma } from '@/lib/prisma'
import { blockUser, deleteUser, signOutUser, unblockUser, updateUser } from '../../actions'
import { ActionButton, ActionForm, ConfirmDelete } from '../../ui'
import { Badge, card, fmtDate, fmtDateTime } from '../../shared'

const input = 'mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400'
const label = 'block text-sm font-medium text-zinc-700'

export default async function AdminUser({ params }: PageProps<'/admin/users/[id]'>) {
  const { id } = await params
  const admin = await requireSuperAdmin()
  const u = await prisma.user.findUnique({
    where: { id },
    include: {
      memberships: { include: { account: { select: { id: true, name: true, pausedAt: true, _count: { select: { members: true } } } } } },
      _count: { select: { sessions: true, accessTokens: { where: { revokedAt: null } } } },
    },
  })
  if (!u) notFound()
  const logs = await prisma.adminLog.findMany({ where: { targetType: 'user', targetId: id }, orderBy: { createdAt: 'desc' }, take: 20 })
  const self = u.id === admin.id
  // Accounts that would be left without an owner if this user went away.
  const soleOwner = await prisma.account.findMany({
    where: { members: { some: { userId: id, role: 'OWNER' }, none: { role: 'OWNER', userId: { not: id } } } },
    select: { name: true },
  })

  return (
    <div className="space-y-5">
      <Link href="/admin/users" className="text-sm text-zinc-500 hover:text-zinc-900">
        ← Users
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold">
            {u.name}
            {u.role === 'SUPER_ADMIN' && <Badge tone="violet">Super admin</Badge>}
            {u.disabledAt ? <Badge tone="red">Blocked</Badge> : <Badge tone="green">Active</Badge>}
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            {u.email} · joined {fmtDate(u.createdAt)} · {u.passwordHash ? 'password' : u.googleId ? 'Google' : 'magic link'} sign-in ·{' '}
            {u._count.sessions} active session{u._count.sessions === 1 ? '' : 's'} · {u._count.accessTokens} AI tokens
          </p>
        </div>
        {!self && (
          <div className="flex flex-wrap gap-2">
            <ActionButton action={signOutUser.bind(null, u.id)}>Sign out everywhere</ActionButton>
            {u.disabledAt ? (
              <ActionButton action={unblockUser.bind(null, u.id)} tone="dark">
                Unblock
              </ActionButton>
            ) : (
              <ActionButton action={blockUser.bind(null, u.id)} confirm={`Block ${u.email}? They are signed out at once.`} tone="danger">
                Block
              </ActionButton>
            )}
          </div>
        )}
      </div>
      {u.disabledAt && (
        <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 ring-1 ring-red-200">
          Blocked since {fmtDateTime(u.disabledAt)}: can&apos;t sign in, sessions and AI tokens are revoked.
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <section className={card}>
          <h2 className="font-semibold">Accounts</h2>
          <ul className="mt-3 divide-y divide-zinc-100 text-sm">
            {u.memberships.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 py-2.5">
                <Link href={`/admin/companies/${m.account.id}`} className="font-medium hover:underline">
                  {m.account.name}
                </Link>
                <span className="flex items-center gap-2 text-zinc-500">
                  {m.account.pausedAt && <Badge tone="amber">Paused</Badge>}
                  {m.role.toLowerCase()}
                </span>
              </li>
            ))}
            {u.memberships.length === 0 && <li className="py-2.5 text-zinc-500">No accounts (onboarding not finished).</li>}
          </ul>
          {logs.length > 0 && (
            <>
              <h2 className="mt-6 font-semibold">Admin history</h2>
              <ul className="mt-2 space-y-1.5 text-xs text-zinc-600">
                {logs.map((l) => (
                  <li key={l.id}>
                    <b className="font-medium text-zinc-800">{l.action}</b> · {l.adminEmail} · {fmtDateTime(l.createdAt)}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <div className="space-y-5">
          <section className={card}>
            <h2 className="font-semibold">Profile</h2>
            <ActionForm action={updateUser.bind(null, u.id)} submit="Save" className="mt-3 space-y-3">
              <label className={label}>
                Name
                <input name="name" defaultValue={u.name} required className={input} />
              </label>
              <label className={label}>
                Email
                <input name="email" type="email" defaultValue={u.email} required className={input} />
              </label>
              <label className={label}>
                Role
                <select name="role" defaultValue={u.role} className={input}>
                  <option value="USER">User</option>
                  <option value="SUPER_ADMIN">Super admin</option>
                </select>
              </label>
            </ActionForm>
          </section>
          {!self && (
            <section className={card}>
              <h2 className="font-semibold text-red-700">Delete user</h2>
              <p className="mt-1 mb-3 text-sm text-zinc-500">
                Removes the user and their memberships. Their accounts and companies stay.
                {soleOwner.length > 0 && (
                  <b className="mt-1 block font-medium text-amber-800">
                    Only owner of: {soleOwner.map((a) => a.name).join(', ')} — make someone else owner first, or that account has no owner.
                  </b>
                )}
              </p>
              <ConfirmDelete action={deleteUser.bind(null, u.id)} expected={u.email} what="user" />
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
