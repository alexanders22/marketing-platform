import Link from 'next/link'
import type { CreditReason } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getPlans } from '@/lib/credits'
import { monremCurrency, monremEnabled, type MonremPlan } from '@/lib/monrem'
import { monremPlans, planAmount, recurringOption, recurringRefs } from '@/lib/payments'
import { yearlyTotal } from '@/lib/plans'
import { priceLabel } from '@/lib/pricing'
import { saveRecurringPlans } from '../actions'
import { ActionForm } from '../ui'
import { VAT, grossOf } from '@/lib/tax'
import { card, daysAgo, fmtDateTime, REASON, Stat } from '../shared'
import { requireSuperAdmin } from '@/lib/admin'

const KINDS: { id: string; label: string; reasons: CreditReason[] }[] = [
  { id: 'money', label: 'Payments & refunds', reasons: ['PURCHASE', 'REFUND'] },
  { id: 'manual', label: 'Bonuses & adjustments', reasons: ['GRANT', 'ADJUSTMENT'] },
  { id: 'usage', label: 'AI usage', reasons: ['AI_TEXT', 'AI_IMAGE', 'AI_VIDEO', 'AI_BLOG'] },
]

// Card payments are not connected yet: purchases are booked by hand (bank
// transfer, invoice) from a company's page and land here with trial grants.
const withVat = (o: { usd: number; gel: number }) => ({ usd: grossOf(o.usd), gel: grossOf(o.gel) })

