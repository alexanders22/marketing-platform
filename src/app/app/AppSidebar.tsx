'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import {
  Bell,
  Bot,
  BookUser,
  CalendarDays,
  Check,
  ChevronsUpDown,
  Clapperboard,
  Coins,
  Compass,
  FilePen,
  Flag,
  FileText,
  Headphones,
  Inbox,
  LayoutDashboard,
  LayoutTemplate,
  ListChecks,
  Loader2,
  Link2,
  LogOut,
  Menu,
  Newspaper,
  Palette,
  Plus,
  Send,
  ShieldCheck,
  Sparkles,
  StickyNote,
  Target,
  Workflow,
  X,
} from 'lucide-react'
import { FaLinkedinIn } from 'react-icons/fa6'
import { SiFacebook, SiInstagram, SiX } from 'react-icons/si'
import { logout } from '../(auth)/actions'
import { switchCompany } from './companies/actions'
import { CreditsBadge } from './CreditsBadge'

const NAV = [
  { href: '/app/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/app/weekly', label: 'This week', icon: ListChecks },
  { href: '/app/strategy', label: 'Strategy', icon: Compass },
  { href: '/app/dossier', label: 'Dossier', icon: BookUser },
  { href: '/app/goals', label: 'Goals', icon: Flag },
  { href: '/app/alerts', label: 'Alerts', icon: Bell },
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
  // Unread alerts.
  alerts: number
  // Open recommendations of the latest weekly review.
  recommendations: number
  // Conversations with unread messages.
  inbox: number
  // Companies the user can switch between.
  companies: { id: string; name: string; logoUrl: string | null; paused: boolean }[]
  currentId: string
  canAddCompany: boolean
  superAdmin: boolean
}

