'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { sectionOf, tabActive } from './nav'

// Tabs of the current section (Studio, Insights, Brand…), shown on the tab
// pages themselves — editors below them keep the whole screen.
export function SectionTabs({ counts }: { counts: { alerts: number; recommendations: number } }) {
  const path = usePathname()
  const sp = useSearchParams()
  const section = sectionOf(path)
  const tabParam = sp.get('tab')
  if (!section?.tabs || sp.has('post') || !section.tabs.some((t) => path === t.href.split('?')[0])) return null
  return (
    <nav aria-label={section.label} className="-mt-1 mb-6 flex max-w-full overflow-x-auto">
      <div className="flex shrink-0 rounded-lg bg-zinc-100 p-1 text-sm">
        {section.tabs.map((t) => {
          const on = tabActive(t, path, tabParam)
          const n = t.badge ? counts[t.badge] : 0
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={on ? 'page' : undefined}
              className={`inline-flex items-center gap-1.5 rounded-md px-4 py-1.5 font-medium whitespace-nowrap ${
                on ? 'bg-white shadow-sm' : 'text-zinc-500 hover:text-zinc-900'
              }`}
            >
              {t.label}
              {n > 0 && (
                <span
                  className={`rounded-full px-1.5 text-[11px] font-semibold text-white ${t.badge === 'alerts' ? 'bg-red-500' : 'bg-indigo-600'}`}
                  aria-label={`${n} ${t.badge === 'alerts' ? 'unread' : 'open'}`}
                >
                  {n > 99 ? '99+' : n}
                </span>
              )}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
