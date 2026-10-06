import Link from 'next/link'
import type { CreditReason } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { VAT } from '@/lib/tax'
import { card, daysAgo, fmtDateTime, REASON, Stat } from '../shared'

const KINDS: { id: string; label: string; reasons: CreditReason[] }[] = [
  { id: 'money', label: 'Payments & refunds', reasons: ['PURCHASE', 'REFUND'] },
  { id: 'manual', label: 'Bonuses & adjustments', reasons: ['GRANT', 'ADJUSTMENT'] },
  { id: 'usage', label: 'AI usage', reasons: ['AI_TEXT', 'AI_IMAGE', 'AI_VIDEO', 'AI_BLOG'] },
]

// Card payments are not connected yet: purchases are booked by hand (bank
// transfer, invoice) from a company's page and land here with trial grants.
export default async function AdminPayments({ searchParams }: PageProps<'/admin/payments'>) {
  const sp = await searchParams
  const kind = KINDS.find((k) => k.id === sp.kind) ?? KINDS[0]
  const since = daysAgo(30)
  const [rows, month, all, bookings] = await Promise.all([
    prisma.creditEntry.findMany({
      where: { reason: { in: kind.reasons } },
      orderBy: { createdAt: 'desc' },
      take: 300,
      include: { account: { select: { id: true, name: true } } },
    }),
    prisma.creditEntry.groupBy({ by: ['reason'], where: { createdAt: { gte: since } }, _sum: { amount: true }, _count: true }),
    prisma.creditEntry.groupBy({ by: ['reason'], _sum: { amount: true } }),
    prisma.adminLog.findMany({ where: { action: 'payment.record', createdAt: { gte: since } }, select: { details: true } }),
  ])
  // Money booked in the last 30 days (list prices include 18% VAT).
  const money = bookings.reduce(
    (s, b) => {
      const d = (b.details ?? {}) as { gross?: number; vat?: number; net?: number }
      return { gross: s.gross + (d.gross ?? 0), vat: s.vat + (d.vat ?? 0), net: s.net + (d.net ?? 0) }
    },
    { gross: 0, vat: 0, net: 0 },
  )
  const usd = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const sum = (g: { reason: CreditReason; _sum: { amount: number | null } }[], r: CreditReason[]) => g.filter((x) => r.includes(x.reason)).reduce((s, x) => s + (x._sum.amount ?? 0), 0)

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Payments</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Card payments aren&apos;t connected yet. Book a manual payment (bank transfer, invoice) on a company&apos;s page — it shows up here.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3" aria-label="Revenue, 30 days">
        <Stat label="Booked, 30 days (incl. VAT)" value={usd(money.gross)} sub={`${bookings.length} payments`} />
        <Stat label={`VAT ${Math.round(VAT.rate * 100)}% to pay`} value={usd(money.vat)} sub={VAT.country} />
        <Stat label="Net revenue, 30 days" value={usd(money.net)} />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Paid credits, 30 days" value={sum(month, ['PURCHASE']).toLocaleString()} sub={`${sum(all, ['PURCHASE']).toLocaleString()} all time`} />
        <Stat label="Refunded, 30 days" value={Math.abs(sum(month, ['REFUND'])).toLocaleString()} />
        <Stat label="Granted, 30 days" value={sum(month, ['GRANT', 'ADJUSTMENT']).toLocaleString()} sub="trials, bonuses, corrections" />
      </div>
      <div className="flex flex-wrap gap-1.5 text-sm">
        {KINDS.map((k) => (
          <Link
            key={k.id}
            href={`/admin/payments?kind=${k.id}`}
            className={`rounded-full px-3 py-1 ${k.id === kind.id ? 'bg-zinc-900 text-white' : 'bg-white text-zinc-700 ring-1 ring-zinc-200'}`}
          >
            {k.label}
          </Link>
        ))}
      </div>
      <section className={`${card} overflow-x-auto p-0`}>
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-zinc-100 text-left text-xs text-zinc-500">
            <tr>
              <th className="px-5 py-3 font-medium">When</th>
              <th className="px-5 py-3 font-medium">Account</th>
              <th className="px-5 py-3 font-medium">Type</th>
              <th className="px-5 py-3 font-medium">Note</th>
              <th className="px-5 py-3 text-right font-medium">Credits</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {rows.map((e) => (
              <tr key={e.id}>
                <td className="px-5 py-2.5 whitespace-nowrap text-zinc-500">{fmtDateTime(e.createdAt)}</td>
                <td className="px-5 py-2.5">
                  <Link href={`/admin/companies/${e.account.id}`} className="font-medium hover:underline">
                    {e.account.name}
                  </Link>
                </td>
                <td className="px-5 py-2.5">{REASON[e.reason] ?? e.reason}</td>
                <td className="max-w-xs truncate px-5 py-2.5 text-zinc-500">{e.note}</td>
                <td className={`px-5 py-2.5 text-right tabular-nums ${e.amount >= 0 ? 'font-medium text-emerald-600' : ''}`}>
                  {e.amount >= 0 ? '+' : ''}
                  {e.amount.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="px-5 py-10 text-center text-sm text-zinc-500">Nothing here yet.</p>}
      </section>
    </div>
  )
}
