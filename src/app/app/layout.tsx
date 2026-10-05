import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { requireContext } from '@/lib/context'
import { PLANS, billingState } from '@/lib/plans'
import { prisma } from '@/lib/prisma'
import { AppSidebar } from './AppSidebar'
import { CreditsBadge } from './CreditsBadge'
import { SectionTabs } from './SectionTabs'
import { prices } from '@/lib/credits'
import { PricesProvider } from '@/components/Prices'

export const metadata: Metadata = { title: 'Loudpilot' }

function planLabel(a: { plan: string; trialEndsAt: Date | null; paidUntil: Date | null }) {
  const name = PLANS.find((p) => p.id === a.plan)?.name
  switch (billingState(a)) {
    case 'none':
      return 'No plan — choose one'
    case 'trial': {
      const days = Math.ceil((a.trialEndsAt!.getTime() - Date.now()) / 86_400_000)
      return `${name} trial · ${days} day${days === 1 ? '' : 's'} left`
    }
    case 'active':
      return `${name} plan`
    case 'expired':
      return `${name} · trial ended`
  }
}

// Light app shell (the marketing site stays dark).
export default async function AppLayout({ children }: LayoutProps<'/app'>) {
  const { user, account, workspace, brand, role, companies, asAdmin } = await requireContext()
  const [alerts, recommendations, inbox, creditPrices] = await Promise.all([
    prisma.alert.count({ where: { workspaceId: workspace.id, readAt: null } }),
    prisma.recommendation.count({ where: { workspaceId: workspace.id, status: 'OPEN' } }),
    prisma.conversation.count({ where: { workspaceId: workspace.id, unread: { gt: 0 } } }),
    prices(),
  ])
  return (
    <PricesProvider prices={creditPrices}>
    <div className="min-h-screen bg-[#f4f3f1] text-zinc-900 lg:flex [color-scheme:light]">
      <AppSidebar
        workspace={workspace.name}
        logoUrl={brand?.logoUrl ?? null}
        user={{ name: user.name, email: user.email }}
        credits={account.creditBalance}
        planLabel={planLabel(account)}
        alerts={alerts}
        recommendations={recommendations}
        inbox={inbox}
        companies={companies.map((c) => ({ id: c.id, name: c.name, logoUrl: c.logoUrl, paused: c.paused }))}
        currentId={workspace.id}
        canAddCompany={asAdmin || role !== 'EDITOR'}
        superAdmin={user.role === 'SUPER_ADMIN'}
      />
      <main className="min-w-0 flex-1 p-2 lg:py-3 lg:pr-3 lg:pl-0">
        <header className="mb-2 hidden items-center justify-end gap-2 lg:flex">
          <CreditsBadge credits={account.creditBalance} planLabel={planLabel(account)} />
        </header>
        <div className="min-h-[calc(100vh-1.5rem)] rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5 sm:p-8 lg:min-h-[calc(100vh-4.5rem)]">
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
          {billingState(account) === 'expired' && !asAdmin && (
            <div className="-mt-1 mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-violet-50 px-4 py-2.5 text-sm text-violet-900 ring-1 ring-violet-200">
              <span>Your free trial has ended. Choose how to continue — your posts, channels and credits are kept.</span>
              <Link href="/app/plan" className="ml-auto font-medium underline">
                Plans
              </Link>
            </div>
          )}
          <Suspense fallback={null}>
            <SectionTabs counts={{ alerts, recommendations }} />
          </Suspense>
          {children}
        </div>
      </main>
    </div>
    </PricesProvider>
  )
}
