import { WIDGET_SCRIPT } from '@/lib/tag-script'

// The chat widget, loaded by /t.js when the site's assistant is on.
export function GET() {
  return new Response(WIDGET_SCRIPT, {
    headers: { 'content-type': 'application/javascript; charset=utf-8', 'cache-control': 'public, max-age=3600', 'access-control-allow-origin': '*' },
  })
}
