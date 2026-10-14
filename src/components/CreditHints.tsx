'use client'

import { useEffect, useState } from 'react'
import { creditMoney, type CreditValue } from '@/lib/money'

// Hovering any credit amount ("5 credits", "· 6 cr", "300 AI credits") shows
// what it is worth in lari and dollars. One listener for the whole page, so
// every label in the app gets it without wrapping each one.
const AMOUNT = /(\d[\d,]*(?:\.\d+)?)\s*(?:AI\s+)?(?:credits?|cr)\b/i
const OWN_TEXT_MAX = 160

function ownText(el: Element) {
  let t = ''
  for (const n of el.childNodes) if (n.nodeType === Node.TEXT_NODE) t += n.textContent ?? ''
  return t
}

// All the text inside, pieces joined by spaces ("<b>15</b><span>credits</span>"
// reads "15 credits", not "15credits…").
function spacedText(el: Element) {
  const parts: string[] = []
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  for (let n = walk.nextNode(); n && parts.length < 40; n = walk.nextNode()) parts.push(n.textContent ?? '')
  return parts.join(' ')
}

// The amount on the hovered element: its own text first, then (for short
// labels split over several spans, like "28 · credits") its whole text.
function amountAt(target: EventTarget | null): { n: number; el: Element } | null {
  let el = target instanceof Element ? target : null
  for (let depth = 0; el && depth < 4; depth++, el = el.parentElement) {
    if (el.closest('input,textarea,select,[data-no-credit-hint]')) return null
    const own = ownText(el)
    const whole = spacedText(el)
    const m = own.match(AMOUNT) ?? (whole.length <= OWN_TEXT_MAX ? whole.match(AMOUNT) : null)
    if (m) {
      const n = Number(m[1].replace(/,/g, ''))
      return Number.isFinite(n) && n > 0 ? { n, el } : null
    }
  }
  return null
}

export function CreditHints({ value }: { value: CreditValue }) {
  const [tip, setTip] = useState<{ x: number; y: number; below: boolean; text: string } | null>(null)

  useEffect(() => {
    let current: Element | null = null
    const over = (e: MouseEvent) => {
      const hit = amountAt(e.target)
      if (!hit) {
        current = null
        return setTip(null)
      }
      if (hit.el === current) return
      current = hit.el
      const r = hit.el.getBoundingClientRect()
      const m = creditMoney(hit.n, value)
      const below = r.top < 48
      setTip({ x: Math.min(window.innerWidth - 12, Math.max(12, r.left + r.width / 2)), y: below ? r.bottom + 8 : r.top - 8, below, text: `${hit.n.toLocaleString('en-US')} credit${hit.n === 1 ? '' : 's'} ≈ ${m.gel} · ${m.usd}` })
    }
    const away = () => {
      current = null
      setTip(null)
    }
    document.addEventListener('mouseover', over)
    window.addEventListener('scroll', away, true)
    return () => {
      document.removeEventListener('mouseover', over)
      window.removeEventListener('scroll', away, true)
    }
  }, [value])

  if (!tip) return null
  return (
    <div
      role="tooltip"
      className="pointer-events-none fixed z-[100] -translate-x-1/2 rounded-lg bg-zinc-900 px-2.5 py-1.5 text-xs font-medium whitespace-nowrap text-white shadow-lg ring-1 ring-white/10"
      style={{ left: tip.x, top: tip.y, transform: `translate(-50%, ${tip.below ? '0' : '-100%'})` }}
    >
      {tip.text}
    </div>
  )
}