export default async function AdminPayments({ searchParams }: PageProps<'/admin/payments'>) {
  // Checked here, not only in the layout: a client navigation can render this
  // page without running the layout.
  await requireSuperAdmin()
  const sp = await searchParams
  const kind = KINDS.find((k) => k.id === sp.kind) ?? KINDS[0]
  const since = daysAgo(30)
  const [rows, month, all, bookings, cards] = await Promise.all([
    prisma.creditEntry.findMany({
      where: { reason: { in: kind.reasons } },
      orderBy: { createdAt: 'desc' },
      take: 300,
      include: { account: { select: { id: true, name: true } } },
    }),
    prisma.creditEntry.groupBy({ by: ['reason'], where: { createdAt: { gte: since } }, _sum: { amount: true }, _count: true }),
    prisma.creditEntry.groupBy({ by: ['reason'], _sum: { amount: true } }),
    prisma.adminLog.findMany({ where: { action: 'payment.record', createdAt: { gte: since } }, select: { details: true } }),
    prisma.payment.findMany({ orderBy: { createdAt: 'desc' }, take: 50, include: { account: { select: { id: true, name: true } } } }),
  ])
  // Auto-renewal: our plans × cycles mapped to Monrem recurring billing plans.
  const enabled = monremEnabled()
  const [refs, mPlans, subs] = enabled
    ? await Promise.all([
        recurringRefs(),
        monremPlans(true).then(
          (l) => ({ list: l, error: null as string | null }),
          (e: unknown) => ({ list: [] as MonremPlan[], error: e instanceof Error ? e.message : 'Monrem did not answer' }),
        ),
        prisma.subscription.findMany({ orderBy: { createdAt: 'desc' }, take: 30, include: { account: { select: { id: true, name: true } } } }),
      ])
    : [{}, { list: [] as MonremPlan[], error: null }, []]
  // Each slot with the price its Monrem plan must have: Admin → Pricing plus VAT.
  const cur = monremCurrency()
  const slots = (await getPlans()).flatMap((p) =>
    (['MONTHLY', 'YEARLY'] as const).map((cycle) => ({
      plan: p,
      cycle,
      key: `${p.id}_${cycle}` as const,
      price: priceLabel(withVat(cycle === 'YEARLY' ? { usd: yearlyTotal(p.monthly), gel: yearlyTotal(p.monthlyGel) } : { usd: p.monthly, gel: p.monthlyGel }), cur),
    })),
  )
  const ready = enabled ? await Promise.all(slots.map((x) => recurringOption(x.plan.id, x.cycle))) : []
  // Card payments approved in the last 30 days, per currency (amounts in cents, VAT included).
  const cardTotals = cards
    .filter((c) => c.status === 'APPROVED' && c.createdAt >= since)
    .reduce<Record<string, number>>((t, c) => ({ ...t, [c.currency]: (t[c.currency] ?? 0) + c.amount / 100 }), {})
  // Money booked in the last 30 days (list prices plus 18% VAT).
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
          {monremEnabled()
            ? 'Card payments run through Monrem. Book a manual payment (bank transfer, invoice) on a company’s page — it shows up here too.'
            : 'Card payments aren’t connected yet (set the MONREM_* variables). Book a manual payment (bank transfer, invoice) on a company’s page — it shows up here.'}
        </p>
      </div>
      <section className={`${card} overflow-x-auto p-0`} aria-label="Card payments">
        <div className="flex flex-wrap items-baseline gap-3 border-b border-zinc-100 px-5 py-3">
          <h2 className="font-semibold">Card payments</h2>
          <span className="text-xs text-zinc-500">
            Approved, 30 days:{' '}
            {Object.keys(cardTotals).length
              ? Object.entries(cardTotals)
                  .map(([cur, v]) => `${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cur}`)
                  .join(' · ')
              : '—'}
          </span>
        </div>
        {cards.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-zinc-500">No card payments yet.</p>
        ) : (
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-zinc-100 text-left text-xs text-zinc-500">
              <tr>
                <th className="px-5 py-3 font-medium">When</th>
                <th className="px-5 py-3 font-medium">Account</th>
                <th className="px-5 py-3 font-medium">For</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {cards.map((c) => (
                <tr key={c.id}>
                  <td className="px-5 py-2.5 whitespace-nowrap text-zinc-500">{fmtDateTime(c.createdAt)}</td>
                  <td className="px-5 py-2.5">
                    <Link href={`/admin/companies/${c.account.id}`} className="font-medium hover:underline">
                      {c.account.name}
                    </Link>
                  </td>
                  <td className="px-5 py-2.5">{c.kind === 'PACK' ? `${c.credits?.toLocaleString()} credits` : `${c.plan?.toLowerCase()} · ${c.cycle === 'YEARLY' ? '1 year' : '1 month'}`}</td>
                  <td className="px-5 py-2.5">
                    <span className={c.status === 'APPROVED' ? 'text-emerald-700' : c.status === 'DECLINED' ? 'text-red-600' : 'text-amber-700'}>{c.status.toLowerCase()}</span>
                    {c.statusDescription && c.status !== 'APPROVED' && <span className="block max-w-56 truncate text-xs text-zinc-400">{c.statusDescription}</span>}
                  </td>
                  <td className="px-5 py-2.5 text-right tabular-nums">
                    {(c.amount / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })} {c.currency}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      {enabled && (
        <section className={card} aria-label="Auto-renewal">
          <h2 className="font-semibold">Auto-renewal</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Create a recurring billing plan for each price in Monrem&apos;s Merchant Portal, then pick it here. A plan renews automatically only when its Monrem price equals ours (Admin → Pricing).
          </p>
          {mPlans.error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{mPlans.error}</p>}
          <ActionForm action={saveRecurringPlans} submit="Save" className="mt-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {slots.map((x, i) => (
                <label key={x.key} className="block text-sm font-medium text-zinc-700">
                  {x.plan.name} · {x.cycle === 'YEARLY' ? 'yearly' : 'monthly'} · {x.price}{' '}
                  <span className={`text-xs font-normal ${ready[i] ? 'text-emerald-600' : 'text-zinc-400'}`}>{ready[i] ? '· renews automatically' : refs[x.key] ? '· price differs or plan inactive' : '· pay once only'}</span>
                  <select name={x.key} defaultValue={refs[x.key] ?? ''} aria-label={`${x.plan.name} ${x.cycle.toLowerCase()} recurring plan`} className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm">
                    <option value="">— none —</option>
                    {mPlans.list
                      .filter((m) => m.ref_id)
                      .map((m) => {
                        const a = planAmount(m)
                        return (
                          <option key={m.ref_id} value={m.ref_id!}>
                            {m.name ?? m.ref_id} · {(a.amount / 100).toFixed(2)} {a.currency}
                            {m.is_active ? '' : ' · inactive'}
                          </option>
                        )
                      })}
                  </select>
                </label>
              ))}
            </div>
          </ActionForm>
          {subs.length > 0 && (
            <ul className="mt-5 divide-y divide-zinc-100 border-t border-zinc-100 text-sm" aria-label="Subscriptions">
              {subs.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-2">
                  <Link href={`/admin/companies/${s.account.id}`} className="font-medium hover:underline">
                    {s.account.name}
                  </Link>
                  <span className="text-zinc-500">
                    {s.plan.toLowerCase()} · {s.cycle.toLowerCase()}
                  </span>
                  <span className={s.status === 'ACTIVE' ? 'text-emerald-700' : 'text-zinc-400'}>{s.status.toLowerCase()}</span>
                  <span className="ml-auto text-xs text-zinc-400">since {fmtDateTime(s.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
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
