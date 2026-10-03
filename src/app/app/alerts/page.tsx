import type { Metadata } from 'next'
import Link from 'next/link'
import { AlertTriangle, Bell, CheckCircle2, OctagonAlert } from 'lucide-react'
import { LocalTime } from '@/components/LocalTime'
import { requireContext } from '@/lib/context'
import { prisma } from '@/lib/prisma'
import { AlertControls } from './AlertControls'

export const metadata: Metadata = { title: 'Alerts — Khma' }

const ICON = {
  CRITICAL: <OctagonAlert size={17} className="text-red-600" />,
  WARNING: <AlertTriangle size={17} className="text-amber-600" />,
  INFO: <CheckCircle2 size={17} className="text-emerald-600" />,
}

export default async function AlertsPage() {
  const { workspace, account, role } = await requireContext()
  const alerts = await prisma.alert.findMany({ where: { workspaceId: workspace.id }, orderBy: { createdAt: 'desc' }, take: 100 })
  const unread = alerts.filter((a) => !a.readAt).map((a) => a.id)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h1 className="text-2xl font-semibold tracking-tight">Alerts</h1>
          <p className="text-sm text-zinc-500">Goals that slipped, rejected campaigns, failed posts and disconnected accounts.</p>
        </div>
        <AlertControls unread={unread} emails={account.alertEmails} canEdit={role !== 'EDITOR'} />
      </div>

      {alerts.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-zinc-300 p-10 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-zinc-100">
            <Bell size={22} />
          </span>
          <h2 className="mt-4 text-lg font-semibold">All quiet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-zinc-500">
            <Link href="/app/goals" className="font-medium text-zinc-900 underline">
              Set goals
            </Link>{' '}
            for cost per lead, reach, views or engagement, and Khma will tell you when something needs attention.
          </p>
        </section>
      ) : (
        <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200">
          {alerts.map((a) => (
            <li key={a.id} className={`flex gap-3 p-4 ${a.readAt ? '' : 'bg-indigo-50/40'}`}>
              <span className="mt-0.5 shrink-0">{ICON[a.severity]}</span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  {a.title}
                  {!a.readAt && <span className="rounded-full bg-indigo-600 px-1.5 py-px text-[10px] font-semibold text-white">NEW</span>}
                </p>
                <p className="mt-1 text-sm text-zinc-600">{a.body}</p>
                <p className="mt-1.5 flex flex-wrap gap-3 text-xs text-zinc-400">
                  <LocalTime iso={a.createdAt.toISOString()} options={{ day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }} />
                  {a.href && (
                    <Link href={a.href} className="font-medium text-indigo-600 hover:underline">
                      Open
                    </Link>
                  )}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
