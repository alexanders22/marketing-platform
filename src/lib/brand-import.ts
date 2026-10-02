import 'server-only'
import { parse } from 'node-html-parser'
import { safeFetchText } from './safe-fetch'

export type ImportedBrand = {
  name: string
  website: string
  description: string
  logoUrl: string | null
  colors: string[]
  socialLinks: string[]
}

const SOCIAL_HOSTS = [
  'facebook.com',
  'instagram.com',
  'x.com',
  'twitter.com',
  'linkedin.com',
  'tiktok.com',
  'youtube.com',
  't.me',
  'pinterest.com',
  'threads.net',
]

// Colours that say nothing about a brand.
const isNeutral = (hex: string) => {
  const n = parseInt(hex.slice(1), 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const light = (max + min) / 2
  return light > 235 || (max - min < 18 && light > 40 && light < 235)
}

const isDark = (hex: string) => {
  const n = parseInt(hex.slice(1), 16)
  return Math.max((n >> 16) & 255, (n >> 8) & 255, n & 255) < 60
}

const normHex = (raw: string) => {
  let h = raw.toLowerCase()
  if (h.length === 4) h = `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}`
  return h.length === 7 ? h : null
}

function topColors(css: string, themeColor: string | null) {
  const counts = new Map<string, number>()
  for (const m of css.matchAll(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g)) {
    const h = normHex(m[0])
    if (h && !isNeutral(h)) counts.set(h, (counts.get(h) ?? 0) + 1)
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([h]) => h)
  const theme = themeColor ? normHex(themeColor.trim()) : null
  const list = theme && !isNeutral(theme) ? [theme, ...ranked.filter((h) => h !== theme)] : ranked
  // Near-black shades are interchangeable — keep only the first one.
  let darkSeen = false
  return list
    .filter((h) => {
      if (!isDark(h)) return true
      if (darkSeen) return false
      darkSeen = true
      return true
    })
    .slice(0, 4)
}

export async function importBrandFromWebsite(input: string): Promise<ImportedBrand> {
  const withScheme = /^https?:\/\//i.test(input.trim()) ? input.trim() : `https://${input.trim()}`
  const { url, text } = await safeFetchText(withScheme)
  const root = parse(text)
  const base = new URL(url)
  const abs = (href?: string | null) => {
    if (!href) return null
    try {
      return new URL(href, base).toString()
    } catch {
      return null
    }
  }
  const meta = (sel: string) => root.querySelector(sel)?.getAttribute('content')?.trim() || null

  const title = root.querySelector('title')?.text.trim() ?? ''
  const name =
    meta('meta[property="og:site_name"]') ||
    title.split(/\s[|–—-]\s/)[0]?.trim() ||
    base.hostname.replace(/^www\./, '')

  const description =
    meta('meta[name="description"]') || meta('meta[property="og:description"]') || ''

  // Prefer a large touch icon, then an <img> that calls itself a logo, then og:image.
  const touch = root.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href')
  const logoImg = root
    .querySelectorAll('img')
    .find((i) => /logo/i.test(`${i.getAttribute('src')} ${i.getAttribute('alt')} ${i.getAttribute('class')}`))
    ?.getAttribute('src')
  const icon = root
    .querySelectorAll('link')
    .find((l) => /icon/i.test(l.getAttribute('rel') ?? ''))
    ?.getAttribute('href')
  const logoUrl = abs(touch) ?? abs(logoImg) ?? abs(icon) ?? abs(meta('meta[property="og:image"]'))

  // Colours from inline styles plus the first two stylesheets.
  let css = root.querySelectorAll('style').map((s) => s.text).join('\n') + text.slice(0, 200_000)
  const sheets = root
    .querySelectorAll('link[rel="stylesheet"]')
    .map((l) => abs(l.getAttribute('href')))
    .filter((h): h is string => Boolean(h))
    .slice(0, 2)
  for (const href of sheets) {
    try {
      css += (await safeFetchText(href, { maxBytes: 800_000, timeoutMs: 5000, accept: 'text/css,*/*' })).text
    } catch {
      // A stylesheet we cannot read just means fewer colour hints.
    }
  }
  const colors = topColors(css, meta('meta[name="theme-color"]'))

  const socialLinks = [
    ...new Set(
      root
        .querySelectorAll('a[href]')
        .map((a) => abs(a.getAttribute('href')))
        .filter((h): h is string => {
          if (!h) return false
          try {
            const host = new URL(h).hostname.replace(/^www\./, '')
            return SOCIAL_HOSTS.some((s) => host === s || host.endsWith(`.${s}`))
          } catch {
            return false
          }
        })
        .map((h) => h.replace(/\/$/, '')),
    ),
  ].slice(0, 8)

  return {
    name: name.slice(0, 120),
    website: `${base.protocol}//${base.host}/`,
    description: description.slice(0, 2000),
    logoUrl,
    colors,
    socialLinks,
  }
}
