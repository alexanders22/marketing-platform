import 'server-only'
import { isIP } from 'node:net'

// The visitor's IP as our reverse proxy saw it — for rate limits and the IP
// we store or pass on (Meta's CAPI, Monrem).
//
// X-Forwarded-For is "client, proxy1, proxy2…": every proxy APPENDS the
// address it got the request from, and whatever the client sent comes
// first. So the leftmost entry is the client's to choose; only the entries
// our own proxies added can be trusted — the Nth from the right with N
// proxies in front of the app (KHMA_TRUSTED_PROXIES, default 1: nginx →
// Node). X-Real-IP, when our proxy sets it ($remote_addr), wins.
//
// Without a proxy (local dev, e2e) Next.js fills X-Forwarded-For with the
// socket address when the request has none.
export function clientIp(headers: Pick<Headers, 'get'>): string | null {
  const real = valid(headers.get('x-real-ip'))
  if (real) return real
  const list = (headers.get('x-forwarded-for') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (!list.length) return null
  return valid(list[Math.max(0, list.length - trustedHops())])
}

function trustedHops() {
  const n = Number(process.env.KHMA_TRUSTED_PROXIES ?? 1)
  return Number.isInteger(n) && n >= 1 && n <= 10 ? n : 1
}

// An IP address ("[::1]" and "1.2.3.4:5678" forms unwrapped), else null.
function valid(raw: string | null | undefined): string | null {
  let s = (raw ?? '').trim()
  if (!s) return null
  const bracket = /^\[([^\]]+)\](?::\d+)?$/.exec(s)
  if (bracket) s = bracket[1]
  else if (/^\d+\.\d+\.\d+\.\d+:\d+$/.test(s)) s = s.slice(0, s.lastIndexOf(':'))
  return isIP(s) ? s : null
}
