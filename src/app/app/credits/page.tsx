import type { Metadata } from 'next'
import { Coins } from 'lucide-react'
import { requireContext } from '@/lib/context'
import { prisma } from '@/lib/prisma'

export const metadata: Metadata = { title: 'Credits — Khma' }

const REASON: Record<string, string> = {
  PURCHASE: 'Top-up',
  REFUND: 'Refund',
  GRANT: 'Bonus',
  AI_TEXT: 'AI text',
  AI_IMAGE: 'AI image',
  AI_VIDEO: 'AI video',
  ADJUSTMENT: 'Adjustment',
}

export default async function CreditsPage() {
  const { account } = await requireContext()
  const entries = await prisma.creditEntry.findMany({
    where: { accountId: account.id },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Credits</h1>
        <p className="mt-1 text-zinc-400">AI generation spends credits. Your plan refills them every month.</p>
      </div>

      <section className="flex flex-col gap-5 rounded-2xl border border-white/10 bg-zinc-900/60 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <span className="grid h-12 w-12 place-items-center rounded-xl bg-amber-400/15 text-amber-300">
            <Coins size={22} />
          </span>
          <div>
            <p className="text-sm text-zinc-400">Balance</p>
            <p className="text-3xl font-semibold">{account.creditBalance.toLocaleString()}</p>
          </div>
        </div>
        <span className="self-start rounded-lg border border-white/10 px-4 py-2 text-sm text-zinc-400 sm:self-auto">
          Plans & top-ups — coming soon
        </span>
      </section>

      <section className="rounded-2xl border border-white/10 bg-zinc-900/60">
        <h2 className="border-b border-white/5 px-6 py-4 font-semibold">History</h2>
        {entries.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-zinc-500">No credit activity yet.</p>
        ) : (
          <ul className="divide-y divide-white/5">
            {entries.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-4 px-6 py-3 text-sm">
                <div>
                  <p>{REASON[e.reason] ?? e.reason}</p>
                  {e.note && <p className="text-xs text-zinc-500">{e.note}</p>}
                </div>
                <div className="text-right">
                  <p className={e.amount >= 0 ? 'text-emerald-400' : 'text-zinc-200'}>
                    {e.amount >= 0 ? '+' : ''}
                    {e.amount.toLocaleString()}
                  </p>
                  <p className="text-xs text-zinc-500">{e.createdAt.toLocaleDateString('en-GB')}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
