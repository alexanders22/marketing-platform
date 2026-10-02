'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import {
  BarChart3,
  CalendarDays,
  Coins,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Menu,
  Palette,
  PenSquare,
  Share2,
  X,
} from 'lucide-react'
import { Logo } from '@/components/landing/Logo'
import { logout } from '../(auth)/actions'

const NAV = [
  { href: '/app', label: 'Overview', icon: LayoutDashboard },
  { href: '/app/brand', label: 'Brand kit', icon: Palette },
  { href: '/app/content', label: 'Content', icon: PenSquare, soon: true },
  { href: '/app/calendar', label: 'Calendar', icon: CalendarDays, soon: true },
  { href: '/app/channels', label: 'Channels', icon: Share2, soon: true },
  { href: '/app/ads', label: 'Ads', icon: Megaphone, soon: true },
  { href: '/app/analytics', label: 'Analytics', icon: BarChart3, soon: true },
  { href: '/app/credits', label: 'Credits', icon: Coins },
]

export function Sidebar({ workspace, user }: { workspace: string; user: { name: string; email: string } }) {
  const path = usePathname()
  const [open, setOpen] = useState(false)

  const nav = (
    <nav className="flex flex-1 flex-col gap-1">
      {NAV.map((n) => {
        const active = n.href === '/app' ? path === '/app' : path.startsWith(n.href)
        const cls = `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
          active ? 'bg-white/10 text-white' : 'text-zinc-400 hover:bg-white/5 hover:text-white'
        }`
        if (n.soon)
          return (
            <span key={n.href} className={`${cls} cursor-default opacity-60 hover:bg-transparent hover:text-zinc-400`}>
              <n.icon size={17} />
              {n.label}
              <span className="ml-auto rounded-full bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">Soon</span>
            </span>
          )
        return (
          <Link key={n.href} href={n.href} onClick={() => setOpen(false)} className={cls}>
            <n.icon size={17} />
            {n.label}
          </Link>
        )
      })}
    </nav>
  )

  const footer = (
    <div className="border-t border-white/5 pt-4">
      <p className="truncate text-sm font-medium">{user.name}</p>
      <p className="truncate text-xs text-zinc-500">{user.email}</p>
      <form action={logout} className="mt-3">
        <button className="flex items-center gap-2 text-sm text-zinc-400 transition hover:text-white">
          <LogOut size={15} />
          Log out
        </button>
      </form>
    </div>
  )

  return (
    <>
      {/* Mobile top bar */}
      <div className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-white/5 bg-zinc-950/90 px-4 backdrop-blur lg:hidden">
        <Logo />
        <button onClick={() => setOpen(true)} aria-label="Open menu" className="p-2 text-zinc-300">
          <Menu size={20} />
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button className="absolute inset-0 bg-black/60" aria-label="Close menu" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col gap-6 overflow-y-auto bg-zinc-950 p-4">
            <div className="flex items-center justify-between">
              <Logo />
              <button onClick={() => setOpen(false)} aria-label="Close menu" className="p-2 text-zinc-300">
                <X size={20} />
              </button>
            </div>
            <WorkspaceBadge name={workspace} />
            {nav}
            {footer}
          </aside>
        </div>
      )}

      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col gap-6 overflow-y-auto border-r border-white/5 p-4 lg:flex">
        <Link href="/app" className="px-1">
          <Logo />
        </Link>
        <WorkspaceBadge name={workspace} />
        {nav}
        {footer}
      </aside>
    </>
  )
}

function WorkspaceBadge({ name }: { name: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-white/10 bg-zinc-900 px-3 py-2">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-gradient-to-br from-orange-400 to-violet-500 text-xs font-bold">
        {name.slice(0, 1).toUpperCase()}
      </span>
      <span className="truncate text-sm font-medium">{name}</span>
    </div>
  )
}
