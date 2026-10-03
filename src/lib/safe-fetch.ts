import 'server-only'
import { lookup as dnsLookup, type LookupAddress } from 'node:dns'
import { isIP } from 'node:net'
import { Agent, fetch as undiciFetch } from 'undici'

// Fetches a user-supplied URL without letting it reach our own network:
// only http(s), public unicast addresses only, size and time limits.
//
// Two layers:
//  1. IP literals in the URL are checked before connecting.
//  2. Host names are resolved by our own `lookup`, which rejects private
//     addresses — and the socket connects to exactly the address that was
//     checked, so DNS rebinding between "check" and "connect" can't work.

function v4Private(ip: string): boolean {
  const p = ip.split('.').map(Number)
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true
  const [a, b, c] = p
  return (
    a === 0 || // "this" network
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // link-local / cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) || // IETF / TEST-NET-1
    (a === 192 && b === 88 && c === 99) || // 6to4 relay
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    (a === 198 && b === 51 && c === 100) || // TEST-NET-2
    (a === 203 && b === 0 && c === 113) || // TEST-NET-3
    a >= 224 // multicast + reserved + broadcast
  )
}

// Expand an IPv6 string to 8 hextets (handles "::" and a trailing dotted IPv4).
function v6Hextets(ip: string): number[] | null {
  let s = ip.toLowerCase().split('%')[0]
  const dotted = s.match(/(\d+\.\d+\.\d+\.\d+)$/)
  if (dotted) {
    const [a, b, c, d] = dotted[1].split('.').map(Number)
    s = s.slice(0, -dotted[1].length) + `${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`
  }
  const [head, tail] = s.split('::')
  const parse = (x: string) => (x ? x.split(':').map((h) => parseInt(h, 16)) : [])
  const h = parse(head)
  const t = tail === undefined ? [] : parse(tail)
  const fill = tail === undefined ? 0 : 8 - h.length - t.length
  const out = [...h, ...Array(Math.max(0, fill)).fill(0), ...t]
  return out.length === 8 && out.every((n) => Number.isInteger(n) && n >= 0 && n <= 0xffff) ? out : null
}

const v4From = (hi: number, lo: number) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`

export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) return v4Private(ip)
  if (isIP(ip) !== 6) return true
  const h = v6Hextets(ip)
  if (!h) return true
  const zeros = (n: number) => h.slice(0, n).every((x) => x === 0)
  if (zeros(8)) return true // ::
  if (zeros(7) && h[7] === 1) return true // ::1
  // Embedded IPv4: mapped ::ffff:0:0/96, compatible ::/96, NAT64 64:ff9b::/96, 6to4 2002::/16.
  if (zeros(5) && h[5] === 0xffff) return v4Private(v4From(h[6], h[7]))
  if (zeros(6)) return v4Private(v4From(h[6], h[7]))
  if (h[0] === 0x64 && h[1] === 0xff9b && h.slice(2, 6).every((x) => x === 0)) return v4Private(v4From(h[6], h[7]))
  if (h[0] === 0x2002) return v4Private(v4From(h[1], h[2]))
  if ((h[0] & 0xfe00) === 0xfc00) return true // unique local fc00::/7
  if ((h[0] & 0xffc0) === 0xfe80) return true // link-local
  if ((h[0] & 0xff00) === 0xff00) return true // multicast
  if (h[0] === 0x2001 && h[1] === 0x0db8) return true // documentation
  return false
}

type LookupCb = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void

// DNS lookup used by the socket itself: refuse if any resolved address is private.
function guardedLookup(hostname: string, options: object, cb: LookupCb) {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return cb(err, [])
    const list = addresses as LookupAddress[]
    if (list.length === 0 || list.some((a) => isPrivateAddress(a.address))) {
      return cb(Object.assign(new Error('This address is not allowed'), { code: 'EBLOCKED' }), [])
    }
    const wantsAll = (options as { all?: boolean }).all
    if (wantsAll) cb(null, list)
    else cb(null, list[0].address, list[0].family)
  })
}

const agent = new Agent({ connect: { lookup: guardedLookup as never }, headersTimeout: 8000, bodyTimeout: 8000 })

function assertUrl(url: URL) {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Only http and https links are supported')
  if (url.username || url.password) throw new Error('Links with credentials are not supported')
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (isIP(host) && isPrivateAddress(host)) throw new Error('This address is not allowed')
}

export async function safeFetchText(
  input: string,
  { maxBytes = 1_500_000, timeoutMs = 8000, accept = 'text/html,*/*' } = {},
): Promise<{ url: string; text: string }> {
  let url = new URL(input)
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    for (let hop = 0; hop < 4; hop++) {
      assertUrl(url)
      const res = await undiciFetch(url, {
        redirect: 'manual',
        signal: ctrl.signal,
        dispatcher: agent,
        headers: { 'user-agent': 'LoudpilotBot/1.0 (+https://loudpilot.app)', accept },
      })
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        await res.body?.cancel()
        url = new URL(res.headers.get('location')!, url)
        continue
      }
      if (!res.ok) throw new Error(`The site answered ${res.status}`)
      const reader = res.body?.getReader()
      if (!reader) return { url: url.toString(), text: '' }
      const chunks: Uint8Array[] = []
      let size = 0
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > maxBytes) {
          await reader.cancel()
          break
        }
        chunks.push(value)
      }
      return { url: url.toString(), text: Buffer.concat(chunks).toString('utf8') }
    }
    throw new Error('Too many redirects')
  } finally {
    clearTimeout(timer)
  }
}
