import type { Metadata } from 'next'
import { requireContext } from '@/lib/context'
import { PLANS } from '@/lib/plans'
import { prisma } from '@/lib/prisma'
import { AppSidebar } from './AppSidebar'

export const metadata: Metadata = { title: 'Loudpilot' }

function planLabel(plan: string, trialEndsAt: Date | null) {
  const name = PLANS.find((p) => p.id === plan)?.name
  if (!name) return 'No plan — choose one'
  if (trialEndsAt && trialEndsAt > new Date()) {
    const days = Math.ceil((trialEndsAt.getTime() - Date.now()) / 86_400_000)
    return `${name} trial · ${days} day${days === 1 ? '' : 's'} left`
  }
  return `${name} plan`
}

// Light app shell (the marketing site stays dark).
export default async function AppLayout({ children }: LayoutProps<'/app'>) {
  const { user, account, workspace, brand, role, companies, asAdmin } = await requireContext()
  const [alerts, recommendations, inbox] = await Promise.all([
    prisma.alert.count({ where: { workspaceId: workspace.id, readAt: null } }),
    prisma.recommendation.count({ where: { workspaceId: workspace.id, status: 'OPEN' } }),
    prisma.conversation.count({ where: { workspaceId: workspace.id, unread: { gt: 0 } } }),
  ])
  return (
    <div className="min-h-screen bg-[#f4f3f1] text-zinc-900 lg:flex [color-scheme:light]">
      <AppSidebar
        workspace={workspace.name}
        logoUrl={brand?.logoUrl ?? null}
        user={{ name: user.name, email: user.email }}
        credits={account.creditBalance}
        planLabel={planLabel(account.plan, account.trialEndsAt)}
        alerts={alerts}
        recommendations={recommendations}
        inbox={inbox}
        companies={companies.map((c) => ({ id: c.id, name: c.name, logoUrl: c.logoUrl, paused: c.paused }))}
        currentId={workspace.id}
        canAddCompany={asAdmin || role !== 'EDITOR'}
        superAdmin={user.role === 'SUPER_ADMIN'}
      />
      <main className="min-w-0 flex-1 p-2 lg:py-3 lg:pr-3 lg:pl-0">
        <div className="min-h-[calc(100vh-1.5rem)] rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5 sm:p-8">
          {(asAdmin || account.pausedAt) && (
            <div className="-mt-1 mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-900 ring-1 ring-amber-200">
              <span>
                {asAdmin ? 'Super admin view' : 'Viewing'} · <b>{workspace.name}</b> ({account.name})
                {account.pausedAt && ' · paused'}
              </span>
              <a href={`/admin/companies/${account.id}`} className="ml-auto font-medium underline">
                Back to admin
              </a>
            </div>
          )}
          {children}
        </div>
      </main>
    </div>
  )
}
