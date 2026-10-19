'use client'

import { useEffect, useRef } from 'react'
import { ExternalLink, Lock, X } from 'lucide-react'

// Monrem's payment page in a window over ours (when Monrem allows framing).
// After paying, Monrem sends the frame to /app/credits?payment=…, which takes
// over the whole tab (EscapeFrame) and shows the result.
export function PayFrame({ url, onClose }: { url: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (d && !d.open) d.showModal()
  }, [])
  return (
    <dialog
      ref={ref}
      aria-label="Card payment"
      onCancel={(e) => (e.preventDefault(), onClose())}
      className="m-auto flex h-[min(760px,calc(100dvh-2rem))] w-[min(640px,calc(100vw-1rem))] flex-col overflow-hidden rounded-2xl bg-white p-0 text-zinc-900 shadow-[0_30px_80px_-20px_rgba(16,16,32,0.45)] backdrop:bg-zinc-950/50 backdrop:backdrop-blur-[2px] [&:not([open])]:hidden"
    >
      <div className="flex items-center gap-2 border-b border-zinc-100 px-4 py-2.5 text-sm">
        <Lock size={14} className="text-emerald-600" />
        <span className="font-medium">Secure card payment</span>
        <span className="text-zinc-400">· Monrem</span>
        <a href={url} className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-zinc-500 hover:text-zinc-900">
          Open full page <ExternalLink size={12} />
        </a>
        <button type="button" onClick={onClose} aria-label="Close payment" className="ml-2 rounded-lg p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900">
          <X size={16} />
        </button>
      </div>
      <iframe src={url} title="Monrem payment" allow="payment" className="w-full flex-1 border-0" />
    </dialog>
  )
}

// The return page loaded inside the payment frame: move it to the whole tab.
export function EscapeFrame() {
  useEffect(() => {
    if (window.top && window.top !== window.self) window.top.location.replace(window.location.href)
  }, [])
  return null
}
