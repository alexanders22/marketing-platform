'use client'

import { useState, useTransition } from 'react'
import { compute, type Economics, type Line, type PlanEcon } from '@/lib/economics'
import type { PlanId } from '@/lib/plans'
import type { CreditPack } from '@/lib/pricing'
import { saveEconomics } from '../actions'

const card = 'rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5'
const input = 'w-24 rounded-lg border border-zinc-200 px-2 py-1 text-right text-sm tabular-nums outline-none focus:border-zinc-400'
const pct = (n: number) => `${(n * 100).toFixed(0)}%`
const tone = (n: number) => (n < 0 ? 'text-red-600' : 'text-emerald-700')

export function EconomicsEditor({
  initial,
  plans,
  packs,
  gelPerUsd,
  mixCost,
  trialCredits,
  paying,
}: {
  initial: Economics
  plans: PlanEcon[]
  packs: CreditPack[]
  gelPerUsd: number
  mixCost: number | null
  trialCredits: number
  paying: Record<string, number>
}) {
  const [e, setE] = useState(initial)
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>()
  const [pending, start] = useTransition()
  const r = compute(e, plans, packs, gelPerUsd, mixCost, trialCredits)
  const usd = (n: number) => `${n < 0 ? '−' : ''}$${Math.abs(n) >= 100 ? Math.round(Math.abs(n)).toLocaleString('en-US') : Math.abs(n).toFixed(2)}`
  const gel = (n: number) => `${n < 0 ? '−' : ''}₾${Math.round(Math.abs(n * gelPerUsd)).toLocaleString('en-US')}`
  const num = (v: string) => Math.max(0, Number(v) || 0)
  const set = (patch: Partial<Economics>) => setE((cur) => ({ ...cur, ...patch }))

  const money = (v: number, big?: boolean) => (
    <>
      <span className={big ? 'text-2xl font-semibold' : ''}>{gel(v)}</span> <span className="text-xs text-zinc-500">{usd(v)}</span>
    </>
  )

  const row = (l: Line, extra: React.ReactNode, countCell: React.ReactNode, after?: React.ReactNode) => (
    <tr key={l.key}>
      <td className="px-4 py-2.5 font-medium">{l.name}</td>
      <td className="px-3 py-2.5 text-right tabular-nums">{usd(l.gross)}</td>
      <td className="px-3 py-2.5 text-right tabular-nums">{usd(l.net)}</td>
      <td className="px-3 py-2.5 text-right tabular-nums text-zinc-500">−{usd(l.fee + l.tax + l.partner)}</td>
      <td className="px-3 py-2.5 text-right tabular-nums text-zinc-500">{extra}</td>
      <td className={`px-3 py-2.5 text-right tabular-nums font-medium ${tone(l.contribution)}`}>
        {usd(l.contribution)}
        <span className="block text-[11px] font-normal">{pct(l.margin)}</span>
      </td>
      <td className="px-3 py-2.5 text-right">{countCell}</td>
      {after !== undefined && <td className="px-4 py-2.5 text-right tabular-nums text-sm">{after}</td>}
    </tr>
  )

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className={card}>
          <p className="text-sm text-zinc-500">Revenue / month (incl. VAT)</p>
          <p className="mt-1">
            {money(r.revenue, true)}
          </p>
        </div>
        <div className={card}>
          <p className="text-sm text-zinc-500">Left after VAT, fees, taxes, AI</p>
          <p className="mt-1">
            {money(r.contribution, true)}
          </p>
        </div>
        <div className={card}>
          <p className="text-sm text-zinc-500">Fixed costs / month</p>
          <p className="mt-1">
            {money(r.fixed, true)}
          </p>
          <p className="text-xs text-zinc-500">incl. free trials {usd(r.trials)}</p>
        </div>
        <div className={`${card} ${r.profit < 0 ? 'bg-red-50 ring-red-200' : 'bg-emerald-50 ring-emerald-200'}`}>
          <p className="text-sm text-zinc-600">{r.profit < 0 ? 'Loss / month' : 'Profit / month'}</p>
          <p className={`mt-1 ${tone(r.profit)}`}>
            {money(r.profit, true)}
          </p>
        </div>
      </div>

      <section className={`${card} bg-[linear-gradient(120deg,#faf5ff,#fff1f2_60%,#fff7ed)]`} aria-label="Break-even">
        <h2 className="font-semibold">Break-even</h2>
        {r.breakEvenMix === null ? (
          <p className="mt-1 text-sm text-red-700">At these numbers the plans don’t cover their own costs — raise prices or cut AI usage.</p>
        ) : (
          <p className="mt-1 text-sm text-zinc-700">
            With this mix of plans you need <b className="text-lg">{r.breakEvenMix.toLocaleString()}</b> paying customers a month to cover the fixed costs. Planned:{' '}
            <b>{r.customers.toLocaleString()}</b> · paying now: <b>{Object.values(paying).reduce((s, n) => s + n, 0)}</b>.
          </p>
        )}
        <ul className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-zinc-600">
          {plans.map((p) => (
            <li key={p.id}>
              Only {p.name}: <b>{r.breakEvenPlan[p.id]?.toLocaleString() ?? '—'}</b>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className={card}>
          <h2 className="font-semibold">Fixed costs / month</h2>
          <ul className="mt-3 space-y-2">
            {e.fixed.map((f, i) => (
              <li key={i} className="flex items-center gap-2">
                <input
                  value={f.name}
                  onChange={(ev) => set({ fixed: e.fixed.map((x, j) => (j === i ? { ...x, name: ev.target.value } : x)) })}
                  aria-label={`Cost ${i + 1} name`}
                  className="min-w-0 flex-1 rounded-lg border border-zinc-200 px-2 py-1 text-sm outline-none focus:border-zinc-400"
                />
                <input type="number" min="0" value={f.amount} onChange={(ev) => set({ fixed: e.fixed.map((x, j) => (j === i ? { ...x, amount: num(ev.target.value) } : x)) })} aria-label={`${f.name} amount`} className={input} />
                <select value={f.currency} onChange={(ev) => set({ fixed: e.fixed.map((x, j) => (j === i ? { ...x, currency: ev.target.value as 'GEL' | 'USD' } : x)) })} aria-label={`${f.name} currency`} className="rounded-lg border border-zinc-200 px-1.5 py-1 text-sm">
                  <option value="GEL">₾</option>
                  <option value="USD">$</option>
                </select>
                <button onClick={() => set({ fixed: e.fixed.filter((_, j) => j !== i) })} aria-label={`Remove ${f.name}`} className="px-1 text-zinc-400 hover:text-red-600">
                  ×
                </button>
              </li>
            ))}
          </ul>
          <button onClick={() => set({ fixed: [...e.fixed, { name: 'New cost', amount: 0, currency: 'GEL' }] })} className="mt-2 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm hover:bg-zinc-50">
            Add a cost
          </button>
        </section>

        <section className={card}>
          <h2 className="font-semibold">Assumptions</h2>
          <div className="mt-3 grid gap-2 text-sm">
            {(
              [
                ['paymentFeePct', 'Card payment fee', '%'],
                ['paymentFeeUsd', 'Fixed fee per payment', '$'],
                ['turnoverTaxPct', 'Tax on turnover (after VAT)', '%'],
                ['partnerSharePct', 'Average partner share', '%'],
                ['yearlySharePct', 'Customers paying yearly', '%'],
                ['trialsPerMonth', `Free trials a month (${trialCredits} credits each)`, ''],
              ] as const
            ).map(([k, label, unit]) => (
              <label key={k} className="flex items-center justify-between gap-3">
                {label}
                <span className="flex items-center gap-1">
                  {unit === '$' && '$'}
                  <input type="number" min="0" step="0.1" value={e[k]} onChange={(ev) => set({ [k]: num(ev.target.value) })} aria-label={label} className={input} />
                  {unit === '%' && '%'}
                </span>
              </label>
            ))}
            <label className="flex items-center justify-between gap-3">
              <span>
                AI cost of one credit
                <span className="block text-xs text-zinc-500">{mixCost !== null ? `last 30 days: $${mixCost.toFixed(4)}` : 'no usage yet — set an estimate'}</span>
              </span>
              <span className="flex items-center gap-1">
                $
                <input
                  type="number"
                  min="0"
                  step="0.001"
                  value={e.costPerCreditUsd ?? ''}
                  placeholder={mixCost !== null ? mixCost.toFixed(4) : '0.01'}
                  onChange={(ev) => set({ costPerCreditUsd: ev.target.value === '' ? null : num(ev.target.value) })}
                  aria-label="AI cost of one credit"
                  className={input}
                />
              </span>
            </label>
          </div>
        </section>
      </div>

      <section className={`${card} overflow-x-auto p-0`}>
        <h2 className="px-5 pt-4 font-semibold">Plans — per customer per month</h2>
        <p className="px-5 text-sm text-zinc-500">Yearly payers counted at 10/12 of the price. AI cost = credits × share used × {usd(r.costPerCredit)}.</p>
        <table className="mt-2 w-full min-w-[900px] text-sm">
          <thead className="border-y border-zinc-100 text-left text-xs text-zinc-500">
            <tr>
              <th className="px-4 py-2 font-medium">Plan</th>
              <th className="px-3 py-2 text-right font-medium">Price</th>
              <th className="px-3 py-2 text-right font-medium">Without VAT</th>
              <th className="px-3 py-2 text-right font-medium">Fees, tax, partner</th>
              <th className="px-3 py-2 text-right font-medium">AI · share used</th>
              <th className="px-3 py-2 text-right font-medium">Left · margin</th>
              <th className="px-3 py-2 text-right font-medium">Customers</th>
              <th className="px-4 py-2 text-right font-medium">Need alone</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {r.planLines.map((l) =>
              row(
                l,
                <span className="inline-flex items-center gap-1">
                  −{usd(l.ai)}
                  <input type="number" min="0" max="100" value={e.usagePct[l.key as PlanId]} onChange={(ev) => set({ usagePct: { ...e.usagePct, [l.key]: Math.min(100, num(ev.target.value)) } })} aria-label={`Share of ${l.name} credits used`} className="w-14 rounded-lg border border-zinc-200 px-1.5 py-0.5 text-right text-xs" />%
                </span>,
                <span className="inline-flex flex-col items-end">
                  <input type="number" min="0" value={e.customers[l.key as PlanId]} onChange={(ev) => set({ customers: { ...e.customers, [l.key]: Math.round(num(ev.target.value)) } })} aria-label={`${l.name} customers`} className={input} />
                  <span className="text-[11px] text-zinc-500">{paying[l.key] ?? 0} paying now</span>
                </span>,
                r.breakEvenPlan[l.key as PlanId]?.toLocaleString() ?? '—',
              ),
            )}
          </tbody>
        </table>
      </section>

      <section className={`${card} overflow-x-auto p-0`}>
        <h2 className="px-5 pt-4 font-semibold">Credit packs — per pack sold</h2>
        <p className="px-5 text-sm text-zinc-500">Counted as if every credit is used.</p>
        <table className="mt-2 w-full min-w-[800px] text-sm">
          <thead className="border-y border-zinc-100 text-left text-xs text-zinc-500">
            <tr>
              <th className="px-4 py-2 font-medium">Pack</th>
              <th className="px-3 py-2 text-right font-medium">Price</th>
              <th className="px-3 py-2 text-right font-medium">Without VAT</th>
              <th className="px-3 py-2 text-right font-medium">Fees, tax, partner</th>
              <th className="px-3 py-2 text-right font-medium">AI</th>
              <th className="px-3 py-2 text-right font-medium">Left · margin</th>
              <th className="px-3 py-2 text-right font-medium">Sold / month</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {r.packLines.map((l) =>
              row(
                l,
                `−${usd(l.ai)}`,
                <input type="number" min="0" value={e.packsSold[l.key.slice(5)] ?? 0} onChange={(ev) => set({ packsSold: { ...e.packsSold, [l.key.slice(5)]: Math.round(num(ev.target.value)) } })} aria-label={`${l.name} packs sold`} className={input} />,
              ),
            )}
          </tbody>
        </table>
      </section>

      <div className="flex items-center gap-3">
        <button onClick={() => start(async () => setMsg(await saveEconomics(e)))} disabled={pending} className="rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60">
          {pending ? 'Saving…' : 'Save'}
        </button>
        {msg?.ok && (
          <p role="status" className="text-sm text-emerald-700">
            {msg.ok}
          </p>
        )}
        {msg?.error && (
          <p role="alert" className="text-sm text-red-600">
            {msg.error}
          </p>
        )}
      </div>
    </div>
  )
}
