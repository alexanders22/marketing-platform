import 'server-only'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

// Fetches a user-supplied URL without letting it reach our own network:
// only http(s), public IPs only (checked on every redirect hop), size and
// time limits.

function isPrivate(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase()
    if (v === '::1' || v === '::') return true
    if (v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80')) return true
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    return mapped ? isPrivate(mapped[1]) : false
  }
  const [a, b] = ip.split('.').map(Number)
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  )
}

async function assertPublic(url: URL) {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Only http and https links are supported')
  const host = url.hostname.replace(/^\[|\]$/g, '')
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true })
  if (addrs.length === 0 || addrs.some((a) => isPrivate(a.address))) throw new Error('This address is not allowed')
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
      await assertPublic(url)
      const res = await fetch(url, {
        redirect: 'manual',
        signal: ctrl.signal,
        headers: { 'user-agent': 'KhmaBot/1.0 (+https://khma.brandrepublic.ge)', accept },
      })
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
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
