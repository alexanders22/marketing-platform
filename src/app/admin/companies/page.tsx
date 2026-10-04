import Link from 'next/link'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { Badge, card, fmtDate, planStatus } from '../shared'

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'paused', label: 'Paused' },
  { id: 'trial', label: 'Trial' },
  { id: 'partner', label: 'Via partner' },
] as const

export default async function AdminCompanies({ searchParams }: PageProps<'/admin/companies'>) {
  const sp = await searchParams
  const q = typeof sp.q === 'string' ? sp.q.trim() : ''
  const filter = typeof sp.filter === 'string' ? sp.filter : 'all'
  const where: Prisma.AccountWhereInput = {
    ...(q && {
      OR: [
        { name: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { workspaces: { some: { name: { contains: q, mode: 'insensitive' } } } },
        { members: { some: { user: { email: { contains: q, mode: 'insensitive' } } } } },
      ],
    }),
    ...(filter === 'active' && { pausedAt: null }),
    ...(filter === 'paused' && { pausedAt: { not: null } }),
    ...(filter === 'trial' && { trialEndsAt: { gt: new Date() } }),
    ...(filter === 'partner' && { partnerId: { not: null } }),
  }
  const accounts = await prisma.account.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: {
      partner: { select: { name: true } },
      workspaces: { select: { name: true }, orderBy: { createdAt: 'asc' } },
      _count: { select: { members: true } },
    },
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-xl font-semibold">Companies</h1>
        {sp.deleted && <p className="text-sm text-emerald-700">Account deleted.</p>}
      </div>
      <form className="flex flex-wrap gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search name, email, company, member"
          aria-label="Search companies"
          className="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400 sm:max-w-sm"
        />
        <input type="hidden" name="filter" value={filter} />
        <button className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white">Search</button>
      </form>
      <div className="flex flex-wrap gap-1.5 text-sm">
        {FILTERS.map((f) => (
          <Link
            key={f.id}
            href={`/admin/companies?filter=${f.id}${q ? `&q=${encodeURIComponent(q)}` : ''}`}
            className={`rounded-full px-3 py-1 ${filter === f.id ? 'bg-zinc-900 text-white' : 'bg-white text-zinc-700 ring-1 ring-zinc-200'}`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      <section className={`${card} overflow-x-auto p-0`}>
        <table className="w-full min-w-[760px] text-sm">
          <thead className="border-b border-zinc-100 text-left text-xs text-zinc-500">
            <tr>
              <th className="px-5 py-3 font-medium">Account</th>
              <th className="px-5 py-3 font-medium">Companies</th>
              <th className="px-5 py-3 font-medium">Plan</th>
              <th className="px-5 py-3 text-right font-medium">Credits</th>
              <th className="px-5 py-3 text-right font-medium">Members</th>
              <th className="px-5 py-3 font-medium">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {accounts.map((a) => {
              const st = planStatus(a)
              return (
                <tr key={a.id} className="hover:bg-zinc-50">
                  <td className="px-5 py-3">
                    <Link href={`/admin/companies/${a.id}`} className="font-medium hover:underline">
                      {a.name}
                    </Link>
                    <p className="text-xs text-zinc-500">
                      {a.email}
                      {a.partner && ` · via ${a.partner.name}`}
                    </p>
                  </td>
                  <td className="max-w-[220px] truncate px-5 py-3 text-zinc-600">{a.workspaces.map((w) => w.name).join(', ') || '—'}</td>
                  <td className="px-5 py-3">
                    <Badge tone={st.tone}>{st.label}</Badge>
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums">{a.creditBalance.toLocaleString()}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{a._count.members}</td>
                  <td className="px-5 py-3 whitespace-nowrap text-zinc-500">{fmtDate(a.createdAt)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {accounts.length === 0 && <p className="px-5 py-10 text-center text-sm text-zinc-500">No accounts match.</p>}
      </section>
    </div>
  )
}
