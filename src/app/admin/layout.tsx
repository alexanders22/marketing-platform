import type { Metadata } from 'next'
import Link from 'next/link'
import { LogoMark } from '@/components/landing/Logo'
import { requireSuperAdmin } from '@/lib/admin'
import { AdminNav } from './AdminNav'

export const metadata: Metadata = { title: 'Admin — Loudpilot', robots: { index: false } }

export default async function AdminLayout({ children }: LayoutProps<'/admin'>) {
  const admin = await requireSuperAdmin()
  return (
    <div className="min-h-screen bg-[#f4f3f1] text-zinc-900 [color-scheme:light]">
      <header className="sticky top-0 z-30 border-b border-zinc-200 bg-[#f4f3f1]/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/admin" className="flex items-center gap-2 font-semibold">
            <LogoMark className="h-7 w-7" /> Admin
          </Link>
          <AdminNav />
          <div className="ml-auto flex items-center gap-4 text-sm">
            <span className="hidden text-zinc-500 sm:inline">{admin.email}</span>
            <Link href="/app" className="font-medium text-zinc-700 hover:text-zinc-900">
              Open app →
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  )
}
