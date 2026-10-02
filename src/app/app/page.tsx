import Link from 'next/link'
import { ArrowRight, CheckCircle2, Circle, Coins, Palette, Share2, Sparkles } from 'lucide-react'
import { requireContext } from '@/lib/context'
import { prisma } from '@/lib/prisma'

export default async function Overview() {
  const { user, account, workspace } = await requireContext()
  const [brand, channels] = await Promise.all([
    prisma.brandKit.findUnique({ where: { workspaceId: workspace.id } }),
    prisma.socialAccount.count({ where: { workspaceId: workspace.id, status: 'ACTIVE' } }),
  ])

  const steps = [
    {
      done: Boolean(brand?.description && brand?.voice),
      title: 'Describe your brand',
      body: 'Voice, audience and colours — the AI uses them in everything it creates.',
      href: '/app/brand',
      cta: 'Open brand kit',
    },
    {
      done: channels > 0,
      title: 'Connect your channels',
      body: 'Facebook, Instagram and TikTok pages and ad accounts.',
      soon: true,
    },
    {
      done: false,
      title: 'Get your first audit',
      body: 'We read the last 90 days of posts and ads and show what works.',
      soon: true,
    },
  ]
  const doneCount = steps.filter((s) => s.done).length

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Hi {user.name.split(' ')[0]} 👋</h1>
        <p className="mt-1 text-zinc-400">Let&apos;s get {workspace.name} ready for AI marketing.</p>
      </div>

      <section className="rounded-2xl border border-white/10 bg-zinc-900/60 p-6">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-semibold">Getting started</h2>
          <span className="text-sm text-zinc-400">
            {doneCount} of {steps.length} done
          </span>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-zinc-800">
          <div className="h-full rounded-full bg-white" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
        </div>
        <ul className="mt-6 divide-y divide-white/5">
          {steps.map((s) => (
            <li key={s.title} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center">
              {s.done ? (
                <CheckCircle2 size={20} className="shrink-0 text-emerald-400" />
              ) : (
                <Circle size={20} className="shrink-0 text-zinc-600" />
              )}
              <div className="flex-1">
                <p className={`font-medium ${s.done ? 'text-zinc-400 line-through' : ''}`}>{s.title}</p>
                <p className="text-sm text-zinc-500">{s.body}</p>
              </div>
              {s.href && !s.done && (
                <Link
                  href={s.href}
                  className="inline-flex items-center gap-1.5 self-start rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-zinc-950 sm:self-auto"
                >
                  {s.cta} <ArrowRight size={14} />
                </Link>
              )}
              {s.soon && <span className="self-start text-xs text-zinc-500 sm:self-auto">Coming soon</span>}
            </li>
          ))}
        </ul>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <Stat icon={Coins} label="AI credits" value={account.creditBalance.toLocaleString()} href="/app/credits" />
        <Stat icon={Share2} label="Connected channels" value={String(channels)} />
        <Stat icon={Palette} label="Brand kit" value={brand?.description ? 'Ready' : 'Not set'} href="/app/brand" />
      </section>

      <section className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-zinc-900/60 p-6 sm:flex-row sm:items-center">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-400/15 text-violet-300">
          <Sparkles size={18} />
        </span>
        <div>
          <h2 className="font-semibold">Content generation is next</h2>
          <p className="text-sm text-zinc-400">
            Once your brand kit is filled in, you&apos;ll be able to generate posts, images and ad creatives from it.
          </p>
        </div>
      </section>
    </div>
  )
}

function Stat({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: typeof Coins
  label: string
  value: string
  href?: string
}) {
  const body = (
    <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-5 transition hover:border-white/20">
      <span className="inline-flex items-center gap-2 text-sm text-zinc-400">
        <Icon size={15} />
        {label}
      </span>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  )
  return href ? <Link href={href}>{body}</Link> : body
}
