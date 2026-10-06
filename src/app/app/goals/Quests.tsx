'use client'

import { Globe, Megaphone, PenLine, Plus, Sparkles } from 'lucide-react'
import { GOAL_PRESET_EVENT, type GoalPreset } from './GoalForm'

type Quest = { title: string; reward: string; needs: 'ads' | 'posts' | 'website'; preset: GoalPreset }

const QUESTS: Quest[] = [
  { title: 'Publish at least 3 posts a week', reward: 'Builds the Consistent badge', needs: 'posts', preset: { scope: 'POSTS', metric: 'posts', target: 3, windowDays: 7 } },
  { title: 'Reach 1,000 people per post on average', reward: 'Watches post quality', needs: 'posts', preset: { scope: 'POSTS', metric: 'avg_reach', target: 1000, windowDays: 30 } },
  { title: 'Keep engagement at 3% or more', reward: 'Shows content that clicks', needs: 'posts', preset: { scope: 'POSTS', metric: 'engagement_rate', target: 3, windowDays: 30 } },
  { title: 'Keep the cost per result at ₾5 or less', reward: 'Protects the ad budget', needs: 'ads', preset: { scope: 'ADS', metric: 'cost_per_result', target: 5, windowDays: 7 } },
  { title: 'Get 80 results a week from ads', reward: 'Keeps leads flowing', needs: 'ads', preset: { scope: 'ADS', metric: 'results', target: 80, windowDays: 7 } },
  { title: '50 sign-ups or leads a month from the website', reward: 'Ties marketing to sales', needs: 'website', preset: { scope: 'WEBSITE', metric: 'site_key_events', target: 50, windowDays: 30 } },
]
const ICON = { ads: Megaphone, posts: PenLine, website: Globe }

// Ready-made goals: one click opens the form filled in.
export function Quests({ has, canEdit, taken }: { has: { ads: boolean; posts: boolean; website: boolean }; canEdit: boolean; taken: string[] }) {
  // Not the goals already set.
  const list = QUESTS.filter((q) => has[q.needs] && !taken.includes(q.preset.metric))
  if (!list.length) return null
  return (
    <section aria-label="Quests">
      <div className="mb-3 flex items-baseline gap-2">
        <h2 className="flex items-center gap-1.5 font-semibold">
          <Sparkles size={16} className="text-fuchsia-500" /> Quests
        </h2>
        <span className="text-sm text-zinc-400">start one — +15 XP, then +10 for every day it&apos;s on track</span>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((q) => {
          const Icon = ICON[q.needs]
          return (
            <li key={q.title}>
              <button
                type="button"
                disabled={!canEdit}
                onClick={() => window.dispatchEvent(new CustomEvent(GOAL_PRESET_EVENT, { detail: q.preset }))}
                className="group flex h-full w-full items-center gap-3 rounded-2xl border border-dashed border-violet-200 bg-white p-4 text-left transition hover:-translate-y-0.5 hover:border-violet-400 hover:shadow-[0_10px_24px_-14px_rgba(124,58,237,0.6)] disabled:cursor-default disabled:hover:translate-y-0"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-600 group-hover:bg-gradient-to-br group-hover:from-violet-600 group-hover:to-fuchsia-500 group-hover:text-white">
                  <Icon size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-zinc-900">{q.title}</span>
                  <span className="block text-xs text-zinc-500">{q.reward}</span>
                </span>
                {canEdit && (
                  <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-violet-600 px-2 py-0.5 text-[11px] font-bold text-white">
                    <Plus size={11} /> 15 XP
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
