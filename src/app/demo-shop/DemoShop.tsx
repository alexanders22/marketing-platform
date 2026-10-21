'use client'

import { useState } from 'react'
import { MessageCircle, Phone, ShoppingCart, UserRound } from 'lucide-react'

type Lp = (...args: unknown[]) => unknown
const lp: Lp = (...args) => {
  const w = window as unknown as { loudpilot?: Lp & { q?: unknown[] } }
  if (!w.loudpilot) {
    const stub = ((...a: unknown[]) => stub.q!.push(a)) as Lp & { q?: unknown[] }
    stub.q = []
    w.loudpilot = stub
  }
  return w.loudpilot(...args)
}

const PRODUCTS = [
  { id: 'rose-box', name: 'Rose box', price: 120, color: 'from-rose-200 to-rose-400' },
  { id: 'tulips', name: 'Spring tulips', price: 65, color: 'from-amber-100 to-orange-300' },
  { id: 'peony', name: 'Peony bouquet', price: 90, color: 'from-pink-100 to-fuchsia-300' },
]

export function DemoShop({ company, chat, customer }: { company: string; chat: 'on' | 'preview' | 'none'; customer: { user_id: string; user_hash: string } }) {
  const [cart, setCart] = useState<typeof PRODUCTS>([])
  const [log, setLog] = useState<string[]>([])
  const [signedIn, setSignedIn] = useState(false)
  const note = (s: string) => setLog((l) => [s, ...l].slice(0, 8))
  const total = cart.reduce((s, p) => s + p.price, 0)

  return (
    <div className="min-h-screen bg-stone-50 text-zinc-900">
      <div className="bg-zinc-900 px-4 py-2 text-center text-xs text-zinc-200">
        Demo shop with your Loudpilot Tag ({company}) · test mode: events show on Website → Loudpilot Tag marked “test”
        {chat === 'preview' && ' · the chat works here before you switch it on'}
        {chat === 'none' && ' · set up the assistant in Inbox → Assistant to see the chat here'}
      </div>
      <header className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-5">
        <span className="text-xl font-bold tracking-tight">Bloom &amp; Co.</span>
        <nav className="ml-auto flex items-center gap-4 text-sm">
          <a href="#catalog" onClick={() => setTimeout(() => lp('page'), 0)}>
            Catalog
          </a>
          <a href="tel:+995599000000" className="inline-flex items-center gap-1">
            <Phone size={14} /> Call
          </a>
          <a href="https://wa.me/995599000000" target="_blank" rel="noreferrer" onClick={(e) => e.preventDefault()} className="inline-flex items-center gap-1">
            <MessageCircle size={14} /> WhatsApp
          </a>
          <button
            onClick={() => {
              lp('identify', customer)
              setSignedIn(true)
              note('Signed in as the demo customer (verified identity)')
            }}
            className="inline-flex items-center gap-1 rounded-full border border-zinc-300 px-3 py-1"
          >
            <UserRound size={14} /> {signedIn ? 'Demo customer' : 'Sign in'}
          </button>
        </nav>
      </header>

      <main className="mx-auto grid max-w-5xl gap-8 px-4 pb-16 lg:grid-cols-[1fr_300px]">
        <section id="catalog">
          <h1 className="mb-4 text-3xl font-semibold">Fresh flowers, delivered today</h1>
          <div className="grid gap-4 sm:grid-cols-3">
            {PRODUCTS.map((p) => (
              <article key={p.id} className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200">
                <div className={`h-36 bg-gradient-to-br ${p.color}`} />
                <div className="p-4">
                  <h2 className="font-semibold">{p.name}</h2>
                  <p className="text-sm text-zinc-500">{p.price} GEL</p>
                  <button
                    onClick={() => {
                      lp('track', 'AddToCart', { value: p.price, currency: 'GEL', content_ids: [p.id] })
                      setCart((c) => [...c, p])
                      note(`AddToCart · ${p.name}`)
                    }}
                    className="mt-3 w-full rounded-lg bg-zinc-900 py-2 text-sm font-semibold text-white"
                  >
                    Add to cart
                  </button>
                </div>
              </article>
            ))}
          </div>

          <form
            className="mt-10 max-w-md space-y-3 rounded-2xl bg-white p-5 ring-1 ring-zinc-200"
            onSubmit={(e) => {
              e.preventDefault()
              note('Lead · contact form (tracked automatically)')
              ;(e.target as HTMLFormElement).reset()
            }}
          >
            <h2 className="font-semibold">Order a custom bouquet</h2>
            <input name="name" placeholder="Your name" className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm" />
            <input name="phone" type="tel" placeholder="Phone" className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm" />
            <input name="email" type="email" placeholder="E-mail" className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm" />
            <input type="hidden" name="lp_visitor_id" />
            <button className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white">Send request</button>
          </form>
        </section>

        <aside className="space-y-4">
          <div className="rounded-2xl bg-white p-5 ring-1 ring-zinc-200">
            <h2 className="flex items-center gap-2 font-semibold">
              <ShoppingCart size={16} /> Cart
            </h2>
            {cart.length === 0 ? (
              <p className="mt-2 text-sm text-zinc-500">Empty</p>
            ) : (
              <>
                <ul className="mt-2 space-y-1 text-sm">
                  {cart.map((p, i) => (
                    <li key={i} className="flex justify-between">
                      {p.name} <span>{p.price} GEL</span>
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => {
                    const order = `DEMO-${Math.floor(Math.random() * 9000 + 1000)}`
                    lp('track', 'Purchase', { value: total, currency: 'GEL', order_id: order })
                    setCart([])
                    note(`Purchase · ${total} GEL · order ${order}`)
                  }}
                  className="mt-3 w-full rounded-lg bg-emerald-600 py-2 text-sm font-semibold text-white"
                >
                  Pay {total} GEL
                </button>
              </>
            )}
          </div>
          <div className="rounded-2xl bg-white p-5 text-sm ring-1 ring-zinc-200">
            <h2 className="font-semibold">What the tag sent</h2>
            <p className="mt-1 text-xs text-zinc-500">Page views, the call link and forms are tracked by themselves.</p>
            <ul className="mt-2 space-y-1 text-zinc-600" aria-label="Sent events">
              {log.map((l, i) => (
                <li key={i}>✓ {l}</li>
              ))}
            </ul>
          </div>
        </aside>
      </main>
    </div>
  )
}
