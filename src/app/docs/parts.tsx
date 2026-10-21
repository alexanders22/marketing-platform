import Link from 'next/link'
import type { ReactNode } from 'react'
import { Logo } from '@/components/landing/Logo'

// Shared by the docs pages (/docs, /docs/website): the page shell with its
// side navigation, and the building blocks of a reference section.

export type DocsNav = { title: string; items: { id: string; label: string }[] }[]

export function DocsShell({
  nav,
  badge,
  links,
  action,
  children,
}: {
  nav: DocsNav
  badge: string
  links: { href: string; label: string }[]
  action: { href: string; label: string }
  children: ReactNode
}) {
  const NAV = nav
  return (
    <div className="min-h-screen bg-white text-zinc-900 [color-scheme:light]">
      <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 text-zinc-900">
            <Logo />
          </Link>
          <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-600">{badge}</span>
          <nav className="ml-auto flex items-center gap-4 text-sm">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="hidden text-zinc-600 hover:text-zinc-900 sm:inline">
                {l.label}
              </Link>
            ))}
            <a href={action.href} className="rounded-lg bg-zinc-900 px-3 py-1.5 font-medium text-white hover:bg-zinc-800">
              {action.label}
            </a>
          </nav>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-10 px-4 sm:px-6">
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-56 shrink-0 overflow-y-auto py-8 lg:block">
          {NAV.map((g) => (
            <div key={g.title} className="mb-6">
              <p className="mb-2 text-xs font-semibold tracking-wider text-zinc-400 uppercase">{g.title}</p>
              <ul className="space-y-0.5">
                {g.items.map((i) => (
                  <li key={i.id}>
                    <a href={`#${i.id}`} className="block rounded-md px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900">
                      {i.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </aside>

        <main className="min-w-0 flex-1 py-10 lg:max-w-3xl">
          <details className="mb-8 rounded-xl border border-zinc-200 p-3 text-sm lg:hidden">
            <summary className="cursor-pointer font-medium">On this page</summary>
            <ul className="mt-2 grid grid-cols-2 gap-1">
              {NAV.flatMap((g) => g.items).map((i) => (
                <li key={i.id}>
                  <a href={`#${i.id}`} className="text-indigo-600">
                    {i.label}
                  </a>
                </li>
              ))}
            </ul>
          </details>

          {children}
        </main>
      </div>
    </div>
  )
}

/* ─── Building blocks ──────────────────────────────────────────────────── */

export function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-zinc-200 py-12 first:border-t-0 first:pt-0">
      <h2 className="text-2xl font-semibold tracking-tight">
        <a href={`#${id}`} className="hover:underline">
          {title}
        </a>
      </h2>
      <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-zinc-700 [&_a]:text-indigo-600 [&_:not(pre)>code]:rounded [&_:not(pre)>code]:bg-zinc-100 [&_:not(pre)>code]:px-1 [&_:not(pre)>code]:py-0.5 [&_:not(pre)>code]:text-[13px] [&_:not(pre)>code]:text-zinc-800">
        {children}
      </div>
    </section>
  )
}

const METHOD: Record<string, string> = {
  GET: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  POST: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  DELETE: 'bg-red-50 text-red-700 ring-red-200',
}

export function Endpoint({ method, path, children }: { method: 'GET' | 'POST' | 'DELETE'; path: string; children?: ReactNode }) {
  return (
    <div className="mt-8 first:mt-4">
      <p className="flex flex-wrap items-center gap-2 font-mono text-sm">
        <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ${METHOD[method]}`}>{method}</span>
        <span className="font-medium text-zinc-900">{path}</span>
      </p>
      <div className="mt-3 space-y-3">{children}</div>
    </div>
  )
}

export function Params({ rows, title = 'Body' }: { rows: [string, string, string][]; title?: string }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-200">
      <table className="w-full min-w-[520px] text-sm">
        <thead className="bg-zinc-50 text-left text-xs text-zinc-500">
          <tr>
            <th className="px-4 py-2 font-medium">{title}</th>
            <th className="px-4 py-2 font-medium">Type</th>
            <th className="px-4 py-2 font-medium">Description</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {rows.map(([name, type, desc]) => (
            <tr key={name}>
              <td className="px-4 py-2 align-top font-mono text-[13px] text-zinc-900">{name}</td>
              <td className="px-4 py-2 align-top text-xs text-zinc-500">{type}</td>
              <td className="px-4 py-2 align-top text-zinc-700">{desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
