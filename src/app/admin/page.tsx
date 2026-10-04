import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { PLANS } from '@/lib/plans'
import { card, daysAgo, fmtDateTime, Stat } from './shared'

export default async function AdminOverview() {
  const since = daysAgo(30)
  const now = daysAgo(0)
  const [accounts, paused, workspaces, users, newUsers, blocked, plans, purchases, granted, spent, logs, recent] = await Promise.all([
    prisma.account.count(),
    prisma.account.count({ where: { pausedAt: { not: null } } }),
    prisma.workspace.count({ where: { accountId: { not: null } } }),
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: since } } }),
    prisma.user.count({ where: { disabledAt: { not: null } } }),
    prisma.account.groupBy({
      by: ['plan', 'billingCycle'],
      where: { plan: { not: 'NONE' }, pausedAt: null, OR: [{ trialEndsAt: null }, { trialEndsAt: { lte: now } }] },
      _count: true,
    }),
    prisma.creditEntry.aggregate({ where: { reason: 'PURCHASE', createdAt: { gte: since } }, _sum: { amount: true }, _count: true }),
    prisma.creditEntry.aggregate({ where: { reason: 'GRANT', createdAt: { gte: since } }, _sum: { amount: true } }),
    prisma.creditEntry.aggregate({ where: { amount: { lt: 0 }, createdAt: { gte: since } }, _sum: { amount: true } }),
    prisma.adminLog.findMany({ orderBy: { createdAt: 'desc' }, take: 8 }),
    prisma.account.findMany({ orderBy: { createdAt: 'desc' }, take: 6, select: { id: true, name: true, email: true, createdAt: true } }),
  ])
  // Paying plans only (trials and paused excluded); yearly counted per month.
  const mrr = plans.reduce((s, p) => {
    const price = PLANS.find((x) => x.id === p.plan)?.monthly ?? 0
    return s + price * (p.billingCycle === 'YEARLY' ? 10 / 12 : 1) * p._count
  }, 0)
  const paying = plans.reduce((s, p) => s + p._count, 0)

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Overview</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Accounts" value={accounts} sub={`${workspaces} companies · ${paused} paused`} />
        <Stat label="Users" value={users} sub={`${newUsers} new in 30 days · ${blocked} blocked`} />
        <Stat label="Plan revenue / month" value={`$${Math.round(mrr).toLocaleString()}`} sub={`${paying} paying accounts (list price)`} />
        <Stat
          label="Credits, last 30 days"
          value={`${(purchases._sum.amount ?? 0).toLocaleString()} bought`}
          sub={`${(granted._sum.amount ?? 0).toLocaleString()} granted · ${Math.abs(spent._sum.amount ?? 0).toLocaleString()} spent`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className={card}>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">New accounts</h2>
            <Link href="/admin/companies" className="text-sm text-zinc-500 hover:text-zinc-900">
              All →
            </Link>
          </div>
          <ul className="mt-3 divide-y divide-zinc-100">
            {recent.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <Link href={`/admin/companies/${a.id}`} className="min-w-0 truncate font-medium hover:underline">
                  {a.name} <span className="font-normal text-zinc-500">· {a.email}</span>
                </Link>
                <span className="shrink-0 text-xs text-zinc-500">{fmtDateTime(a.createdAt)}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className={card}>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Admin activity</h2>
            <Link href="/admin/activity" className="text-sm text-zinc-500 hover:text-zinc-900">
              All →
            </Link>
          </div>
          {logs.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-500">Nothing yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-zinc-100">
              {logs.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="min-w-0 truncate">
                    <b className="font-medium">{l.action}</b> <span className="text-zinc-500">· {l.adminEmail}</span>
                  </span>
                  <span className="shrink-0 text-xs text-zinc-500">{fmtDateTime(l.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
