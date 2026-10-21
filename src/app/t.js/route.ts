import { TAG_SCRIPT } from '@/lib/tag-script'

// The Loudpilot Tag. Cached for an hour by browsers and CDNs.
export function GET() {
  return new Response(TAG_SCRIPT, {
    headers: { 'content-type': 'application/javascript; charset=utf-8', 'cache-control': 'public, max-age=3600', 'access-control-allow-origin': '*' },
  })
}
