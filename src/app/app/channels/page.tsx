import type { Metadata } from 'next'
import { FaLinkedinIn } from 'react-icons/fa6'
import { SiFacebook, SiGoogleads, SiInstagram, SiPinterest, SiTelegram, SiThreads, SiTiktok, SiX, SiYoutube } from 'react-icons/si'
import { PageHeader } from '@/components/EmptyState'
import { requireContext } from '@/lib/context'
import { metaEnabled } from '@/lib/meta'
import { planLimits } from '@/lib/plans'
import { prisma } from '@/lib/prisma'
import { DisconnectButton } from './DisconnectButton'
import { GoogleAnalyticsSection } from './GoogleAnalytics'
import { gaEnabled } from '@/lib/ga'

export const metadata: Metadata = { title: 'Channels — Loudpilot' }

const META = {
  FACEBOOK: { label: 'Facebook Page', icon: SiFacebook, color: '#1877F2' },
  INSTAGRAM: { label: 'Instagram', icon: SiInstagram, color: '#E4405F' },
  META_ADS: { label: 'Meta ad account', icon: SiFacebook, color: '#0866FF' },
} as const

const LATER = [
  { name: 'TikTok', icon: SiTiktok, color: '#000000', note: 'Videos and TikTok Ads' },
  { name: 'LinkedIn Page', icon: FaLinkedinIn, color: '#0A66C2', note: 'Company page posts' },
  { name: 'YouTube', icon: SiYoutube, color: '#FF0000', note: 'Shorts and videos' },
  { name: 'X', icon: SiX, color: '#000000', note: 'Posts' },
  { name: 'Threads', icon: SiThreads, color: '#000000', note: 'Posts' },
  { name: 'Telegram channel', icon: SiTelegram, color: '#26A5E4', note: 'Channel posts' },
  { name: 'Pinterest', icon: SiPinterest, color: '#BD081C', note: 'Pins' },
  { name: 'Google Ads', icon: SiGoogleads, color: '#4285F4', note: 'Search and display campaigns' },
]

const ERRORS: Record<string, string> = {
  'meta-off': 'Meta connections are not configured yet.',
  role: 'Only owners and admins can connect channels.',
  'meta-denied': 'Connection cancelled on Facebook.',
  'meta-state': 'The connection expired — please try again.',
  'meta-api': 'Facebook did not accept the connection. Please try again.',
  'meta-empty': 'No Pages or ad accounts were shared. Reconnect and pick at least one Page.',
  'ga-off': 'Google Analytics connections are not configured yet.',
  'ga-denied': 'Connection cancelled on Google.',
  'ga-state': 'The connection expired — please try again.',
  'ga-api': 'Google did not accept the connection. Please try again.',
  'ga-empty': 'This Google account has no Google Analytics 4 property. Sign in with the account that owns the website’s analytics.',
  profiles: 'Your plan has no room for more social profiles. Disconnect one or upgrade your plan.',
}

