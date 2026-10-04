// Draws a scene's on-screen text (transparent PNG over the footage) and the
// end card, in the browser. The renderer lays these PNGs over the video, so
// the editor preview and the final MP4 look the same.

import { FORMATS, type Format, type Scene } from './video'

export type OverlayBrand = { name: string; colors: string[]; logoUrl: string | null }

const FONT = 'Inter, "Helvetica Neue", Arial, sans-serif'

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const lines: string[] = []
  for (const para of text.split('\n')) {
    let line = ''
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word
      if (ctx.measureText(next).width > maxWidth && line) {
        lines.push(line)
        line = word
      } else line = next
    }
    if (line) lines.push(line)
  }
  return lines.slice(0, 8)
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
  ctx.fill()
}

// Readable text on a light or dark brand colour.
const inkOn = (hex: string) => {
  const n = parseInt(hex.slice(1), 16)
  const l = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
  return l > 0.6 ? '#111111' : '#ffffff'
}

export function drawOverlay(scene: Pick<Scene, 'text' | 'position' | 'style'>, format: Format, brand: OverlayBrand): HTMLCanvasElement {
  const { w, h } = FORMATS[format]
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!
  const text = scene.text.trim()
  if (!text) return c

  const base = Math.min(w, h)
  const size = { bold: base * 0.085, box: base * 0.065, caption: base * 0.05, minimal: base * 0.055 }[scene.style]
  const weight = scene.style === 'caption' ? 600 : 800
  ctx.font = `${weight} ${size}px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const lines = wrap(ctx, text, w * 0.82)
  const lh = size * 1.18
  const block = lines.length * lh
  // Reels cover the bottom fifth with buttons and the caption: stay above it.
  const cy = scene.position === 'top' ? h * 0.14 + block / 2 : scene.position === 'center' ? h / 2 : h * (h > w ? 0.72 : 0.8) - block / 2
  const top = cy - block / 2

  const accent = brand.colors[0] ?? '#ff2e63'
  if (scene.style === 'box' || scene.style === 'caption' || scene.style === 'minimal') {
    const pad = size * (scene.style === 'caption' ? 0.45 : 0.55)
    const widest = Math.max(...lines.map((l) => ctx.measureText(l).width))
    ctx.fillStyle = scene.style === 'box' ? accent : scene.style === 'caption' ? 'rgba(0,0,0,0.62)' : 'rgba(255,255,255,0.94)'
    roundRect(ctx, w / 2 - widest / 2 - pad, top - pad * 0.7, widest + pad * 2, block + pad * 1.4, size * 0.35)
  }
  ctx.fillStyle = scene.style === 'box' ? inkOn(accent) : scene.style === 'minimal' ? '#111111' : '#ffffff'
  if (scene.style === 'bold') {
    ctx.shadowColor = 'rgba(0,0,0,0.55)'
    ctx.shadowBlur = size * 0.35
    ctx.shadowOffsetY = size * 0.06
  }
  lines.forEach((l, i) => ctx.fillText(l, w / 2, top + lh * (i + 0.5)))
  return c
}

const loadImage = (url: string) =>
  new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = url
  })

export async function drawEndCard(format: Format, brand: OverlayBrand): Promise<HTMLCanvasElement> {
  const { w, h } = FORMATS[format]
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!
  const bg = brand.colors[0] ?? '#111827'
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, w, h)
  const ink = inkOn(bg)
  const base = Math.min(w, h)
  const logo = brand.logoUrl ? await loadImage(brand.logoUrl) : null
  let y = h / 2
  if (logo) {
    const box = base * 0.32
    const s = Math.min(box / logo.width, box / logo.height)
    const lw = logo.width * s
    const lh = logo.height * s
    // A white plate keeps dark logos visible on dark brand colours.
    ctx.fillStyle = 'rgba(255,255,255,0.96)'
    roundRect(ctx, w / 2 - box / 2 - base * 0.04, h / 2 - box / 2 - base * 0.1, box + base * 0.08, box + base * 0.08, base * 0.05)
    ctx.drawImage(logo, w / 2 - lw / 2, h / 2 - base * 0.06 - lh / 2, lw, lh)
    y = h / 2 + box / 2 + base * 0.08
  }
  ctx.fillStyle = ink
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `800 ${base * 0.075}px ${FONT}`
  ctx.fillText(brand.name, w / 2, y, w * 0.86)
  return c
}

export const toPngBase64 = (c: HTMLCanvasElement) => c.toDataURL('image/png').split(',')[1]
