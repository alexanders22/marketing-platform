import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { requireContext } from '@/lib/context'
import { GRACE_MS, PLANS, billingState, serviceOn } from '@/lib/plans'
import { prisma } from '@/lib/prisma'
import { AppSidebar } from './AppSidebar'
import { LanguageSwitch } from '@/components/LanguageSwitch'
import { appLang } from '@/lib/app-lang-server'
import { CreditsBadge } from './CreditsBadge'
import { SectionTabs } from './SectionTabs'
import { creditValue, prices } from '@/lib/credits'
import { ConnectionNotice } from '@/components/ConnectionNotice'
import { CreditHints } from '@/components/CreditHints'
import { PricesProvider } from '@/components/Prices'
import { interviewState } from '@/lib/business'

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
      return a.paidUntil ? `${name} plan · ended` : `${name} · trial ended`
  }
}

// Light app shell (the marketing site stays dark).
export default async function AppLayout({ children }: LayoutProps<'/app'>) {
  const { user, account, workspace, brand, role, companies, asAdmin } = await requireContext()
  const [alerts, recommendations, social, website, creditPrices, pilot, value] = await Promise.all([
    prisma.alert.count({ where: { workspaceId: workspace.id, readAt: null } }),
    prisma.recommendation.count({ where: { workspaceId: workspace.id, status: 'OPEN' } }),
    prisma.conversation.count({ where: { workspaceId: workspace.id, unread: { gt: 0 } } }),
    // Website chats a person has to answer.
    prisma.chatConversation.count({ where: { workspaceId: workspace.id, status: 'HUMAN', unread: { gt: 0 } } }),
    prices(),
    role === 'EDITOR' ? null : interviewState(workspace.id),
    creditValue(),
  ])
  const lang = await appLang()
  return (
    <PricesProvider prices={creditPrices} value={value}>
    <div className="min-h-screen bg-[#f4f3f1] text-zinc-900 lg:flex [color-scheme:light]">
      <AppSidebar
        workspace={workspace.name}
        logoUrl={brand?.logoUrl ?? null}
        user={{ name: user.name, email: user.email }}
        credits={account.creditBalance}
        planLabel={planLabel(account)}
        alerts={alerts}
        recommendations={recommendations}
        inbox={social + website}
        companies={companies.map((c) => ({ id: c.id, name: c.name, logoUrl: c.logoUrl, paused: c.paused }))}
        currentId={workspace.id}
        canAddCompany={asAdmin || role !== 'EDITOR'}
        superAdmin={user.role === 'SUPER_ADMIN'}
        pilot={pilot}
        lang={lang}
      />
      <main className="min-w-0 flex-1 p-2 lg:py-3 lg:pr-3 lg:pl-0">
        <header className="mb-2 hidden items-center justify-end gap-2 lg:flex">
          <LanguageSwitch lang={lang} />
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
          {/* A partner's customers are always served: no banner. */}
          {billingState(account) === 'expired' && !asAdmin && !account.partnerId && (
            <div className="-mt-1 mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-violet-50 px-4 py-2.5 text-sm text-violet-900 ring-1 ring-violet-200">
              {account.paidUntil ? (
                <>
                  <span>
                    Your plan ended on {account.paidUntil.toLocaleDateString('en-GB')}.{' '}
                    {serviceOn(account)
                      ? `Publishing stops on ${new Date(account.paidUntil.getTime() + GRACE_MS).toLocaleDateString('en-GB')} unless you renew.`
                      : 'Publishing and connecting channels are paused until you renew.'}{' '}
                    Your posts, channels and credits are kept.
                  </span>
                  <Link href="/app/credits?renew=1" className="ml-auto font-medium underline">
                    Renew
                  </Link>
                </>
              ) : (
                <>
                  <span>Your free trial has ended. Publishing and connecting channels are paused until you choose a plan — your posts, channels and credits are kept.</span>
                  <Link href="/app/plan" className="ml-auto font-medium underline">
                    Plans
                  </Link>
                </>
              )}
            </div>
          )}
          <Suspense fallback={null}>
            <SectionTabs counts={{ alerts, recommendations }} />
          </Suspense>
          {children}
        </div>
      </main>
      <CreditHints value={value} />
      <ConnectionNotice />
    </div>
    </PricesProvider>
  )
}
