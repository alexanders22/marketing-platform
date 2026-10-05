import Link from 'next/link'
import { Coins, Plus } from 'lucide-react'

// The balance, always in sight: amber when running low, red at zero.
export function CreditsBadge({ credits, planLabel, compact = false }: { credits: number; planLabel: string; compact?: boolean }) {
  const tone = credits <= 0 ? 'bg-red-50 text-red-700 ring-red-200' : credits < 20 ? 'bg-amber-50 text-amber-800 ring-amber-200' : 'bg-white text-zinc-900 ring-zinc-200'
  return (
    <div className="flex items-center gap-1.5">
      <Link
        href="/app/credits"
        aria-label={`${credits.toLocaleString()} credits left — ${planLabel}`}
        className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm shadow-sm ring-1 transition hover:shadow ${tone}`}
      >
        <Coins size={15} className={credits <= 0 ? 'text-red-600' : 'text-amber-500'} />
        <b className="font-semibold tabular-nums">{credits.toLocaleString()}</b>
        <span className={compact ? 'sr-only' : 'text-zinc-500'}>credits</span>
        {!compact && <span className="hidden border-l border-zinc-200 pl-2 text-xs text-zinc-500 xl:inline">{planLabel}</span>}
      </Link>
      {!compact && (
        <Link href="/app/plan" className="inline-flex items-center gap-1 rounded-full bg-zinc-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-zinc-800">
          <Plus size={14} /> Get credits
        </Link>
      )}
    </div>
  )
}
