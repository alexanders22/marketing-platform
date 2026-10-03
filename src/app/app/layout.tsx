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
  const { user, account, workspace, brand } = await requireContext()
  const [alerts, recommendations] = await Promise.all([
    prisma.alert.count({ where: { workspaceId: workspace.id, readAt: null } }),
    prisma.recommendation.count({ where: { workspaceId: workspace.id, status: 'OPEN' } }),
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
      />
      <main className="min-w-0 flex-1 p-2 lg:py-3 lg:pr-3 lg:pl-0">
        <div className="min-h-[calc(100vh-1.5rem)] rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5 sm:p-8">
          {children}
        </div>
      </main>
    </div>
  )
}
