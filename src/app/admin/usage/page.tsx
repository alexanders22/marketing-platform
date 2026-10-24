import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { PLANS, PROFILE_NETWORKS } from '@/lib/plans'
import { card, daysAgo, Stat } from '../shared'

// Who uses Loudpilot and how much: customers per plan (paying, on trial,
// lapsed), their companies, social profiles, posts and AI credits in the last
// 30 days, averages per account and per company, and how active companies are.

const n = (v: bigint | number | null | undefined) => Number(v ?? 0)
// One decimal; two below 1, so 2 profiles over 101 companies reads 0.02, not 0.
const avg = (a: number, b: number) => (b > 0 ? (a / b).toLocaleString('en-US', { maximumFractionDigits: a / b < 1 ? 2 : 1 }) : '—')
const PLAN_NAME: Record<string, string> = { ...Object.fromEntries(PLANS.map((p) => [p.id, p.name])), NONE: 'No plan yet' }
const ORDER = [...PLANS.map((p) => p.id as string), 'NONE']
const NETWORK: Record<string, string> = { FACEBOOK: 'Facebook', INSTAGRAM: 'Instagram', TIKTOK: 'TikTok', LINKEDIN: 'LinkedIn', YOUTUBE: 'YouTube', TELEGRAM: 'Telegram', X: 'X', THREADS: 'Threads', PINTEREST: 'Pinterest' }

// Posts a company created in 30 days → how active it is.
const BUCKETS = [
  { label: 'No posts', min: 0, max: 0 },
  { label: '1–14 (light)', min: 1, max: 14 },
  { label: '15–29 (moderate)', min: 15, max: 29 },
  { label: '30–59 (active, ~a post a day)', min: 30, max: 59 },
  { label: '60+ (very active)', min: 60, max: Infinity },
]

