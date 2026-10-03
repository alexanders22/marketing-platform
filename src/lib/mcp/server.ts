import 'server-only'
import { z } from 'zod'
import { authenticate, type Caller } from '../access-tokens'
import { appUrl } from '../mail'
import { prisma } from '../prisma'
import { TOOLS, ToolError, toolList } from './tools'

// A stateless MCP server over Streamable HTTP: every POST carries one
// JSON-RPC message and gets a JSON answer — no sessions, no SSE.

const VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05']

const INSTRUCTIONS = `Khma is an AI marketing agency platform for one company (the workspace this token belongs to).
Start with get_overview, then get_dossier to learn what the company sells and what worked before.
Posts saved with create_post / write_post_with_ai are Planner drafts unless schedule=true; publish_post publishes immediately.
Ad campaigns are read-only here (results via get_analytics). Goals and alerts are checked hourly; the weekly review arrives on Mondays.
Ask the user before spending credits (write_post_with_ai, create_plan) or publishing.`

type Rpc = { jsonrpc: '2.0'; id?: string | number | null; method: string; params?: Record<string, unknown> }

const rpcError = (id: Rpc['id'], code: number, message: string) => ({ jsonrpc: '2.0' as const, id: id ?? null, error: { code, message } })
const rpcResult = (id: Rpc['id'], result: unknown) => ({ jsonrpc: '2.0' as const, id: id ?? null, result })

// 120 calls a minute per token.
const windowStart = new Map<string, { at: number; n: number }>()
function limited(tokenId: string) {
  const now = Date.now()
  const w = windowStart.get(tokenId)
  if (!w || now - w.at > 60_000) {
    windowStart.set(tokenId, { at: now, n: 1 })
    return false
  }
  w.n++
  return w.n > 120
}

export const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type, mcp-protocol-version, mcp-session-id',
  'access-control-expose-headers': 'www-authenticate, mcp-session-id',
}

export function unauthorized() {
  return new Response(JSON.stringify(rpcError(null, -32001, 'Sign in to Khma: missing or invalid token')), {
    status: 401,
    headers: {
      ...CORS,
      'content-type': 'application/json',
      'www-authenticate': `Bearer realm="khma", resource_metadata="${appUrl()}/.well-known/oauth-protected-resource"`,
    },
  })
}

async function handle(c: NonNullable<Caller>, msg: Rpc) {
  switch (msg.method) {
    case 'initialize': {
      const asked = String(msg.params?.protocolVersion ?? '')
      return rpcResult(msg.id, {
        protocolVersion: VERSIONS.includes(asked) ? asked : VERSIONS[1],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'khma', title: 'Khma', version: '1.0.0' },
        instructions: `${INSTRUCTIONS}\nWorkspace: ${c.workspace.name}.`,
      })
    }
    case 'ping':
      return rpcResult(msg.id, {})
    case 'tools/list':
      return rpcResult(msg.id, { tools: toolList() })
    case 'tools/call': {
      const name = String(msg.params?.name ?? '')
      const t = TOOLS.find((x) => x.name === name)
      if (!t) return rpcError(msg.id, -32602, `Unknown tool: ${name}`)
      const parsed = (t.input as z.ZodType).safeParse(msg.params?.arguments ?? {})
      if (!parsed.success) {
        return rpcResult(msg.id, { isError: true, content: [{ type: 'text', text: `Invalid arguments: ${parsed.error.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ')}` }] })
      }
      try {
        const out = await (t.run as (c: NonNullable<Caller>, a: unknown) => Promise<unknown>)(c, parsed.data)
        const structured = out && typeof out === 'object' && !Array.isArray(out) ? (out as Record<string, unknown>) : { result: out }
        return rpcResult(msg.id, { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }], structuredContent: structured })
      } catch (e) {
        if (!(e instanceof ToolError)) console.error('mcp tool failed', name, e)
        const text = e instanceof ToolError ? e.message : 'Something went wrong in Khma — please try again.'
        return rpcResult(msg.id, { isError: true, content: [{ type: 'text', text }] })
      }
    }
    default:
      return rpcError(msg.id, -32601, `Method not found: ${msg.method}`)
  }
}

export async function mcpPost(req: Request) {
  const caller = await authenticate(req)
  if (!caller) return unauthorized()
  if (limited(caller.token.id)) {
    return Response.json(rpcError(null, -32000, 'Too many requests — slow down a little.'), { status: 429, headers: CORS })
  }
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return Response.json(rpcError(null, -32700, 'Parse error'), { status: 400, headers: CORS })
  }
  const messages = (Array.isArray(body) ? body : [body]) as Rpc[]
  const out = []
  for (const m of messages) {
    if (!m || m.jsonrpc !== '2.0' || typeof m.method !== 'string') {
      out.push(rpcError(null, -32600, 'Invalid request'))
      continue
    }
    // Notifications (no id) get no answer.
    if (m.id === undefined) continue
    const started = Date.now()
    const res = await handle(caller, m)
    const ok = !('error' in res) && !(res.result as { isError?: boolean })?.isError
    if (m.method !== 'ping') {
      prisma.mcpRequest
        .create({
          data: {
            workspaceId: caller.workspace.id,
            tokenId: caller.token.id,
            method: m.method,
            tool: m.method === 'tools/call' ? String(m.params?.name ?? '').slice(0, 60) : null,
            ok,
            ms: Date.now() - started,
          },
        })
        .catch(() => {})
    }
    out.push(res)
  }
  if (out.length === 0) return new Response(null, { status: 202, headers: CORS })
  return Response.json(Array.isArray(body) ? out : out[0], { headers: CORS })
}
