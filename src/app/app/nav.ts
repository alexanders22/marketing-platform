import {
  BookUser,
  Bot,
  CalendarDays,
  Inbox,
  LayoutDashboard,
  LayoutTemplate,
  LineChart,
  Send,
  Target,
} from 'lucide-react'

// The app menu: a few sections in the sidebar, related pages as tabs inside
// a section (rendered by SectionTabs above the page).
export type Tab = { label: string; href: string; badge?: 'alerts' | 'recommendations' }
export type Section = {
  label: string
  href: string
  icon: typeof Inbox
  // Other paths that belong to the section (editors, sub-pages).
  also?: string[]
  tabs?: Tab[]
  badge?: 'inbox' | 'insights'
}

export const MAIN: Section[] = [
  { label: 'Dashboard', href: '/app/dashboard', icon: LayoutDashboard },
  { label: 'Planner', href: '/app/planner', icon: CalendarDays, also: ['/app/posts', '/app/blog', '/app/create'] },
  { label: 'Campaigns', href: '/app/campaigns', icon: Target },
  {
    label: 'Studio',
    href: '/app/studio',
    icon: LayoutTemplate,
    tabs: [
      { label: 'Images', href: '/app/studio' },
      { label: 'Video', href: '/app/studio?tab=video' },
      { label: 'Bio pages', href: '/app/bio' },
    ],
  },
  { label: 'Inbox', href: '/app/inbox', icon: Inbox, badge: 'inbox' },
  {
    label: 'Insights',
    href: '/app/weekly',
    icon: LineChart,
    badge: 'insights',
    tabs: [
      { label: 'This week', href: '/app/weekly', badge: 'recommendations' },
      { label: 'Goals', href: '/app/goals' },
      { label: 'Alerts', href: '/app/alerts', badge: 'alerts' },
    ],
  },
  {
    label: 'Brand',
    href: '/app/dossier',
    icon: BookUser,
    tabs: [
      { label: 'Dossier', href: '/app/dossier' },
      { label: 'Strategy', href: '/app/strategy' },
      { label: 'Brand kit', href: '/app/brand' },
    ],
  },
]

export const SETUP: Section[] = [
  { label: 'Channels', href: '/app/channels', icon: Send },
  {
    label: 'Integrations',
    href: '/app/mcp',
    icon: Bot,
    tabs: [
      { label: 'AI assistants', href: '/app/mcp' },
      { label: 'Workflows', href: '/app/workflows' },
    ],
  },
]

const under = (path: string, href: string) => {
  const p = href.split('?')[0]
  return path === p || path.startsWith(p + '/')
}

export function sectionOf(path: string): Section | undefined {
  return [...MAIN, ...SETUP].find(
    (s) => under(path, s.href) || s.also?.some((a) => under(path, a)) || s.tabs?.some((t) => under(path, t.href)),
  )
}

// A tab is current on its own page only (not on editors below it). Tabs that
// share a path are told apart by ?tab=.
export function tabActive(tab: Tab, path: string, tabParam: string | null) {
  const [p, q] = tab.href.split('?')
  if (path !== p) return false
  const want = q ? new URLSearchParams(q).get('tab') : null
  return want === tabParam || (!want && tabParam === null)
}