export default async function ChannelsPage({ searchParams }: PageProps<'/app/channels'>) {
  const { workspace, role, account } = await requireContext()
  const q = await searchParams
  const all = await prisma.socialAccount.findMany({
    where: { workspaceId: workspace.id },
    orderBy: [{ network: 'asc' }, { name: 'asc' }],
  })
  const accounts = all.filter((a) => a.network in META)
  const analytics = all.filter((a) => a.network === 'GOOGLE_ANALYTICS')
  const enabled = metaEnabled()
  const canEdit = role !== 'EDITOR'
  const connected = typeof q.connected === 'string' ? Number(q.connected) : 0
  const error = typeof q.error === 'string' ? ERRORS[q.error] : undefined
  const skipped = typeof q.skipped === 'string' ? Number(q.skipped) : 0
  const limit = planLimits(account.plan).profiles
  const profiles = await prisma.socialAccount.count({ where: { workspace: { accountId: account.id }, network: { in: ['FACEBOOK', 'INSTAGRAM'] } } })

  return (
    <>
      <PageHeader title="Channels" sub="Connect the pages and ad accounts Loudpilot publishes to and reads results from." />

      {connected > 0 && (
        <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Connected {connected} account{connected === 1 ? '' : 's'}.
        </p>
      )}
      {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {skipped > 0 && (
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {skipped} profile{skipped === 1 ? ' was' : 's were'} not added: your plan includes {limit} social profiles. Disconnect one or upgrade to add more.
        </p>
      )}
      <p className="mb-4 text-sm text-zinc-500">
        Social profiles: <b className="text-zinc-800 tabular-nums">{profiles}</b> of {limit} on your plan (all companies together; ad accounts don&apos;t count).
      </p>

      <section className="rounded-2xl border border-zinc-200 p-5">
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex -space-x-2">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-white ring-1 ring-zinc-200">
              <SiFacebook size={20} color="#1877F2" />
            </span>
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-white ring-1 ring-zinc-200">
              <SiInstagram size={20} color="#E4405F" />
            </span>
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold">Facebook, Instagram & Meta Ads</h2>
            <p className="text-sm text-zinc-500">Publish posts, read insights and ad results. Pick the Pages and ad accounts to share.</p>
          </div>
          {enabled && canEdit ? (
            <a href="/auth/meta" className="shrink-0 rounded-lg bg-[#1877F2] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#166fe5]">
              {accounts.some((a) => a.network in META) ? 'Add or refresh' : 'Connect'}
            </a>
          ) : (
            <span className="shrink-0 rounded-lg bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-500">
              {enabled ? 'Owners and admins connect' : 'Soon'}
            </span>
          )}
        </div>

        {accounts.length > 0 && (
          <ul className="mt-5 divide-y divide-zinc-100 rounded-xl border border-zinc-200">
            {accounts.map((a) => {
              const m = META[a.network as keyof typeof META]
              return (
                <li key={a.id} className="flex min-w-0 items-center gap-3 p-3">
                  {a.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.avatarUrl} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-zinc-200" />
                  ) : (
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-zinc-50 ring-1 ring-zinc-200">
                      {m && <m.icon size={16} color={m.color} />}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {a.name} {a.handle && <span className="text-zinc-400">@{a.handle}</span>}
                    </p>
                    <p className="truncate text-xs text-zinc-500">
                      {m?.label ?? a.network}
                      {a.status !== 'ACTIVE' && (
                        <span className="ml-2 font-medium text-red-600">
                          Needs reconnecting{a.lastError ? ` — ${a.lastError}` : ''}
                        </span>
                      )}
                      {a.network === 'META_ADS' && a.status === 'ACTIVE' && (
                        <span className={`ml-2 ${a.scopes.includes('ads_management') ? 'text-emerald-600' : 'text-amber-700'}`}>
                          {a.scopes.includes('ads_management') ? 'Can boost posts' : 'Read only — reconnect and allow “Manage ads” to boost posts'}
                        </span>
                      )}
                    </p>
                  </div>
                  {canEdit && <DisconnectButton id={a.id} name={a.name} />}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <GoogleAnalyticsSection
        accounts={analytics.map((a) => ({
          id: a.id,
          name: a.name,
          account: a.handle,
          pending: a.externalId.startsWith('pending:'),
          properties: (a.meta as { properties?: { id: string; name: string; account: string }[] } | null)?.properties ?? [],
          status: a.status,
          lastError: a.lastError,
          syncedAt: a.syncedAt?.toISOString() ?? null,
        }))}
        enabled={gaEnabled()}
        canEdit={canEdit}
        pick={q.ga === 'pick'}
      />

      <h2 className="mt-8 mb-3 text-sm font-semibold text-zinc-500">Coming next</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {LATER.map((c) => (
          <div key={c.name} className="flex min-w-0 items-center gap-3 rounded-xl border border-zinc-200 p-4">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-zinc-50 ring-1 ring-zinc-200">
              <c.icon size={20} color={c.color} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{c.name}</p>
              <p className="truncate text-sm text-zinc-500">{c.note}</p>
            </div>
            <span className="shrink-0 rounded-lg bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-500">Soon</span>
          </div>
        ))}
      </div>
    </>
  )
}
