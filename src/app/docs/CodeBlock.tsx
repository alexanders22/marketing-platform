'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'

// Dark code block with tabs (curl / JavaScript …) and a copy button.
export function CodeBlock({ tabs, title }: { tabs: { label: string; code: string }[]; title?: string }) {
  const [i, setI] = useState(0)
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(tabs[i].code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard blocked: the text is still selectable.
    }
  }
  return (
    <div className="my-4 overflow-hidden rounded-xl bg-zinc-950 ring-1 ring-zinc-800">
      <div className="flex items-center gap-1 border-b border-white/10 px-2 py-1.5">
        {title && <span className="px-2 text-xs text-zinc-500">{title}</span>}
        {tabs.length > 1 &&
          tabs.map((t, k) => (
            <button
              key={t.label}
              onClick={() => setI(k)}
              aria-pressed={i === k}
              className={`rounded-md px-2.5 py-1 text-xs font-medium ${i === k ? 'bg-white/10 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
            >
              {t.label}
            </button>
          ))}
        {tabs.length === 1 && !title && <span className="px-2 text-xs text-zinc-500">{tabs[0].label}</span>}
        <button
          onClick={copy}
          className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-zinc-400 hover:bg-white/10 hover:text-white"
          aria-label="Copy code"
        >
          {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 text-[13px] leading-relaxed text-zinc-200">
        <code>{tabs[i].code}</code>
      </pre>
    </div>
  )
}
