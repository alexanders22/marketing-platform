'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import {
  CalendarDays,
  ChevronDown,
  Coins,
  Headphones,
  Inbox,
  LayoutTemplate,
  Link2,
  LogOut,
  Menu,
  Palette,
  Plus,
  Send,
  Target,
  Workflow,
  X,
} from 'lucide-react'
import { FaLinkedinIn } from 'react-icons/fa6'
import { SiFacebook, SiInstagram, SiX } from 'react-icons/si'
import { logout } from '../(auth)/actions'

const NAV = [
  { href: '/app/planner', label: 'Planner', icon: CalendarDays },
  { href: '/app/campaigns', label: 'Campaigns', icon: Target },
  { href: '/app/inbox', label: 'Inbox', icon: Inbox },
  { href: '/app/bio', label: 'Bio Pages', icon: Link2 },
  { href: '/app/studio', label: 'Studio', icon: LayoutTemplate },
  { href: '/app/workflows', label: 'Workflows', icon: Workflow },
]

export type SidebarProps = {
  workspace: string
  logoUrl: string | null
  user: { name: string; email: string }
  credits: number
  planLabel: string
}

export function AppSidebar(props: SidebarProps) {
  const path = usePathname()
  const [open, setOpen] = useState(false)

  const body = <SidebarBody {...props} path={path} />

  return (
    <>
      <div className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-zinc-200 bg-[#f4f3f1]/95 px-4 backdrop-blur lg:hidden">
        <span className="truncate font-semibold">{props.workspace}</span>
        <button onClick={() => setOpen(true)} aria-label="Open menu" className="p-2 text-zinc-700">
          <Menu size={20} />
        </button>
      </div>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button className="absolute inset-0 bg-black/30" aria-label="Close menu" onClick={() => setOpen(false)} />
          {/* Any link inside closes the drawer. */}
          <aside
            className="absolute inset-y-0 left-0 flex w-72 flex-col overflow-y-auto bg-[#f4f3f1] p-3"
            onClick={(e) => (e.target as HTMLElement).closest('a') && setOpen(false)}
          >
            <button onClick={() => setOpen(false)} aria-label="Close menu" className="mb-1 self-end p-2 text-zinc-600">
              <X size={18} />
            </button>
            {body}
          </aside>
        </div>
      )}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col overflow-y-auto p-3 lg:flex">{body}</aside>
    </>
  )
}

function SidebarBody({ workspace, logoUrl, user, credits, planLabel, path }: SidebarProps & { path: string }) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <WorkspaceMenu workspace={workspace} logoUrl={logoUrl} user={user} />

      <Link
        href="/app/create"
        className="mt-3 flex items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-white py-2.5 text-sm font-medium shadow-sm transition hover:bg-zinc-50"
      >
        <Plus size={16} className="text-emerald-600" /> Create new
      </Link>

      <nav className="mt-4 space-y-0.5">
        {NAV.map((n) => {
          const active = path.startsWith(n.href)
          return (
            <Link
              key={n.href}
              href={n.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-[15px] transition ${
                active ? 'bg-zinc-200/70 font-medium text-zinc-900' : 'text-zinc-700 hover:bg-zinc-200/50'
              }`}
            >
              <n.icon size={18} />
              {n.label}
            </Link>
          )
        })}
      </nav>

      <div className="mt-auto space-y-0.5 pt-6">
        <Link
          href="/#contact"
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-[15px] text-zinc-700 hover:bg-zinc-200/50"
        >
          <Headphones size={18} /> Support
        </Link>
        <Link
          href="/app/channels"
          className={`flex items-center gap-3 rounded-lg px-3 py-2 text-[15px] hover:bg-zinc-200/50 ${
            path.startsWith('/app/channels') ? 'bg-zinc-200/70 font-medium' : 'text-zinc-700'
          }`}
        >
          <Send size={18} /> Channels
        </Link>
        <div className="flex gap-2 px-3 py-2">
          {[
            { i: SiFacebook, c: '#1877F2' },
            { i: SiInstagram, c: '#E4405F' },
            { i: SiX, c: '#000' },
            { i: FaLinkedinIn, c: '#0A66C2' },
          ].map(({ i: I, c }, k) => (
            <Link
              key={k}
              href="/app/channels"
              className="grid h-9 w-9 place-items-center rounded-lg border border-zinc-200 bg-white"
            >
              <I size={16} color={c} />
            </Link>
          ))}
          <Link
            href="/app/channels"
            className="grid h-9 w-9 place-items-center rounded-lg border border-zinc-200 bg-white text-zinc-500"
            aria-label="Connect a channel"
          >
            <Plus size={16} />
          </Link>
        </div>

        <Link
          href="/app/credits"
          className="mt-2 block rounded-xl border border-zinc-200 bg-white px-3 py-2.5 shadow-sm"
        >
          <span className="flex items-center justify-between text-sm">
            <span className="inline-flex items-center gap-2 font-medium">
              <span className={`h-2 w-2 rounded-full ${credits > 0 ? 'bg-emerald-500' : 'bg-zinc-300'}`} />
              Credits left
            </span>
            <span className="font-semibold">{credits.toLocaleString()}</span>
          </span>
          <span className="mt-0.5 block text-xs text-zinc-500">{planLabel}</span>
        </Link>
      </div>
    </div>
  )
}

function WorkspaceMenu({ workspace, logoUrl, user }: Pick<SidebarProps, 'workspace' | 'logoUrl' | 'user'>) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-zinc-200/50"
        aria-expanded={open}
      >
        <span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-lg bg-white ring-1 ring-zinc-200">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="h-full w-full object-contain" />
          ) : (
            <span className="text-sm font-bold text-orange-600">{workspace.slice(0, 1).toUpperCase()}</span>
          )}
        </span>
        <span className="min-w-0 flex-1 truncate font-medium">{workspace}</span>
        <ChevronDown size={16} className="shrink-0 text-zinc-500" />
      </button>
      {open && (
        <div className="absolute top-full right-0 left-0 z-20 mt-1 rounded-xl border border-zinc-200 bg-white p-1.5 shadow-lg">
          <div className="px-2.5 py-2">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="truncate text-xs text-zinc-500">{user.email}</p>
          </div>
          <div className="my-1 h-px bg-zinc-100" />
          <MenuLink href="/app/brand" icon={Palette} onClick={() => setOpen(false)}>
            Brand settings
          </MenuLink>
          <MenuLink href="/app/credits" icon={Coins} onClick={() => setOpen(false)}>
            Plan & credits
          </MenuLink>
          <form action={logout}>
            <button className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-zinc-700 hover:bg-zinc-100">
              <LogOut size={16} /> Log out
            </button>
          </form>
        </div>
      )}
    </div>
  )
}

function MenuLink({
  href,
  icon: Icon,
  onClick,
  children,
}: {
  href: string
  icon: typeof Coins
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-zinc-700 hover:bg-zinc-100"
    >
      <Icon size={16} />
      {children}
    </Link>
  )
}
