import { CORS } from '@/lib/mcp/server'
import { resourceMetadata } from '@/lib/oauth'

// RFC 9728: where to sign in for the MCP server (also at …/api/mcp).
export const GET = () => Response.json(resourceMetadata(), { headers: CORS })
export const OPTIONS = () => new Response(null, { status: 204, headers: CORS })
