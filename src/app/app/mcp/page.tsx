import type { Metadata } from 'next'
import Link from 'next/link'
import { Bot, KeyRound, Plug } from 'lucide-react'
import { CodeBlock } from '@/app/docs/CodeBlock'
import { LocalTime } from '@/components/LocalTime'
import { requireContext } from '@/lib/context'
import { appUrl } from '@/lib/mail'
import { TOOLS } from '@/lib/mcp/tools'
import { prisma } from '@/lib/prisma'
import { NewToken, RevokeButton } from './TokenControls'

export const metadata: Metadata = { title: 'AI assistants (MCP) — Khma' }

const RANGES = {
  '1h': { label: '1H', ms: 3_600_000, buckets: 12 },
  '1d': { label: '1D', ms: 86_400_000, buckets: 24 },
  '30d': { label: '30D', ms: 30 * 86_400_000, buckets: 30 },
} as const

export default async function McpPage({ searchParams }: PageProps<'/app/mcp'>) {
  const { workspace, user, role } = await requireContext()
  const q = await searchParams
  const range = (typeof q.range === 'string' && q.range in RANGES ? q.range : '1d') as keyof typeof RANGES
  const r = RANGES[range]
  // Server component, rendered per request: "now" is the request time.
  const now = new Date().getTime()
  const since = new Date(now - r.ms)
  const [requests, tokens] = await Promise.all([
    prisma.mcpRequest.findMany({ where: { workspaceId: workspace.id, createdAt: { gte: since } }, select: { createdAt: true, tool: true, ok: true } }),
    prisma.accessToken.findMany({
      where: { workspaceId: workspace.id, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }], ...(role === 'EDITOR' ? { userId: user.id } : {}) },
      include: { user: { select: { name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    }),
  ])
  const size = r.ms / r.buckets
  const buckets = Array.from({ length: r.buckets }, (_, i) => ({ at: now - r.ms + i * size, n: 0 }))
  for (const x of requests) {
    const i = Math.min(r.buckets - 1, Math.floor((x.createdAt.getTime() - (now - r.ms)) / size))
    if (i >= 0) buckets[i].n++
  }
  const max = Math.max(1, ...buckets.map((b) => b.n))
  const byTool = new Map<string, number>()
  for (const x of requests) if (x.tool) byTool.set(x.tool, (byTool.get(x.tool) ?? 0) + 1)
  const failed = requests.filter((x) => !x.ok).length

  const url = `${appUrl()}/api/mcp`
  const apps = tokens.filter((t) => t.kind === 'OAUTH')
  const personal = tokens.filter((t) => t.kind === 'PERSONAL')

  return (
    <div className="space-y-6">
      <div className="max-w-3xl">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Bot size={22} /> AI assistants (MCP)
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Work with Khma from Claude, ChatGPT, Cursor, VS Code or Codex: “How did last week go?”, “Plan November for more leads”, “Write
          three posts like our best reel”. They act as you, in <b className="font-medium text-zinc-700">{workspace.name}</b>.
        </p>
      </div>

      <section className="rounded-2xl border border-zinc-200 p-5">
        <div className="flex flex-wrap items-start gap-3">
          <div className="mr-auto">
            <h2 className="font-semibold">Usage</h2>
            <p className="text-sm text-zinc-500">MCP requests for this workspace.</p>
          </div>
          <nav className="flex rounded-lg bg-zinc-100 p-1 text-sm" aria-label="Range">
            {(Object.keys(RANGES) as (keyof typeof RANGES)[]).map((k) => (
              <Link
                key={k}
                href={`/app/mcp?range=${k}`}
                aria-current={k === range ? 'page' : undefined}
                className={`rounded-md px-3 py-1 font-medium ${k === range ? 'bg-white shadow-sm' : 'text-zinc-500'}`}
              >
                {RANGES[k].label}
              </Link>
            ))}
          </nav>
        </div>
        <p className="mt-3 text-3xl font-semibold tabular-nums" data-testid="mcp-total">
          {requests.length}
          {failed > 0 && <span className="ml-2 text-sm font-normal text-red-600">{failed} failed</span>}
        </p>
        <div className="mt-3 flex h-28 items-end gap-1" role="img" aria-label="Requests over time">
          {buckets.map((b, i) => (
            <span key={i} title={`${b.n} requests`} className="flex-1 rounded-t bg-indigo-400" style={{ height: `${Math.max(2, (b.n / max) * 100)}%`, opacity: b.n ? 1 : 0.2 }} />
          ))}
        </div>
        {byTool.size > 0 && (
          <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
            {[...byTool.entries()]
              .sort((a, b) => b[1] - a[1])
              .slice(0, 8)
              .map(([t, n]) => (
                <span key={t}>
                  {t} <b className="text-zinc-800">{n}</b>
                </span>
              ))}
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-zinc-200 p-5">
        <h2 className="flex items-center gap-2 font-semibold">
          <Plug size={17} className="text-zinc-500" /> Connect
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          Server URL <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-zinc-800">{url}</code>. Apps that support sign-in open Khma in your
          browser — you pick the company and press Allow. For the others, create a personal token below.
        </p>
        <CodeBlock
          tabs={[
            { label: 'Claude Code', code: `claude mcp add --transport http khma ${url}\n# then run /mcp in Claude Code and choose "Authenticate"` },
            {
              label: 'Claude Desktop / Web',
              code: `Settings → Connectors → Add custom connector\nName: Khma\nURL:  ${url}\nThen press Connect and allow access in the Khma window.`,
            },
            {
              label: 'ChatGPT',
              code: `Settings → Apps & Connectors → Advanced → Developer mode on\nCreate → Name: Khma, MCP server URL: ${url}\nAuthentication: OAuth → Create, then sign in to Khma.`,
            },
            {
              label: 'Codex',
              code: `# ~/.codex/config.toml\n[mcp_servers.khma]\nurl = "${url}"\nbearer_token_env_var = "KHMA_TOKEN"\n\n# then: export KHMA_TOKEN=khma_pat_…  (a personal token)`,
            },
            { label: 'Cursor', code: JSON.stringify({ mcpServers: { khma: { url } } }, null, 2) + '\n// ~/.cursor/mcp.json — Cursor asks you to sign in' },
            { label: 'VS Code', code: JSON.stringify({ servers: { khma: { type: 'http', url } } }, null, 2) + '\n// .vscode/mcp.json — VS Code asks you to sign in' },
            {
              label: 'JSON with token',
              code: JSON.stringify({ mcpServers: { khma: { type: 'http', url, headers: { Authorization: 'Bearer khma_pat_…' } } } }, null, 2),
            },
          ]}
        />
        <details className="text-sm">
          <summary className="cursor-pointer font-medium">What assistants can do ({TOOLS.length} tools)</summary>
          <ul className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
            {TOOLS.map((t) => (
              <li key={t.name} className="text-zinc-600">
                <code className="text-xs text-zinc-800">{t.name}</code> — {t.title}
              </li>
            ))}
          </ul>
        </details>
      </section>

      <section className="rounded-2xl border border-zinc-200 p-5">
        <h2 className="font-semibold">Connected apps</h2>
        {apps.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">None yet. Apps you allow through sign-in appear here.</p>
        ) : (
          <ul className="mt-3 divide-y divide-zinc-100">
            {apps.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                <span className="min-w-0 flex-1">
                  <b className="font-medium">{t.name}</b>
                  <span className="block text-xs text-zinc-500">
                    {t.user.name || t.user.email} · connected <LocalTime iso={t.createdAt.toISOString()} options={{ day: 'numeric', month: 'short' }} />
                    {t.lastUsedAt && (
                      <>
                        {' '}
                        · last used <LocalTime iso={t.lastUsedAt.toISOString()} options={{ day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }} />
                      </>
                    )}
                  </span>
                </span>
                <RevokeButton id={t.id} label={t.name} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-zinc-200 p-5">
        <h2 className="flex items-center gap-2 font-semibold">
          <KeyRound size={17} className="text-zinc-500" /> Personal tokens
        </h2>
        <p className="mt-1 mb-4 text-sm text-zinc-500">For Codex, scripts and apps without sign-in. A token acts as you in this workspace — keep it secret.</p>
        <NewToken />
        {personal.length > 0 && (
          <ul className="mt-4 divide-y divide-zinc-100 rounded-xl border border-zinc-200">
            {personal.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-sm">
                <span className="min-w-0 flex-1">
                  <b className="font-medium">{t.name}</b> <code className="text-xs text-zinc-400">{t.prefix}…</code>
                  <span className="block text-xs text-zinc-500">
                    {t.user.name || t.user.email} · {t.lastUsedAt ? 'last used ' : 'never used'}
                    {t.lastUsedAt && <LocalTime iso={t.lastUsedAt.toISOString()} options={{ day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }} />}
                  </span>
                </span>
                <RevokeButton id={t.id} label={t.name} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
