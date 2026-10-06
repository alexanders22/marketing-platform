'use client'

import { useMemo, useState, useTransition } from 'react'
import { ACTIONS, ACTION_KEYS, type Action, type Pricing } from '@/lib/pricing'
import { netOf, VAT } from '@/lib/tax'
import { savePricing } from '../actions'

type Plan = { id: string; name: string; monthly: number; credits: number }
type Used = Record<string, { credits: number; units: number; count: number }>

const usd = (n: number) => (Math.abs(n) >= 100 ? `$${n.toFixed(0)}` : Math.abs(n) >= 1 ? `$${n.toFixed(2)}` : `$${n.toFixed(3)}`)
const pct = (n: number) => `${(n * 100).toFixed(0)}%`
const marginTone = (m: number) => (m < 0 ? 'text-red-600 font-semibold' : m < 0.5 ? 'text-amber-700' : 'text-emerald-700')
const input = 'w-24 rounded-lg border border-zinc-200 px-2 py-1 text-right text-sm tabular-nums outline-none focus:border-zinc-400'

export function PricingEditor({ initial, plans, used }: { initial: Pricing; plans: Plan[]; used: Used }) {
  const [p, setP] = useState<Pricing>(initial)
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>()
  const [pending, start] = useTransition()

  // What one credit is really worth on each plan: the price without VAT
  // (prices include 18%, which goes to the state) ÷ credits.
  const values = useMemo(
    () => [{ id: 'topup', name: 'Top-up', perCredit: netOf(p.creditPriceUsd) }, ...plans.map((pl) => ({ id: pl.id, name: pl.name, perCredit: netOf(pl.monthly) / pl.credits }))],
    [p.creditPriceUsd, plans],
  )
  const set = (k: Action, field: 'credits' | 'costUsd', v: string) =>
    setP((cur) => ({ ...cur, actions: { ...cur.actions, [k]: { ...cur.actions[k], [field]: field === 'credits' ? Math.max(0, Math.round(Number(v) || 0)) : Math.max(0, Number(v) || 0) } } }))

  // Worst case: the Veo allowance spent on the clip quality that hurts most,
  // every other credit on the costliest non-clip action.
  const CLIPS: Action[] = ['clipQuick', 'clipPro', 'clipCinema']
  const perCredit = (k: Action) => p.actions[k].costUsd / Math.max(1, p.actions[k].credits)
  const worst = ACTION_KEYS.filter((k) => !CLIPS.includes(k) && p.actions[k].credits > 0).reduce((a, k) => (perCredit(k) > perCredit(a) ? k : a), 'postText' as Action)
  const costPerCredit = perCredit(worst)
  const worstFor = (pl: Plan) => {
    const limit = p.veoSecondsPerMonth[pl.id as keyof Pricing['veoSecondsPerMonth']] ?? 0
    return CLIPS.map((q) => {
      const a = p.actions[q]
      const secs = a.credits > 0 ? Math.min(limit, Math.floor(pl.credits / a.credits)) : limit
      return { q, cost: secs * a.costUsd + Math.max(0, pl.credits - secs * a.credits) * costPerCredit }
    }).reduce((x, y) => (y.cost > x.cost ? y : x))
  }

  const totals = ACTION_KEYS.reduce(
    (t, k) => {
      const u = used[k]
      if (!u) return t
      return { credits: t.credits + u.credits, cost: t.cost + u.units * p.actions[k].costUsd }
    },
    { credits: 0, cost: 0 },
  )

  return (
    <div className="space-y-5">
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
        <h2 className="font-semibold">Value of a credit</h2>
        <div className="mt-3 flex flex-wrap items-end gap-6">
          <label className="text-sm">
            <span className="block font-medium text-zinc-700">Top-up price per credit</span>
            <span className="mt-1 flex items-center gap-1">
              $
              <input
                type="number"
                step="0.001"
                min="0"
                value={p.creditPriceUsd}
                onChange={(e) => setP({ ...p, creditPriceUsd: Number(e.target.value) || 0 })}
                aria-label="Top-up price per credit"
                className={input}
              />
            </span>
          </label>
          {plans.map((pl) => (
            <div key={pl.id} className="text-sm">
              <p className="font-medium text-zinc-700">{pl.name}</p>
              <p className="mt-1 text-zinc-500">
                ${pl.monthly} − {Math.round(VAT.rate * 100)}% VAT = {usd(netOf(pl.monthly))} ÷ {pl.credits.toLocaleString()} = <b className="text-zinc-900">{usd(netOf(pl.monthly) / pl.credits)}</b>/credit
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
        <table className="w-full min-w-[980px] text-sm">
          <thead className="border-b border-zinc-100 text-left text-xs text-zinc-500">
            <tr>
              <th className="px-4 py-3 font-medium">Action</th>
              <th className="px-4 py-3 text-right font-medium">Credits / unit</th>
              <th className="px-4 py-3 text-right font-medium">Our cost / unit</th>
              {values.map((v) => (
                <th key={v.id} className="px-4 py-3 text-right font-medium">
                  Margin · {v.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {ACTION_KEYS.map((k) => {
              const a = p.actions[k]
              return (
                <tr key={k}>
                  <td className="px-4 py-2.5">
                    <p className="font-medium">{ACTIONS[k].label}</p>
                    <p className="text-xs text-zinc-500">per {ACTIONS[k].unit}</p>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <input type="number" min="0" step="1" value={a.credits} onChange={(e) => set(k, 'credits', e.target.value)} aria-label={`Credits for ${ACTIONS[k].label}`} className={input} />
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <span className="inline-flex items-center gap-1">
                      $
                      <input type="number" min="0" step="0.001" value={a.costUsd} onChange={(e) => set(k, 'costUsd', e.target.value)} aria-label={`Cost of ${ACTIONS[k].label}`} className={input} />
                    </span>
                  </td>
                  {values.map((v) => {
                    const revenue = a.credits * v.perCredit
                    const m = revenue > 0 ? (revenue - a.costUsd) / revenue : a.costUsd > 0 ? -1 : 0
                    return (
                      <td key={v.id} className="px-4 py-2.5 text-right tabular-nums">
                        <span className={marginTone(m)}>{a.credits === 0 ? (a.costUsd > 0 ? 'free · loss' : '—') : pct(m)}</span>
                        <span className="block text-[11px] text-zinc-500">
                          {usd(revenue)} − {usd(a.costUsd)}
                        </span>
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() =>
            start(async () => {
              setMsg(await savePricing(p))
            })
          }
          disabled={pending}
          className="rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
        >
          {pending ? 'Saving…' : 'Save prices'}
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

      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
        <h2 className="font-semibold">AI clips (Veo) per month</h2>
        <p className="mt-1 text-sm text-zinc-500">Seconds of clips each paid plan may generate per calendar month. Trials get none. Our cost if the whole allowance goes to each quality:</p>
        <ul className="mt-3 grid gap-3 sm:grid-cols-3">
          {plans.map((pl) => {
            const secs = p.veoSecondsPerMonth[pl.id as keyof Pricing['veoSecondsPerMonth']] ?? 0
            return (
              <li key={pl.id} className="rounded-xl bg-zinc-50 p-3 text-sm ring-1 ring-zinc-200">
                <label className="flex items-center justify-between gap-2 font-medium">
                  {pl.name}
                  <span className="flex items-center gap-1 font-normal">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={secs}
                      onChange={(e) => setP({ ...p, veoSecondsPerMonth: { ...p.veoSecondsPerMonth, [pl.id]: Math.max(0, Math.round(Number(e.target.value) || 0)) } })}
                      aria-label={`Veo seconds per month on ${pl.name}`}
                      className={input}
                    />
                    s
                  </span>
                </label>
                <p className="mt-2 text-xs text-zinc-600">
                  Quick {usd(secs * p.actions.clipQuick.costUsd)} · Pro {usd(secs * p.actions.clipPro.costUsd)} · Cinema {usd(secs * p.actions.clipCinema.costUsd)}
                  <span className="text-zinc-400"> of {usd(netOf(pl.monthly))} net</span>
                </p>
              </li>
            )
          })}
        </ul>
      </section>

      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
        <h2 className="font-semibold">Worst case per plan</h2>
        <p className="mt-1 text-sm text-zinc-500">
          A customer uses the full Veo allowance on the costliest clip quality and every other credit on <b>{ACTIONS[worst].label}</b> ({usd(costPerCredit)} per credit).
        </p>
        <ul className="mt-3 grid gap-3 sm:grid-cols-3">
          {plans.map((pl) => {
            const w = worstFor(pl)
            const cost = w.cost
            const net = netOf(pl.monthly)
            const m = (net - cost) / net
            return (
              <li key={pl.id} className="rounded-xl bg-zinc-50 p-3 text-sm ring-1 ring-zinc-200">
                <p className="font-medium">{pl.name}</p>
                <p className="mt-1 text-zinc-600">
                  {usd(net)} in (after VAT) · {usd(cost)} out
                </p>
                <p className={`mt-0.5 ${marginTone(m)}`}>margin {pct(m)}</p>
                <p className="mt-0.5 text-xs text-zinc-500">clips on {ACTIONS[w.q].label.replace('AI clip · ', '')}</p>
              </li>
            )
          })}
        </ul>
      </section>

      <section className="overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
        <h2 className="px-5 pt-4 font-semibold">Last 30 days</h2>
        <p className="px-5 text-sm text-zinc-500">What customers used, what it cost us at today&apos;s cost settings, and the credits it took.</p>
        <table className="mt-2 w-full min-w-[640px] text-sm">
          <thead className="border-y border-zinc-100 text-left text-xs text-zinc-500">
            <tr>
              <th className="px-5 py-2.5 font-medium">Action</th>
              <th className="px-5 py-2.5 text-right font-medium">Times</th>
              <th className="px-5 py-2.5 text-right font-medium">Units</th>
              <th className="px-5 py-2.5 text-right font-medium">Credits</th>
              <th className="px-5 py-2.5 text-right font-medium">Our cost</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {ACTION_KEYS.filter((k) => used[k]).map((k) => (
              <tr key={k}>
                <td className="px-5 py-2">{ACTIONS[k].label}</td>
                <td className="px-5 py-2 text-right tabular-nums">{used[k].count}</td>
                <td className="px-5 py-2 text-right tabular-nums">{used[k].units.toLocaleString()}</td>
                <td className="px-5 py-2 text-right tabular-nums">{used[k].credits.toLocaleString()}</td>
                <td className="px-5 py-2 text-right tabular-nums">{usd(used[k].units * p.actions[k].costUsd)}</td>
              </tr>
            ))}
            {totals.credits === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-6 text-center text-zinc-500">
                  No AI usage recorded yet.
                </td>
              </tr>
            )}
          </tbody>
          {totals.credits > 0 && (
            <tfoot className="border-t border-zinc-200 font-medium">
              <tr>
                <td className="px-5 py-2.5" colSpan={3}>
                  Total
                </td>
                <td className="px-5 py-2.5 text-right tabular-nums">{totals.credits.toLocaleString()}</td>
                <td className="px-5 py-2.5 text-right tabular-nums">{usd(totals.cost)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </section>
    </div>
  )
}
