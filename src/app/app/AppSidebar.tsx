'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import {
  Bell,
  Check,
  Compass,
  ChevronsUpDown,
  Clapperboard,
  Coins,
  FilePen,
  FileText,
  Headphones,
  Languages,
  Loader2,
  LogOut,
  Menu,
  Newspaper,
  Palette,
  Plus,
  ShieldCheck,
  Sparkles,
  StickyNote,
  Target,
  X,
} from 'lucide-react'
import { logout } from '../(auth)/actions'
import { switchCompany } from './companies/actions'
import { CreditsBadge } from './CreditsBadge'
import { MAIN, SETUP, sectionOf, type Section } from './nav'
import type { PilotState } from '@/lib/business'
import type { AppLang } from '@/lib/app-lang'
import { LanguageSwitch } from '@/components/LanguageSwitch'

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
  // The strategy interview (null for editors, who can't plan).
  pilot: PilotState | null
  // Language of the plain-words parts (Dashboard, explanations).
  lang: AppLang
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
      {/* Above the page: the Create menu opens over it (sticky makes its own layer). */}
      <aside className="sticky top-0 z-30 hidden h-screen w-64 shrink-0 flex-col overflow-y-auto p-3 lg:flex">{body}</aside>
    </>
  )
}

function SidebarBody({ alerts, recommendations, inbox, path, pilot, ...rest }: SidebarProps & { path: string }) {
  const current = sectionOf(path)
  const badge = (s: Section) => {
    if (s.badge === 'inbox' && inbox > 0) return <Count n={inbox} label="unread conversations" tone="bg-indigo-600" />
    if (s.badge === 'insights' && alerts > 0) return <Count n={alerts} label="unread alerts" tone="bg-red-500" />
    if (s.badge === 'insights' && recommendations > 0) return <Count n={recommendations} label="open recommendations" tone="bg-indigo-600" />
    return null
  }
  const item = (s: Section) => (
    <Link
      key={s.href}
      href={s.href}
      aria-current={current === s ? 'page' : undefined}
      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-[15px] transition ${
        current === s ? 'bg-zinc-200/70 font-medium text-zinc-900' : 'text-zinc-700 hover:bg-zinc-200/50'
      }`}
    >
      <s.icon size={18} />
      {s.label}
      {badge(s)}
    </Link>
  )
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <WorkspaceMenu {...rest} />

      <CreateMenu />

      {pilot && <PilotCard pilot={pilot} active={path.startsWith('/app/strategy/interview')} />}

      <nav aria-label="Main" className="mt-4 space-y-0.5">
        {MAIN.map(item)}
      </nav>

      <nav aria-label="Setup" className="mt-auto space-y-0.5 pt-6">
        {SETUP.map(item)}
        <a
          href="mailto:info@loudpilot.app?subject=Loudpilot%20support"
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-[15px] text-zinc-700 hover:bg-zinc-200/50"
        >
          <Headphones size={18} /> Help
        </a>
      </nav>
    </div>
  )
}

// The strategy interview, set apart from the menu: a card with the brand
// gradient running round it until the interview is done.
function PilotCard({ pilot, active }: { pilot: PilotState; active: boolean }) {
  const text = {
    start: { title: 'Plan with Pilot', sub: '3-min strategy chat' },
    continue: { title: 'Continue the interview', sub: `${Math.round(pilot.progress * 100)}% done — goals and plan next` },
    done: { title: 'Plan with Pilot', sub: 'Update numbers, plan again' },
  }[pilot.state]
  const live = pilot.state !== 'done'
  return (
    <Link
      href={pilot.href}
      aria-current={active ? 'page' : undefined}
      className={`group mt-3 block rounded-xl p-[1.5px] shadow-sm transition hover:shadow-md ${live ? 'pilot-shine bg-[linear-gradient(110deg,#7b3ff2,#ff2e6e,#ff5b14,#ff2e6e,#7b3ff2)] shadow-fuchsia-500/20' : 'bg-gradient-to-r from-[#7b3ff2]/40 via-[#ff2e6e]/40 to-[#ff5b14]/40'}`}
    >
      <span className={`flex items-center gap-2.5 rounded-[10px] px-2.5 py-2 ${active ? 'bg-violet-50' : 'bg-white group-hover:bg-violet-50/60'}`}>
        <span className="relative grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-[#7b3ff2] via-[#ff2e6e] to-[#ff5b14] text-white">
          <Sparkles size={15} />
          {pilot.state === 'start' && <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 animate-pulse rounded-full bg-[#ff5b14] ring-2 ring-white" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-zinc-900">{text.title}</span>
          {pilot.state === 'continue' ? (
            <span className="mt-1 block h-1 overflow-hidden rounded-full bg-zinc-100">
              <span className="block h-full rounded-full bg-gradient-to-r from-[#7b3ff2] to-[#ff5b14]" style={{ width: `${pilot.progress * 100}%` }} />
            </span>
          ) : (
            <span className="block truncate text-xs text-zinc-500">{text.sub}</span>
          )}
        </span>
      </span>
      {pilot.state === 'continue' && <span className="sr-only">{text.sub}</span>}
    </Link>
  )
}

function Count({ n, label, tone }: { n: number; label: string; tone: string }) {
  return (
    <span className={`ml-auto rounded-full px-1.5 py-px text-[11px] font-semibold text-white ${tone}`} aria-label={`${n} ${label}`}>
      {n > 99 ? '99+' : n}
    </span>
  )
}

// What can be made, by kind, each with a line on how it is made.
const CREATE: { group: string; items: { href: string; label: string; sub: string; icon: typeof Plus; tint: string }[] }[] = [
  {
    group: 'Plan',
    items: [{ href: '/app/strategy/interview', label: 'Plan my marketing with AI', sub: 'A 3-minute chat → goals and a plan', icon: Compass, tint: 'bg-gradient-to-br from-[#7b3ff2] via-[#ff2e6e] to-[#ff5b14] text-white' }],
  },
  {
    group: 'Post',
    items: [
      { href: '/app/create', label: 'Post with AI', sub: 'AI writes the text and makes the picture', icon: Sparkles, tint: 'bg-sky-100 text-sky-700' },
      { href: '/app/posts/new', label: 'Write a post', sub: 'Your own text, photos or video', icon: StickyNote, tint: 'bg-emerald-100 text-emerald-700' },
    ],
  },
  {
    group: 'Video & blog',
    items: [
      { href: '/app/studio?tab=video', label: 'Video', sub: 'Reels and Stories, with AI or from your clips', icon: Clapperboard, tint: 'bg-fuchsia-100 text-fuchsia-700' },
      { href: '/app/blog/ai', label: 'Blog article with AI', sub: 'From a topic to a full article', icon: FilePen, tint: 'bg-orange-100 text-orange-700' },
      { href: '/app/blog/new', label: 'Blank blog article', sub: 'Write it yourself', icon: FileText, tint: 'bg-amber-100 text-amber-700' },
    ],
  },
  {
    group: 'Series',
    items: [
      { href: '/app/campaigns/new?kind=social', label: 'Content series', sub: 'Posts over several weeks for one goal', icon: Target, tint: 'bg-violet-100 text-violet-700' },
      { href: '/app/campaigns/new?kind=blog', label: 'Blog series', sub: 'Several articles around one topic', icon: Newspaper, tint: 'bg-rose-100 text-rose-700' },
    ],
  },
]

// The menu is wider than the sidebar, and the sidebar scrolls — so it is
// positioned fixed under the button instead of inside the scroll box.
function CreateMenu() {
  const [pos, setPos] = useState<{ top: number; left: number; maxHeight: number } | null>(null)
  const open = pos !== null
  const ref = useRef<HTMLDivElement>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const setOpen = (v: boolean) => {
    const r = btn.current?.getBoundingClientRect()
    // Never below the window: the menu scrolls inside what is left.
    setPos(v && r ? { top: r.bottom + 8, left: r.left, maxHeight: window.innerHeight - r.bottom - 16 } : null)
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
          className="fixed z-[60] w-80 max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-xl border border-zinc-200 bg-white p-1.5 shadow-xl"
        >
          {CREATE.map((g) => (
            <div key={g.group} role="group" aria-label={g.group}>
              <p className="px-2 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-zinc-400 uppercase">{g.group}</p>
              {g.items.map((c) => (
                <Link
                  key={c.href}
                  href={c.href}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm text-zinc-800 hover:bg-zinc-100"
                >
                  <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${c.tint}`}>
                    <c.icon size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block">{c.label}</span>
                    <span className="block text-xs text-zinc-500">{c.sub}</span>
                  </span>
                </Link>
              ))}
            </div>
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
  lang,
}: Pick<SidebarProps, 'workspace' | 'logoUrl' | 'user' | 'companies' | 'currentId' | 'canAddCompany' | 'superAdmin' | 'lang'>) {
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
          <div className="flex items-center gap-2 px-2.5 py-1.5 text-sm text-zinc-700">
            <Languages size={16} /> <span className="mr-auto">Language</span>
            <LanguageSwitch lang={lang} />
          </div>
          <MenuLink href="/app/brand" icon={Palette} onClick={() => setOpen(false)}>
            Brand kit
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
