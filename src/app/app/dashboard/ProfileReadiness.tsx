import Link from 'next/link'
import { ArrowRight, BarChart3, BookOpen, Building2, Check, ChevronDown, Globe, Map as MapIcon, Megaphone, Palette, Rocket, Search, Share2, Sparkles, Swords, Target, Bot, Radar } from 'lucide-react'
import { Ring } from '@/components/viz'
import type { Readiness, StepGroup } from '@/lib/readiness'

const ICON = {
  website: Globe,
  kit: Palette,
  about: Building2,
  dossier: Search,
  brandbook: BookOpen,
  competitors: Swords,
  social: Share2,
  ads: Megaphone,
  ga: BarChart3,
  seo: Radar,
  geo: Bot,
  tracking: Target,
  goal: Rocket,
  plan: MapIcon,
} as const

const GROUP: Record<StepGroup, { bar: string; chip: string }> = {
  Brand: { bar: 'bg-violet-500', chip: 'bg-violet-50 text-violet-600' },
  Channels: { bar: 'bg-pink-500', chip: 'bg-pink-50 text-pink-600' },
  Website: { bar: 'bg-sky-500', chip: 'bg-sky-50 text-sky-600' },
  Growth: { bar: 'bg-orange-500', chip: 'bg-orange-50 text-orange-600' },
}

const stage = (p: number) => (p < 35 ? 'Getting started' : p < 70 ? 'Taking shape' : 'Almost ready')

// "How ready is the profile": a score, the steps left in order of impact and
// the full checklist by group. Hidden once everything is done.
export function ProfileReadiness({ r }: { r: Readiness }) {
  if (r.percent >= 100) return null
  const groups = [...new Set(r.steps.map((s) => s.group))]
  const next = r.steps
    .filter((s) => !s.done)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3)

  return (
    <section aria-labelledby="readiness-heading" className="relative overflow-hidden rounded-3xl border border-zinc-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(16,16,32,0.04)] sm:p-6">
      <span className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#7b3ff2] via-[#ff2e6e] to-[#ff5b14]" />
      <div className="pointer-events-none absolute -top-24 -right-16 h-56 w-56 rounded-full bg-violet-200/40 blur-3xl" />

      <div className="relative grid gap-6 lg:grid-cols-[minmax(0,300px)_1fr]">
        {/* Score */}
        <div className="flex flex-col">
          <div className="flex items-center gap-4">
            <Ring value={r.percent / 100} size={92} stroke={9} label="Profile readiness">
              <span className="text-center leading-none">
                <span className="block text-2xl font-bold tracking-tight text-zinc-900 tabular-nums">{r.percent}%</span>
              </span>
            </Ring>
            <div className="min-w-0">
              <p className="text-xs font-semibold tracking-wider text-zinc-400 uppercase">Profile readiness</p>
              <h2 id="readiness-heading" className="text-lg font-bold tracking-tight text-zinc-900">
                {stage(r.percent)}
              </h2>
              <p className="text-xs text-zinc-500 tabular-nums">
                {r.done} of {r.steps.length} steps done
              </p>
            </div>
          </div>

          {/* One segment per step, grouped */}
          <div className="mt-5 space-y-2" aria-hidden>
            {groups.map((g) => {
              const steps = r.steps.filter((s) => s.group === g)
              return (
                <div key={g} className="grid grid-cols-[64px_1fr_auto] items-center gap-2 text-xs">
                  <span className="text-zinc-500">{g}</span>
                  <span className="flex gap-1">
                    {steps.map((s) => (
                      <span key={s.key} className={`h-2 flex-1 rounded-full ${s.done ? GROUP[g].bar : 'bg-zinc-100'}`} />
                    ))}
                  </span>
                  <span className="w-8 text-right text-zinc-400 tabular-nums">
                    {steps.filter((s) => s.done).length}/{steps.length}
                  </span>
                </div>
              )
            })}
          </div>
          <p className="mt-4 flex items-start gap-2 rounded-xl bg-violet-50 px-3 py-2 text-xs text-violet-900">
            <Sparkles size={14} className="mt-px shrink-0 text-violet-500" />
            <span>The more Loudpilot knows, the better its posts, ads and plans fit your business.</span>
          </p>
        </div>

        {/* Next steps */}
        <div className="min-w-0">
          <p className="mb-2 text-sm font-semibold text-zinc-800">Do next</p>
          <ol className="space-y-2">
            {next.map((s, i) => {
              const Icon = ICON[s.key as keyof typeof ICON] ?? Sparkles
              return (
                <li key={s.key}>
                  <Link href={s.href} className="group flex items-center gap-3 rounded-2xl border border-zinc-200/80 p-3 transition hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-[0_12px_30px_-20px_rgba(124,58,237,0.6)]">
                    <span className={`relative grid h-10 w-10 shrink-0 place-items-center rounded-xl ${GROUP[s.group].chip}`}>
                      <Icon size={18} />
                      <span className="absolute -top-1.5 -left-1.5 grid h-5 w-5 place-items-center rounded-full bg-zinc-900 text-[10px] font-bold text-white">{i + 1}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-zinc-900">{s.label}</span>
                      <span className="block truncate text-xs text-zinc-500">{s.hint}</span>
                    </span>
                    <span className="hidden shrink-0 items-center gap-1 rounded-xl bg-zinc-900 px-3 py-2 text-xs font-semibold text-white transition group-hover:gap-1.5 sm:inline-flex">
                      {s.cta} <ArrowRight size={13} />
                    </span>
                    <ArrowRight size={16} className="shrink-0 text-zinc-400 sm:hidden" />
                  </Link>
                </li>
              )
            })}
          </ol>

          <details className="group/all mt-3">
            <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-sm font-medium text-violet-700 select-none [&::-webkit-details-marker]:hidden">
              All {r.steps.length} steps <ChevronDown size={14} className="transition group-open/all:rotate-180" />
            </summary>
            <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {groups.map((g) => (
                <div key={g}>
                  <p className="mb-1.5 text-xs font-semibold tracking-wider text-zinc-400 uppercase">{g}</p>
                  <ul className="space-y-1">
                    {r.steps
                      .filter((s) => s.group === g)
                      .map((s) => (
                        <li key={s.key}>
                          <Link href={s.href} className={`flex items-center gap-2 rounded-lg px-1.5 py-1 text-sm transition hover:bg-zinc-50 ${s.done ? 'text-zinc-400' : 'text-zinc-800'}`}>
                            <span className={`grid h-4.5 w-4.5 shrink-0 place-items-center rounded-full ${s.done ? 'bg-emerald-500 text-white' : 'ring-1 ring-zinc-300 ring-inset'}`}>{s.done && <Check size={11} strokeWidth={3} />}</span>
                            <span className={`truncate ${s.done ? 'line-through decoration-zinc-300' : ''}`}>{s.label}</span>
                            <span className="sr-only">{s.done ? '(done)' : '(to do)'}</span>
                          </Link>
                        </li>
                      ))}
                  </ul>
                </div>
              ))}
            </div>
          </details>
        </div>
      </div>
    </section>
  )
}
