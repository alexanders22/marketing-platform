'use client'

import { useEffect, useState } from 'react'
import { PartyPopper, X } from 'lucide-react'

// Confetti and a note when a goal comes on track or the level goes up
// since this browser last looked. Quiet for people who prefer less motion.

const COLORS = ['#7b3ff2', '#ff2e6e', '#ff5b14', '#fbbf24', '#1baf7a', '#2a78d6']

export function Celebrate({ workspaceId, goals, level, levelName }: { workspaceId: string; goals: { id: string; name: string; status: string }[]; level: number; levelName: string }) {
  const [note, setNote] = useState<string | null>(null)
  const [burst, setBurst] = useState(false)

  useEffect(() => {
    const key = `lp-momentum:${workspaceId}`
    let before: { level?: number; goals?: Record<string, string> } | null = null
    try {
      before = JSON.parse(localStorage.getItem(key) ?? 'null')
    } catch {}
    const now = { level, goals: Object.fromEntries(goals.map((g) => [g.id, g.status])) }
    try {
      localStorage.setItem(key, JSON.stringify(now))
    } catch {}
    if (!before) return
    const won = goals.filter((g) => g.status === 'ON_TRACK' && before!.goals?.[g.id] && before!.goals[g.id] !== 'ON_TRACK')
    const up = before.level !== undefined && level > before.level
    if (!won.length && !up) return
    const t = setTimeout(() => {
      setNote(up ? `Level up! You're now level ${level} — ${levelName}.` : won.length === 1 ? `Goal on track: ${won[0].name}` : `${won.length} goals came on track`)
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) setBurst(true)
    }, 0)
    const off = setTimeout(() => setBurst(false), 2600)
    return () => {
      clearTimeout(t)
      clearTimeout(off)
    }
  }, [workspaceId, goals, level, levelName])

  return (
    <>
      {burst && (
        <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden" aria-hidden>
          {Array.from({ length: 70 }, (_, i) => (
            <span
              key={i}
              className="confetti absolute top-[-12px] block h-2.5 w-1.5 rounded-[2px]"
              style={{ left: `${(i * 37) % 100}%`, background: COLORS[i % COLORS.length], animationDelay: `${(i % 10) * 60}ms`, animationDuration: `${1600 + (i % 7) * 140}ms`, ['--drift' as string]: `${((i % 9) - 4) * 18}px` }}
            />
          ))}
        </div>
      )}
      {note && (
        <div role="status" className="fixed right-4 bottom-4 z-50 flex max-w-sm items-center gap-3 rounded-2xl bg-zinc-900 px-4 py-3 text-sm text-white shadow-2xl">
          <PartyPopper size={20} className="shrink-0 text-amber-300" />
          <span className="flex-1">{note}</span>
          <button onClick={() => setNote(null)} aria-label="Close" className="text-zinc-400 hover:text-white">
            <X size={16} />
          </button>
        </div>
      )}
    </>
  )
}
