import Link from 'next/link'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { Badge, card, fmtDate } from '../shared'

export default async function AdminUsers({ searchParams }: PageProps<'/admin/users'>) {
  const sp = await searchParams
  const q = typeof sp.q === 'string' ? sp.q.trim() : ''
  const where: Prisma.UserWhereInput = q
    ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }] }
    : {}
  const users = await prisma.user.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 300,
    include: {
      memberships: { include: { account: { select: { id: true, name: true } } } },
      sessions: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } },
    },
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-xl font-semibold">Users</h1>
        {sp.deleted && <p className="text-sm text-emerald-700">User deleted.</p>}
      </div>
      <form className="flex gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search name or email"
          aria-label="Search users"
          className="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400 sm:max-w-sm"
        />
        <button className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white">Search</button>
      </form>
      <section className={`${card} overflow-x-auto p-0`}>
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-zinc-100 text-left text-xs text-zinc-500">
            <tr>
              <th className="px-5 py-3 font-medium">User</th>
              <th className="px-5 py-3 font-medium">Accounts</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium">Last sign-in</th>
              <th className="px-5 py-3 font-medium">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-zinc-50">
                <td className="px-5 py-3">
                  <Link href={`/admin/users/${u.id}`} className="font-medium hover:underline">
                    {u.name}
                  </Link>
                  <p className="text-xs text-zinc-500">{u.email}</p>
                </td>
                <td className="max-w-[240px] px-5 py-3 text-zinc-600">
                  {u.memberships.length === 0
                    ? '—'
                    : u.memberships.map((m, i) => (
                        <span key={m.id}>
                          {i > 0 && ', '}
                          <Link href={`/admin/companies/${m.account.id}`} className="hover:underline">
                            {m.account.name}
                          </Link>
                        </span>
                      ))}
                </td>
                <td className="space-x-1 px-5 py-3">
                  {u.role === 'SUPER_ADMIN' && <Badge tone="violet">Super admin</Badge>}
                  {u.disabledAt ? <Badge tone="red">Blocked</Badge> : <Badge tone="green">Active</Badge>}
                </td>
                <td className="px-5 py-3 whitespace-nowrap text-zinc-500">{fmtDate(u.sessions[0]?.createdAt)}</td>
                <td className="px-5 py-3 whitespace-nowrap text-zinc-500">{fmtDate(u.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {users.length === 0 && <p className="px-5 py-10 text-center text-sm text-zinc-500">No users match.</p>}
      </section>
    </div>
  )
}
