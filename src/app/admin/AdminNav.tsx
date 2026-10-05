'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV = [
  { href: '/admin', label: 'Overview', exact: true },
  { href: '/admin/companies', label: 'Companies' },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/payments', label: 'Payments' },
  { href: '/admin/pricing', label: 'Pricing' },
  { href: '/admin/activity', label: 'Activity' },
]

export function AdminNav() {
  const path = usePathname()
  return (
    <nav className="-mx-1 flex gap-1 overflow-x-auto text-sm">
      {NAV.map((n) => {
        const active = n.exact ? path === n.href : path.startsWith(n.href)
        return (
          <Link
            key={n.href}
            href={n.href}
            className={`rounded-lg px-3 py-1.5 whitespace-nowrap ${active ? 'bg-zinc-900 font-medium text-white' : 'text-zinc-700 hover:bg-zinc-200/60'}`}
          >
            {n.label}
          </Link>
        )
      })}
    </nav>
  )
}
