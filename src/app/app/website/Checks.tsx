import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react'
import type { Check } from '@/lib/tracking'

const ICON = {
  ok: <CheckCircle2 size={18} className="text-emerald-600" />,
  warn: <AlertTriangle size={18} className="text-amber-500" />,
  bad: <XCircle size={18} className="text-red-600" />,
  info: <Info size={18} className="text-sky-600" />,
}

// A checklist: each finding with what to do about it.
export function Checks({ checks, label }: { checks: Check[]; label: string }) {
  return (
    <ul aria-label={label} className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white">
      {checks.map((c) => (
        <li key={c.key} className="flex gap-3 p-4" data-status={c.status}>
          <span className="mt-0.5 shrink-0">{ICON[c.status]}</span>
          <div className="min-w-0 text-sm">
            <p className="font-semibold">{c.label}</p>
            <p className="text-zinc-600">{c.detail}</p>
            {c.fix && <p className="mt-1 rounded-lg bg-zinc-50 p-2 text-xs text-zinc-700">→ {c.fix}</p>}
          </div>
        </li>
      ))}
    </ul>
  )
}
