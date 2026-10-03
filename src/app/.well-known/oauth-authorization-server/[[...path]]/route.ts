import { CORS } from '@/lib/mcp/server'
import { metadata } from '@/lib/oauth'

// RFC 8414 authorization server metadata.
export const GET = () => Response.json(metadata(), { headers: CORS })
export const OPTIONS = () => new Response(null, { status: 204, headers: CORS })