export default async function AdminUsage() {
  const since = daysAgo(30)
  const [accounts, companies, profiles, posts, credits, perCompany, networks] = await Promise.all([
    prisma.$queryRaw<{ plan: string; paying: bigint; trial: bigint; lapsed: bigint; total: bigint }[]>`
      select plan::text as plan,
        count(*) filter (where "paidUntil" > now()) as paying,
        count(*) filter (where ("paidUntil" is null or "paidUntil" <= now()) and "trialEndsAt" > now()) as trial,
        count(*) filter (where ("paidUntil" is null or "paidUntil" <= now()) and ("trialEndsAt" is null or "trialEndsAt" <= now())) as lapsed,
        count(*) as total
      from "Account" group by plan`,
    prisma.$queryRaw<{ plan: string; count: bigint }[]>`
      select a.plan::text as plan, count(w.id) as count from "Workspace" w join "Account" a on a.id = w."accountId" group by a.plan`,
    prisma.$queryRaw<{ plan: string; count: bigint }[]>`
      select a.plan::text as plan, count(s.id) as count from "SocialAccount" s
      join "Workspace" w on w.id = s."workspaceId" join "Account" a on a.id = w."accountId"
      where s.network::text = any(${PROFILE_NETWORKS as string[]}) group by a.plan`,
    prisma.$queryRaw<{ plan: string; created: bigint; published: bigint }[]>`
      select a.plan::text as plan, count(p.id) as created, count(p.id) filter (where p.status = 'PUBLISHED') as published
      from "Post" p join "Workspace" w on w.id = p."workspaceId" join "Account" a on a.id = w."accountId"
      where p."createdAt" >= ${since} group by a.plan`,
    // AI charges less their refunds (refunds carry a positive amount).
    prisma.$queryRaw<{ plan: string; used: bigint | null }[]>`
      select a.plan::text as plan, -sum(c.amount) as used from "CreditEntry" c join "Account" a on a.id = c."accountId"
      where c.action is not null and c."createdAt" >= ${since} group by a.plan`,
    prisma.$queryRaw<{ id: string; name: string; accountId: string; account: string; plan: string; posts: bigint; profiles: bigint }[]>`
      select w.id, w.name, a.id as "accountId", a.name as account, a.plan::text as plan,
        (select count(*) from "Post" p where p."workspaceId" = w.id and p."createdAt" >= ${since}) as posts,
        (select count(*) from "SocialAccount" s where s."workspaceId" = w.id and s.network::text = any(${PROFILE_NETWORKS as string[]})) as profiles
      from "Workspace" w join "Account" a on a.id = w."accountId"`,
    prisma.$queryRaw<{ network: string; count: bigint }[]>`
      select s.network::text as network, count(*) as count from "SocialAccount" s
      join "Workspace" w on w.id = s."workspaceId" where w."accountId" is not null and s.network::text = any(${PROFILE_NETWORKS as string[]})
      group by s.network order by count desc`,
  ])

  const of = <T extends { plan: string }>(rows: T[], plan: string) => rows.find((r) => r.plan === plan)
  const rows = ORDER.map((plan) => {
    const a = of(accounts, plan)
    const p = of(posts, plan)
    return {
      plan,
      paying: n(a?.paying),
      trial: n(a?.trial),
      lapsed: n(a?.lapsed),
      total: n(a?.total),
      companies: n(of(companies, plan)?.count),
      profiles: n(of(profiles, plan)?.count),
      posts: n(p?.created),
      published: n(p?.published),
      credits: n(of(credits, plan)?.used),
    }
  }).filter((r) => r.total > 0 || r.plan !== 'NONE')
  const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((s, r) => s + f(r), 0)
  const totals = { paying: sum((r) => r.paying), trial: sum((r) => r.trial), companies: sum((r) => r.companies), profiles: sum((r) => r.profiles), posts: sum((r) => r.posts), credits: sum((r) => r.credits) }

  const companyRows = perCompany.map((c) => ({ ...c, posts: n(c.posts), profiles: n(c.profiles) }))
  const buckets = BUCKETS.map((b) => ({ ...b, count: companyRows.filter((c) => c.posts >= b.min && c.posts <= b.max).length }))
  const top = [...companyRows].sort((x, y) => y.posts - x.posts).slice(0, 10).filter((c) => c.posts > 0)
  const th = 'px-4 py-2.5 text-right font-medium'
  const td = 'px-4 py-2 text-right tabular-nums'

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Usage</h1>
        <p className="mt-1 text-sm text-zinc-500">Customers per plan and what they do with Loudpilot. Posts and AI credits: the last 30 days. Partner companies not yet signed up are left out.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Paying customers" value={totals.paying} sub={`${totals.trial} on a free trial`} />
        <Stat label="Companies" value={totals.companies} sub={`${avg(totals.companies, sum((r) => r.total))} per account`} />
        <Stat label="Social profiles" value={totals.profiles} sub={`${avg(totals.profiles, totals.companies)} per company`} />
        <Stat label="Posts, 30 days" value={totals.posts.toLocaleString('en-US')} sub={`${avg(totals.posts, totals.companies)} per company`} />
        <Stat label="AI credits used, 30 days" value={totals.credits.toLocaleString('en-US')} sub={`${avg(totals.credits, sum((r) => r.total))} per account`} />
      </div>

      <section className="overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
        <h2 className="px-5 pt-4 font-semibold">By plan</h2>
        <table className="mt-2 w-full min-w-[900px] text-sm" aria-label="Usage by plan">
          <thead className="border-y border-zinc-100 text-left text-xs text-zinc-500">
            <tr>
              <th className="px-4 py-2.5 font-medium">Plan</th>
              <th className={th}>Paying</th>
              <th className={th}>On trial</th>
              <th className={th}>Lapsed</th>
              <th className={th}>Companies</th>
              <th className={th}>Per account</th>
              <th className={th}>Social profiles</th>
              <th className={th}>Per company</th>
              <th className={th}>Posts, 30 d</th>
              <th className={th}>Per company</th>
              <th className={th}>Published</th>
              <th className={th}>AI credits, 30 d</th>
              <th className={th}>Per account</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {rows.map((r) => (
              <tr key={r.plan}>
                <td className="px-4 py-2 font-medium">{PLAN_NAME[r.plan] ?? r.plan}</td>
                <td className={td}>{r.paying}</td>
                <td className={td}>{r.trial}</td>
                <td className={td}>{r.lapsed}</td>
                <td className={td}>{r.companies}</td>
                <td className={td}>{avg(r.companies, r.total)}</td>
                <td className={td}>{r.profiles}</td>
                <td className={td}>{avg(r.profiles, r.companies)}</td>
                <td className={td}>{r.posts.toLocaleString('en-US')}</td>
                <td className={td}>{avg(r.posts, r.companies)}</td>
                <td className={td}>{r.published.toLocaleString('en-US')}</td>
                <td className={td}>{r.credits.toLocaleString('en-US')}</td>
                <td className={td}>{avg(r.credits, r.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="px-5 py-3 text-xs text-zinc-500">Lapsed = the trial or the paid period is over and nothing is paid. Averages are over every account on the plan, paying or not.</p>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className={card}>
          <h2 className="font-semibold">How active companies are</h2>
          <p className="mt-1 text-sm text-zinc-500">Posts each company created in the last 30 days.</p>
          <ul className="mt-3 space-y-2 text-sm" aria-label="Companies by activity">
            {buckets.map((b) => (
              <li key={b.label} className="flex items-center gap-3">
                <span className="w-56 shrink-0 text-zinc-600">{b.label}</span>
                <span className="h-2 flex-1 rounded-full bg-zinc-100">
                  <span className="block h-2 rounded-full bg-indigo-500" style={{ width: `${companyRows.length ? (b.count / companyRows.length) * 100 : 0}%` }} />
                </span>
                <span className="w-10 text-right tabular-nums">{b.count}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className={card}>
          <h2 className="font-semibold">Social profiles by network</h2>
          <ul className="mt-3 space-y-2 text-sm" aria-label="Social profiles by network">
            {networks.length === 0 && <li className="text-zinc-500">No social profiles connected yet.</li>}
            {networks.map((x) => (
              <li key={x.network} className="flex items-center gap-3">
                <span className="w-28 shrink-0 text-zinc-600">{NETWORK[x.network] ?? x.network}</span>
                <span className="h-2 flex-1 rounded-full bg-zinc-100">
                  <span className="block h-2 rounded-full bg-indigo-500" style={{ width: `${totals.profiles ? (n(x.count) / totals.profiles) * 100 : 0}%` }} />
                </span>
                <span className="w-10 text-right tabular-nums">{n(x.count)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
        <h2 className="px-5 pt-4 font-semibold">Most active companies</h2>
        <table className="mt-2 w-full min-w-[640px] text-sm" aria-label="Most active companies">
          <thead className="border-y border-zinc-100 text-left text-xs text-zinc-500">
            <tr>
              <th className="px-4 py-2.5 font-medium">Company</th>
              <th className="px-4 py-2.5 font-medium">Account</th>
              <th className="px-4 py-2.5 font-medium">Plan</th>
              <th className={th}>Social profiles</th>
              <th className={th}>Posts, 30 d</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {top.map((c) => (
              <tr key={c.id}>
                <td className="px-4 py-2 font-medium">{c.name}</td>
                <td className="px-4 py-2">
                  <Link href={`/admin/companies/${c.accountId}`} className="text-indigo-600 hover:underline">
                    {c.account}
                  </Link>
                </td>
                <td className="px-4 py-2">{PLAN_NAME[c.plan] ?? c.plan}</td>
                <td className={td}>{c.profiles}</td>
                <td className={td}>{c.posts}</td>
              </tr>
            ))}
            {top.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-6 text-center text-zinc-500">
                  No posts in the last 30 days.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  )
}
