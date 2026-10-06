import { CalendarCheck, Flag, Flame, Lock, Plug, Sparkles, Target, Trophy, Zap } from 'lucide-react'
import { POINTS, type Momentum } from '@/lib/momentum'

const ICON = { flag: Flag, trophy: Trophy, flame: Flame, zap: Zap, target: Target, calendar: CalendarCheck, sparkles: Sparkles, plug: Plug }
const short = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })

// Level, points to the next level, the streak and the last two weeks.
export function MomentumHero({ m, onTrack, active }: { m: Momentum; onTrack: number; active: number }) {
  const span = m.nextMin === null ? 1 : m.nextMin - m.levelMin
  const into = m.nextMin === null ? 1 : (m.xp - m.levelMin) / span
  return (
    <section
      aria-label="Momentum"
      className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#5b21d6] via-[#a21caf] to-[#f05a28] p-5 text-white shadow-[0_20px_50px_-24px_rgba(91,33,182,0.7)] sm:p-6"
    >
      <div className="pointer-events-none absolute -top-24 -right-16 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-28 left-1/3 h-56 w-56 rounded-full bg-amber-300/20 blur-3xl" />
      <div className="relative grid gap-6 lg:grid-cols-[1.3fr_1fr_1.2fr]">
        {/* Level */}
        <div className="flex items-center gap-4">
          <div className="relative grid h-20 w-20 shrink-0 place-items-center">
            <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full drop-shadow-[0_6px_14px_rgba(0,0,0,0.25)]" aria-hidden>
              <defs>
                <linearGradient id="lvl" x1="0" x2="1" y1="0" y2="1">
                  <stop offset="0" stopColor="#fde68a" />
                  <stop offset="1" stopColor="#f59e0b" />
                </linearGradient>
              </defs>
              <path d="M50 4 L90 27 L90 73 L50 96 L10 73 L10 27 Z" fill="url(#lvl)" stroke="rgba(255,255,255,0.7)" strokeWidth="3" />
            </svg>
            <span className="relative text-3xl font-black text-amber-950" aria-label={`Level ${m.level}`}>
              {m.level}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold tracking-wider text-white/70 uppercase">Momentum level</p>
            <p className="text-2xl font-bold tracking-tight">{m.levelName}</p>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/20" role="progressbar" aria-label="Points to the next level" aria-valuenow={Math.round(into * 100)} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-gradient-to-r from-amber-200 to-white transition-[width] duration-700" style={{ width: `${Math.max(4, into * 100)}%` }} />
            </div>
            <p className="mt-1 text-xs text-white/80 tabular-nums">
              <b className="text-white">{m.xp.toLocaleString('en-US')} XP</b>
              {m.nextMin !== null ? ` · ${(m.nextMin - m.xp).toLocaleString('en-US')} to ${m.nextName}` : ' · top level'}
            </p>
          </div>
        </div>

        {/* Streak */}
        <div className="flex items-center gap-4 rounded-2xl bg-white/10 p-4 ring-1 ring-white/15 backdrop-blur-sm">
          <span className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl ${m.streak > 0 ? 'bg-gradient-to-b from-amber-300 to-orange-500' : 'bg-white/15'}`}>
            <Flame size={28} className={m.streak > 0 ? 'text-white drop-shadow' : 'text-white/60'} />
          </span>
          <div>
            <p className="text-3xl font-bold tabular-nums" aria-label="Streak">
              {m.streak}
              <span className="ml-1 text-base font-semibold text-white/80">{m.streak === 1 ? 'day' : 'days'}</span>
            </p>
            <p className="text-xs text-white/80">every goal on track · best {m.bestStreak}</p>
            <p className="mt-1 text-xs font-semibold">
              {onTrack} of {active} goals on track now
            </p>
          </div>
        </div>

        {/* Last 14 days */}
        <div>
          <p className="text-xs font-semibold tracking-wider text-white/70 uppercase">Last 14 days</p>
          <div className="mt-2 flex h-16 items-end gap-1" role="img" aria-label="Share of goals on track per day, last 14 days">
            {m.days.map((d) => {
              const share = d.total ? d.onTrack / d.total : 0
              return (
                <div key={d.date} className="group relative flex h-full flex-1 items-end">
                  <div
                    className={`w-full rounded-t-[4px] ${d.total === 0 ? 'bg-white/15' : share === 1 ? 'bg-white' : 'bg-white/55'}`}
                    style={{ height: d.total === 0 ? 4 : `${Math.max(12, share * 100)}%` }}
                  />
                  <span className="pointer-events-none absolute -top-7 left-1/2 z-10 hidden -translate-x-1/2 rounded-md bg-zinc-900 px-1.5 py-0.5 text-[11px] whitespace-nowrap group-hover:block">
                    {short(d.date)} · {d.total ? `${d.onTrack}/${d.total} on track` : 'no checks'}
                  </span>
                </div>
              )
            })}
          </div>
          <details className="mt-2 text-xs text-white/80">
            <summary className="cursor-pointer select-none hover:text-white">How to earn XP</summary>
            <ul className="mt-1 space-y-0.5">
              <li>+{POINTS.goalDay} each day a goal is on track ({m.breakdown.goalDays})</li>
              <li>+{POINTS.post} each published post ({m.breakdown.posts})</li>
              <li>+{POINTS.rec} each weekly recommendation applied ({m.breakdown.recs})</li>
              <li>+{POINTS.goal} each goal set ({m.breakdown.goals})</li>
              <li>+{POINTS.plan} each strategy plan launched ({m.breakdown.plans})</li>
            </ul>
          </details>
        </div>
      </div>
    </section>
  )
}

export function Badges({ badges }: { badges: Momentum['badges'] }) {
  const earned = badges.filter((b) => b.earned).length
  return (
    <section aria-label="Badges">
      <div className="mb-3 flex items-baseline gap-2">
        <h2 className="font-semibold">Badges</h2>
        <span className="text-sm text-zinc-400 tabular-nums">
          {earned} of {badges.length}
        </span>
      </div>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
        {badges.map((b) => {
          const Icon = ICON[b.icon]
          return (
            <li key={b.id} className={`flex flex-col items-center rounded-2xl border p-3 text-center ${b.earned ? 'border-violet-200 bg-gradient-to-b from-violet-50 to-white' : 'border-zinc-200 bg-zinc-50/60'}`} title={b.hint}>
              <span
                className={`relative grid h-12 w-12 place-items-center rounded-full ${b.earned ? 'bg-gradient-to-br from-violet-500 via-fuchsia-500 to-orange-400 text-white shadow-[0_6px_16px_-6px_rgba(168,85,247,0.8)]' : 'bg-zinc-200 text-zinc-400'}`}
              >
                <Icon size={22} />
                {!b.earned && (
                  <span className="absolute -right-0.5 -bottom-0.5 grid h-5 w-5 place-items-center rounded-full bg-white ring-1 ring-zinc-200">
                    <Lock size={10} className="text-zinc-500" />
                  </span>
                )}
              </span>
              <p className={`mt-2 text-xs font-semibold ${b.earned ? 'text-zinc-900' : 'text-zinc-500'}`}>{b.name}</p>
              <p className="mt-0.5 text-[11px] leading-tight text-zinc-500">{b.hint}</p>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
