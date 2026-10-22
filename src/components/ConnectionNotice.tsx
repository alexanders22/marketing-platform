'use client'

import { useEffect, useState } from 'react'
import { WifiOff, X } from 'lucide-react'
import { RECOVERED_EVENT } from '@/lib/client-errors'

// After a lost request was recovered from (app/error.tsx), say that the last
// click may not have gone through, so nothing is silently dropped.
export function ConnectionNotice() {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const on = () => {
      setShown(true)
      clearTimeout(timer)
      timer = setTimeout(() => setShown(false), 8000)
    }
    window.addEventListener(RECOVERED_EVENT, on)
    return () => (window.removeEventListener(RECOVERED_EVENT, on), clearTimeout(timer))
  }, [])
  if (!shown) return null
  return (
    <div role="status" className="fixed bottom-4 left-1/2 z-50 flex w-[min(460px,calc(100vw-2rem))] -translate-x-1/2 items-start gap-3 rounded-xl bg-zinc-900 px-4 py-3 text-sm text-white shadow-lg">
      <WifiOff size={16} className="mt-0.5 shrink-0 text-amber-300" />
      <span className="flex-1">The connection was lost for a moment — your last action may not have gone through. Please try it again.</span>
      <button onClick={() => setShown(false)} aria-label="Dismiss" className="text-zinc-400 hover:text-white">
        <X size={15} />
      </button>
    </div>
  )
}