export function AppSidebar(props: SidebarProps) {
  const path = usePathname()
  const [open, setOpen] = useState(false)

  const body = <SidebarBody {...props} path={path} />

  return (
    <>
      <div className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-zinc-200 bg-[#f4f3f1]/95 px-4 backdrop-blur lg:hidden">
        <span className="truncate font-semibold">{props.workspace}</span>
        <span className="ml-auto">
          <CreditsBadge credits={props.credits} planLabel={props.planLabel} compact />
        </span>
        {props.alerts > 0 && (
          <Link href="/app/alerts" className="relative mr-1 p-2 text-zinc-700" aria-label={`${props.alerts} unread alerts`}>
            <Bell size={19} />
            <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-red-500" />
          </Link>
        )}
        <button onClick={() => setOpen(true)} aria-label="Open menu" className={`p-2 text-zinc-700 ${props.alerts > 0 ? '' : 'ml-1'}`}>
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

function SidebarBody({ credits, planLabel, alerts, recommendations, inbox, path, ...rest }: SidebarProps & { path: string }) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <WorkspaceMenu {...rest} />

      <CreateMenu />

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
              {n.href === '/app/weekly' && recommendations > 0 && (
                <span className="ml-auto rounded-full bg-indigo-600 px-1.5 py-px text-[11px] font-semibold text-white" aria-label={`${recommendations} open recommendations`}>
                  {recommendations}
                </span>
              )}
              {n.href === '/app/inbox' && inbox > 0 && (
                <span className="ml-auto rounded-full bg-indigo-600 px-1.5 py-px text-[11px] font-semibold text-white" aria-label={`${inbox} unread conversations`}>
                  {inbox > 99 ? '99+' : inbox}
                </span>
              )}
              {n.href === '/app/alerts' && alerts > 0 && (
                <span className="ml-auto rounded-full bg-red-500 px-1.5 py-px text-[11px] font-semibold text-white" aria-label={`${alerts} unread`}>
                  {alerts > 99 ? '99+' : alerts}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      <div className="mt-auto space-y-0.5 pt-6">
        <a
          href="mailto:info@loudpilot.app?subject=Loudpilot%20support"
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-[15px] text-zinc-700 hover:bg-zinc-200/50"
        >
          <Headphones size={18} /> Support
        </a>
        <Link
          href="/app/mcp"
          className={`flex items-center gap-3 rounded-lg px-3 py-2 text-[15px] hover:bg-zinc-200/50 ${
            path.startsWith('/app/mcp') ? 'bg-zinc-200/70 font-medium' : 'text-zinc-700'
          }`}
        >
          <Bot size={18} /> AI assistants
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
            { i: SiFacebook, c: '#1877F2', n: 'Facebook' },
            { i: SiInstagram, c: '#E4405F', n: 'Instagram' },
            { i: SiX, c: '#000', n: 'X' },
            { i: FaLinkedinIn, c: '#0A66C2', n: 'LinkedIn' },
          ].map(({ i: I, c, n }) => (
            <Link
              key={n}
              href="/app/channels"
              aria-label={`Connect ${n}`}
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

const CREATE = [
  { href: '/app/posts/new', label: 'New post or thread', icon: StickyNote, tint: 'bg-emerald-100 text-emerald-700' },
  { href: '/app/create', label: 'New AI social post', icon: Sparkles, tint: 'bg-sky-100 text-sky-700' },
  { href: '/app/campaigns/new?kind=social', label: 'New AI social campaign', icon: Target, tint: 'bg-violet-100 text-violet-700' },
  { href: '/app/studio?tab=video', label: 'New video', icon: Clapperboard, tint: 'bg-fuchsia-100 text-fuchsia-700', badge: 'bg-fuchsia-100 text-fuchsia-700' },
  { href: '/app/blog/new', label: 'New blog', icon: FileText, tint: 'bg-amber-100 text-amber-700', badge: 'bg-amber-100 text-amber-700' },
  { href: '/app/blog/ai', label: 'New AI blog', icon: FilePen, tint: 'bg-orange-100 text-orange-700', badge: 'bg-orange-100 text-orange-700' },
  { href: '/app/campaigns/new?kind=blog', label: 'New AI blog campaign', icon: Newspaper, tint: 'bg-rose-100 text-rose-700', badge: 'bg-rose-100 text-rose-700' },
]

// The menu is wider than the sidebar, and the sidebar scrolls — so it is
// positioned fixed under the button instead of inside the scroll box.
function CreateMenu() {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const open = pos !== null
  const ref = useRef<HTMLDivElement>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const setOpen = (v: boolean) => {
    const r = btn.current?.getBoundingClientRect()
    setPos(v && r ? { top: r.bottom + 8, left: r.left } : null)
  }
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setPos(null)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setPos(null)
    const away = () => setPos(null)
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    window.addEventListener('resize', away)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', esc)
      window.removeEventListener('resize', away)
    }
  }, [open])

  return (
    <div ref={ref} className="relative mt-3">
      <button
        ref={btn}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-white py-2.5 text-sm font-medium shadow-sm transition hover:bg-zinc-50"
      >
        <Plus size={16} className="text-emerald-600" /> Create new
      </button>
      {open && (
        <div
          style={pos}
          className="fixed z-[60] w-72 max-w-[calc(100vw-1.5rem)] rounded-xl border border-zinc-200 bg-white p-1.5 shadow-xl"
        >
          {CREATE.map((c) => (
            <Link
              key={c.href}
              href={c.href}
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm text-zinc-800 hover:bg-zinc-100"
            >
              <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${c.tint}`}>
                <c.icon size={16} />
              </span>
              <span className="flex-1">{c.label}</span>
              {c.badge && <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide ${c.badge}`}>NEW</span>}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

function CompanyBadge({ name, logoUrl, size = 'h-8 w-8' }: { name: string; logoUrl: string | null; size?: string }) {
  return (
    <span className={`grid ${size} shrink-0 place-items-center overflow-hidden rounded-lg bg-white ring-1 ring-zinc-200`}>
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt="" className="h-full w-full object-contain" />
      ) : (
        <span className="text-sm font-bold text-orange-600">{name.slice(0, 1).toUpperCase()}</span>
      )}
    </span>
  )
}

function WorkspaceMenu({
  workspace,
  logoUrl,
  user,
  companies,
  currentId,
  canAddCompany,
  superAdmin,
}: Pick<SidebarProps, 'workspace' | 'logoUrl' | 'user' | 'companies' | 'currentId' | 'canAddCompany' | 'superAdmin'>) {
  const [open, setOpen] = useState(false)
  const [switching, startSwitch] = useTransition()
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
        aria-label={`Company: ${workspace}`}
      >
        <CompanyBadge name={workspace} logoUrl={logoUrl} />
        <span className="min-w-0 flex-1 truncate font-medium">{workspace}</span>
        {switching ? <Loader2 size={16} className="shrink-0 animate-spin text-zinc-500" /> : <ChevronsUpDown size={16} className="shrink-0 text-zinc-500" />}
      </button>
      {open && (
        <div className="absolute top-full right-0 left-0 z-20 mt-1 rounded-xl border border-zinc-200 bg-white p-1.5 shadow-lg">
          <p className="px-2.5 pt-1.5 pb-1 text-[11px] font-semibold tracking-wide text-zinc-500">COMPANIES</p>
          <ul className="max-h-64 overflow-y-auto" aria-label="Companies">
            {companies.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => {
                    setOpen(false)
                    if (c.id !== currentId) startSwitch(() => switchCompany(c.id))
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-zinc-100"
                >
                  <CompanyBadge name={c.name} logoUrl={c.logoUrl} size="h-6 w-6" />
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  {c.paused && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">PAUSED</span>}
                  {c.id === currentId && <Check size={15} className="shrink-0 text-emerald-600" aria-label="Current company" />}
                </button>
              </li>
            ))}
          </ul>
          {canAddCompany && (
            <MenuLink href="/onboarding/company" icon={Plus} onClick={() => setOpen(false)}>
              Add company
            </MenuLink>
          )}
          <div className="my-1 h-px bg-zinc-100" />
          <div className="px-2.5 py-2">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="truncate text-xs text-zinc-500">{user.email}</p>
          </div>
          {superAdmin && (
            <MenuLink href="/admin" icon={ShieldCheck} onClick={() => setOpen(false)}>
              Admin panel
            </MenuLink>
          )}
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
