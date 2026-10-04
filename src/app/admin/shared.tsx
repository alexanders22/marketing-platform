import type { ReactNode } from 'react'

export const card = 'rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5'

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className={card}>
      <p className="text-sm text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-zinc-500">{sub}</p>}
    </div>
  )
}

export function Badge({ tone, children }: { tone: 'green' | 'amber' | 'red' | 'zinc' | 'violet'; children: ReactNode }) {
  const cls = {
    green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    amber: 'bg-amber-50 text-amber-800 ring-amber-200',
    red: 'bg-red-50 text-red-700 ring-red-200',
    zinc: 'bg-zinc-100 text-zinc-700 ring-zinc-200',
    violet: 'bg-violet-50 text-violet-700 ring-violet-200',
  }[tone]
  return <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold ring-1 ${cls}`}>{children}</span>
}

export const fmtDate = (d: Date | null | undefined) =>
  d ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
export const fmtDateTime = (d: Date) =>
  d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export const REASON: Record<string, string> = {
  PURCHASE: 'Payment',
  REFUND: 'Refund',
  GRANT: 'Bonus',
  ADJUSTMENT: 'Adjustment',
  AI_TEXT: 'AI text',
  AI_IMAGE: 'AI image',
  AI_VIDEO: 'AI video',
  AI_BLOG: 'AI blog',
}

export function planStatus(a: { plan: string; trialEndsAt: Date | null; pausedAt: Date | null }) {
  if (a.pausedAt) return { label: 'Paused', tone: 'amber' as const }
  if (a.plan === 'NONE') return { label: 'No plan', tone: 'zinc' as const }
  if (a.trialEndsAt && a.trialEndsAt > new Date()) return { label: `${a.plan[0]}${a.plan.slice(1).toLowerCase()} trial`, tone: 'violet' as const }
  return { label: `${a.plan[0]}${a.plan.slice(1).toLowerCase()}`, tone: 'green' as const }
}

// Outside components: render functions must stay pure.
export const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000)
