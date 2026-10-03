import { CORS, mcpPost } from '@/lib/mcp/server'

// Loudpilot MCP server (Streamable HTTP, stateless). See /app/mcp for setup.
export const POST = mcpPost

// No server-initiated stream: every answer comes with its request.
export const GET = () => new Response('Method Not Allowed', { status: 405, headers: { ...CORS, allow: 'POST' } })
export const DELETE = () => new Response(null, { status: 405, headers: { ...CORS, allow: 'POST' } })
export const OPTIONS = () => new Response(null, { status: 204, headers: CORS })
