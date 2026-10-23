import Link from 'next/link'
import { Trophy } from 'lucide-react'
import { Hint } from '@/components/Hint'
import type { Leaderboard as Board } from '@/lib/benchmarks'
import type { DashCopy } from '@/lib/dash-copy'
import { formatNumber } from '@/lib/format'
import { RefreshBoard } from './RefreshBoard'

// "You vs competitors" on Instagram: reactions per post first, then
// followers (and how many joined in a week) and posts in 30 days. Column
// names stay in English; the "?" explains them in the chosen language.
export function Leaderboard({ board, t, whatIs, link = true }: { board: Board; t: DashCopy['board']; whatIs: string; link?: boolean }) {
  const me = board.rows.findIndex((r) => r.you)
  const ranked = board.rows.filter((r) => r.reactions !== null)
  const place = me >= 0 && board.rows[me].reactions !== null ? ranked.findIndex((r) => r.you) + 1 : null
  const empty =
    board.state === 'connect'
      ? { text: t.connect, cta: t.connectCta, href: '/app/channels' }
      : board.state === 'competitors'
        ? { text: t.competitors, cta: t.competitorsCta, href: '/app/competitors' }
        : null
  return (
    <section aria-label={t.title} className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(16,16,32,0.04)]">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="mr-auto flex items-center gap-2 font-semibold">
          <Trophy size={16} className="text-amber-500" /> {t.title} <Hint text={t.tip} label={`${whatIs} ${t.title}`} />
        </h2>
        {board.date && <span className="text-xs text-zinc-400">{t.updated(board.date)}</span>}
        {board.state !== 'connect' && board.state !== 'competitors' && <RefreshBoard label={t.refresh} />}
        {link && (
          <Link href="/app/competitors" className="text-sm font-medium text-violet-700 hover:underline">
            {t.all}
          </Link>
        )}
      </div>
      {empty ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-zinc-300 p-4 text-sm text-zinc-600">
          <p className="min-w-0 flex-1">{empty.text}</p>
          <Link href={empty.href} className="rounded-lg bg-zinc-900 px-3 py-1.5 font-medium text-white hover:bg-zinc-800">
            {empty.cta}
          </Link>
        </div>
      ) : board.state === 'pending' ? (
        <p className="text-sm text-zinc-600">{t.pending}</p>
      ) : (
        <>
          {place && (
            <p className="mb-3 text-sm text-zinc-700" data-testid="board-place">
              {t.place(place, ranked.length)}
            </p>
          )}
          <table className="w-full table-fixed text-sm" aria-label={t.title}>
            <thead className="text-left text-xs text-zinc-500">
              <tr>
                <th className="w-8 py-1.5 font-medium">#</th>
                <th className="w-[38%] py-1.5 font-medium">Account</th>
                <th className="py-1.5 text-right font-medium">
                  <span className="inline-flex items-center gap-1">
                    Followers <Hint text={t.followersTip} label={`${whatIs} Followers`} />
                  </span>
                </th>
                <th className="py-1.5 text-right font-medium">
                  <span className="inline-flex items-center gap-1">
                    Posts · 30 days <Hint text={t.postsTip} label={`${whatIs} Posts`} />
                  </span>
                </th>
                <th className="py-1.5 text-right font-medium">
                  <span className="inline-flex items-center gap-1">
                    Reactions / post <Hint text={t.reactionsTip} label={`${whatIs} Reactions`} />
                  </span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {board.rows.map((r) => (
                <tr key={r.username} className={r.you ? 'bg-violet-50/70 font-medium' : ''}>
                  <td className="py-2 pl-1 text-zinc-500 tabular-nums">{r.reactions === null ? '—' : ranked.indexOf(r) + 1}</td>
                  <td className="max-w-0 py-2 pr-2">
                    <span className="block truncate">
                      {r.name} {r.you && <span className="text-xs font-normal text-violet-700">({t.you})</span>}
                    </span>
                    <span className="block truncate text-xs font-normal text-zinc-500" title={r.error ?? undefined}>
                      @{r.username}
                      {r.error ? ` · ${t.noNumbers}` : ''}
                    </span>
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {r.followers === null ? '—' : formatNumber(r.followers)}
                    {r.growth !== null && r.growth !== 0 && (
                      <span className={`block text-xs font-normal ${r.growth > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {r.growth > 0 ? '+' : ''}
                        {formatNumber(r.growth)}
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-right tabular-nums">{r.posts30 ?? '—'}</td>
                  <td className="py-2 text-right tabular-nums" data-testid={`reactions-${r.username}`}>
                    {r.reactions === null ? '—' : formatNumber(Math.round(r.reactions))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  )
}
