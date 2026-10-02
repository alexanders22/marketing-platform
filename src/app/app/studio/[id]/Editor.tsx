'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Circle,
  Copy,
  Download,
  Image as ImageIcon,
  LayoutTemplate,
  Loader2,
  Palette,
  Redo2,
  Send,
  Shapes,
  Square,
  Trash2,
  Type,
  Undo2,
} from 'lucide-react'
import { LayerView, layerStyle } from '@/components/DesignCanvas'
import { MediaPicker } from '@/components/MediaPicker'
import {
  FONTS,
  palette,
  renderToCanvas,
  resizeDoc,
  SIZES,
  TEMPLATES,
  uid,
  type DesignDoc,
  type ImageLayer,
  type Layer,
  type ShapeLayer,
  type TextLayer,
} from '@/lib/design'
import { exportDesign, saveDesign } from '../actions'

type Brand = { name: string; colors: string[]; logoUrl: string | null }
type Drag = { id: string; mode: 'move' | 'nw' | 'ne' | 'sw' | 'se'; px: number; py: number; orig: Layer }

export function Editor({
  design,
  brand,
}: {
  design: { id: string; name: string; width: number; height: number; data: DesignDoc }
  brand: Brand
}) {
  const router = useRouter()
  const [doc, setDoc] = useState<DesignDoc>(design.data)
  const [size, setSize] = useState({ w: design.width, h: design.height })
  const [name, setName] = useState(design.name)
  const [sel, setSel] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [tab, setTab] = useState<'templates' | 'elements' | 'images' | 'brand'>('elements')
  const [picker, setPicker] = useState(false)
  const [scale, setScale] = useState(0.5)
  const [status, setStatus] = useState<'saved' | 'dirty' | 'saving' | 'error'>('saved')
  const [busy, setBusy] = useState<'download' | 'post' | null>(null)
  const [error, setError] = useState<string>()
  const history = useRef<{ past: DesignDoc[]; future: DesignDoc[] }>({ past: [], future: [] })
  // Latest doc for event handlers; history is kept outside state updaters
  // (React may run updaters twice in development).
  const docRef = useRef(doc)
  const setDocNow = useCallback((d: DesignDoc) => {
    docRef.current = d
    setDoc(d)
  }, [])
  const drag = useRef<Drag | null>(null)
  const stage = useRef<HTMLDivElement>(null)
  const pal = palette(brand.colors)
  const swatches = [...new Set([...brand.colors, '#FFFFFF', '#111111', '#6B7280'])]

  const selected = doc.layers.find((l) => l.id === sel) ?? null

  // ─── Document changes with undo ────────────────────────────────────────
  const commit = useCallback(
    (next: DesignDoc | ((d: DesignDoc) => DesignDoc)) => {
      const cur = docRef.current
      history.current.past = [...history.current.past.slice(-49), cur]
      history.current.future = []
      setDocNow(typeof next === 'function' ? next(cur) : next)
      setStatus('dirty')
    },
    [setDocNow],
  )

  const patch = (id: string, p: Partial<Layer>) =>
    commit((d) => ({ ...d, layers: d.layers.map((l) => (l.id === id ? ({ ...l, ...p } as Layer) : l)) }))

  const undo = useCallback(() => {
    const h = history.current
    if (!h.past.length) return
    h.future = [docRef.current, ...h.future]
    setDocNow(h.past.pop()!)
    setStatus('dirty')
  }, [setDocNow])
  const redo = useCallback(() => {
    const h = history.current
    if (!h.future.length) return
    h.past = [...h.past, docRef.current]
    setDocNow(h.future.shift()!)
    setStatus('dirty')
  }, [setDocNow])

  const remove = useCallback((id: string) => {
    commit((d) => ({ ...d, layers: d.layers.filter((l) => l.id !== id) }))
    setSel(null)
  }, [commit])
  const duplicate = useCallback((id: string) => {
    const nid = uid()
    commit((d) => {
      const l = d.layers.find((x) => x.id === id)
      return l ? { ...d, layers: [...d.layers, { ...l, id: nid, name: `${l.name} copy`, x: l.x + 30, y: l.y + 30 } as Layer] } : d
    })
    setSel(nid)
  }, [commit])
  const reorder = (id: string, dir: 1 | -1) =>
    commit((d) => {
      const i = d.layers.findIndex((l) => l.id === id)
      const j = i + dir
      if (i < 0 || j < 0 || j >= d.layers.length) return d
      const layers = [...d.layers]
      ;[layers[i], layers[j]] = [layers[j], layers[i]]
      return { ...d, layers }
    })

  const add = (l: Layer) => {
    commit((d) => ({ ...d, layers: [...d.layers, l] }))
    setSel(l.id)
  }

  // ─── Autosave ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (status !== 'dirty') return
    const t = setTimeout(async () => {
      setStatus('saving')
      const res = await saveDesign({ id: design.id, name: name.trim() || 'Untitled', width: size.w, height: size.h, data: doc })
      setStatus(res.error ? 'error' : 'saved')
      if (res.error) setError(res.error)
    }, 1200)
    return () => clearTimeout(t)
  }, [status, doc, name, size, design.id])

  // ─── Fit canvas to the stage ──────────────────────────────────────────
  useEffect(() => {
    const el = stage.current
    if (!el) return
    const fit = () => setScale(Math.min((el.clientWidth - 48) / size.w, (el.clientHeight - 48) / size.h, 1))
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [size])

  // ─── Keyboard ─────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'z') {
        if (typing) return
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
        return
      }
      if (typing || !sel) return
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        remove(sel)
      } else if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        duplicate(sel)
      } else if (e.key.startsWith('Arrow')) {
        e.preventDefault()
        const step = e.shiftKey ? 10 : 1
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
        commit((d) => ({ ...d, layers: d.layers.map((l) => (l.id === sel ? { ...l, x: l.x + dx, y: l.y + dy } : l)) }))
      } else if (e.key === 'Escape') setSel(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sel, undo, redo, remove, duplicate, commit])

  // ─── Drag & resize ────────────────────────────────────────────────────
  const startDrag = (e: RPointerEvent, l: Layer, mode: Drag['mode']) => {
    e.stopPropagation()
    if (editing) return
    setSel(l.id)
    drag.current = { id: l.id, mode, px: e.clientX, py: e.clientY, orig: l }
    // One undo step per gesture: snapshot now, then update without history.
    history.current.past = [...history.current.past.slice(-49), docRef.current]
    history.current.future = []
  }

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = drag.current
      if (!d) return
      const dx = (e.clientX - d.px) / scale
      const dy = (e.clientY - d.py) / scale
      const o = d.orig
      let n: Partial<Layer>
      if (d.mode === 'move') n = { x: Math.round(o.x + dx), y: Math.round(o.y + dy) }
      else {
        const left = d.mode === 'nw' || d.mode === 'sw'
        const top = d.mode === 'nw' || d.mode === 'ne'
        const w = Math.max(20, o.w + (left ? -dx : dx))
        const h = Math.max(20, o.h + (top ? -dy : dy))
        n = { w: Math.round(w), h: Math.round(h), x: Math.round(left ? o.x + o.w - w : o.x), y: Math.round(top ? o.y + o.h - h : o.y) }
      }
      const cur = docRef.current
      setDocNow({ ...cur, layers: cur.layers.map((l) => (l.id === d.id ? ({ ...l, ...n } as Layer) : l)) })
      setStatus('dirty')
    }
    const up = () => {
      drag.current = null
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [scale, setDocNow])

  // ─── Export ───────────────────────────────────────────────────────────
  const render = async () => {
    const family = getComputedStyle(document.body).fontFamily
    const canvas = await renderToCanvas(doc, size.w, size.h, family)
    return canvas.toDataURL('image/png')
  }

  const download = async () => {
    setBusy('download')
    try {
      const url = await render()
      const a = document.createElement('a')
      a.href = url
      a.download = `${(name || 'design').replace(/[^\w-]+/g, '-')}.png`
      a.click()
    } finally {
      setBusy(null)
    }
  }

  const toPost = async () => {
    setBusy('post')
    setError(undefined)
    try {
      const url = await render()
      const res = await exportDesign(design.id, url.split(',')[1], true)
      if (res.error) setError(res.error)
      else if (res.postId) router.push(`/app/posts/${res.postId}`)
    } finally {
      setBusy(null)
    }
  }

  // ─── Element factories ────────────────────────────────────────────────
  const cx = (w: number) => Math.round((size.w - w) / 2)
  const textLayer = (kind: 'heading' | 'sub' | 'body'): TextLayer => {
    const fs = { heading: 96, sub: 56, body: 36 }[kind]
    const w = Math.round(size.w * 0.8)
    return {
      id: uid(),
      type: 'text',
      name: kind === 'heading' ? 'Heading' : kind === 'sub' ? 'Subheading' : 'Body text',
      x: cx(w),
      y: Math.round(size.h * 0.4),
      w,
      h: Math.round(fs * 1.4),
      rotation: 0,
      text: kind === 'heading' ? 'Add a heading' : kind === 'sub' ? 'Add a subheading' : 'Add a little bit of body text',
      fontSize: fs,
      fontWeight: kind === 'heading' ? 800 : kind === 'sub' ? 600 : 400,
      fontFamily: 'Inter',
      color: doc.background.toLowerCase() === '#ffffff' ? '#111111' : '#FFFFFF',
      align: 'center',
      lineHeight: 1.15,
    }
  }
  const shapeLayer = (shape: 'rect' | 'ellipse'): ShapeLayer => ({
    id: uid(),
    type: 'shape',
    name: shape === 'rect' ? 'Rectangle' : 'Circle',
    x: cx(400),
    y: Math.round(size.h / 2 - 200),
    w: 400,
    h: 400,
    rotation: 0,
    shape,
    fill: pal.primary,
    radius: shape === 'rect' ? 24 : 0,
    opacity: 1,
  })
  const imageLayer = (mediaId: string, src: string): ImageLayer => {
    const w = Math.round(size.w * 0.6)
    return { id: uid(), type: 'image', name: 'Image', x: cx(w), y: Math.round((size.h - w) / 2), w, h: w, rotation: 0, mediaId, src, fit: 'cover', radius: 0, opacity: 1 }
  }

  return (
    <div className="-m-5 flex h-[calc(100vh-1.5rem)] flex-col sm:-m-8">
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 px-4 py-2.5">
        <Link href="/app/studio" className="grid h-9 w-9 place-items-center rounded-lg hover:bg-zinc-100" aria-label="Back to Studio">
          <ArrowLeft size={18} />
        </Link>
        <input
          value={name}
          onChange={(e) => (setName(e.target.value), setStatus('dirty'))}
          className="w-56 rounded-lg px-2 py-1.5 text-sm font-semibold outline-none hover:bg-zinc-50 focus:ring-2 focus:ring-zinc-200"
          aria-label="Design name"
        />
        <select
          value={SIZES.find((s) => s.w === size.w && s.h === size.h)?.id ?? 'custom'}
          onChange={(e) => {
            const s = SIZES.find((x) => x.id === e.target.value)
            if (!s) return
            commit(resizeDoc(doc, size, s))
            setSize({ w: s.w, h: s.h })
          }}
          className="rounded-lg border border-zinc-200 px-2 py-1.5 text-sm"
          aria-label="Resize design"
        >
          {!SIZES.some((s) => s.w === size.w && s.h === size.h) && <option value="custom">{size.w}×{size.h}</option>}
          {SIZES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} · {s.w}×{s.h}
            </option>
          ))}
        </select>
        <button onClick={undo} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-zinc-100" aria-label="Undo" title="Undo (⌘Z)">
          <Undo2 size={17} />
        </button>
        <button onClick={redo} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-zinc-100" aria-label="Redo" title="Redo (⇧⌘Z)">
          <Redo2 size={17} />
        </button>
        <span className="text-xs text-zinc-500">
          {status === 'saving' ? 'Saving…' : status === 'dirty' ? 'Unsaved changes' : status === 'error' ? 'Not saved' : 'All changes saved'}
        </span>
        <div className="ml-auto flex gap-2">
          <button
            onClick={download}
            disabled={busy !== null}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium hover:bg-zinc-50 disabled:opacity-60"
          >
            {busy === 'download' ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} Download PNG
          </button>
          <button
            onClick={toPost}
            disabled={busy !== null}
            className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
          >
            {busy === 'post' ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Use in post
          </button>
        </div>
      </div>
      {error && <p className="bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}

      <div className="flex min-h-0 flex-1">
        {/* Left panel */}
        <aside className="flex w-64 shrink-0 flex-col border-r border-zinc-200">
          <div className="grid grid-cols-4 border-b border-zinc-200 text-[11px]">
            {(
              [
                ['templates', LayoutTemplate, 'Templates'],
                ['elements', Shapes, 'Elements'],
                ['images', ImageIcon, 'Images'],
                ['brand', Palette, 'Brand'],
              ] as const
            ).map(([id, Icon, label]) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`flex flex-col items-center gap-1 py-2.5 ${tab === id ? 'bg-zinc-100 font-semibold text-zinc-900' : 'text-zinc-500 hover:bg-zinc-50'}`}
              >
                <Icon size={17} />
                {label}
              </button>
            ))}
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto p-3">
            {tab === 'templates' &&
              TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    if (doc.layers.length && !confirm('Replace the current design with this template?')) return
                    commit(resizeDoc(t.build(pal, brand.name), { w: 1080, h: 1080 }, size))
                    setSel(null)
                  }}
                  className="w-full rounded-lg border border-zinc-200 px-3 py-2.5 text-left text-sm hover:border-zinc-400"
                >
                  {t.name}
                </button>
              ))}
            {tab === 'elements' && (
              <>
                <p className="text-xs font-semibold text-zinc-500">TEXT</p>
                <button onClick={() => add(textLayer('heading'))} className="w-full rounded-lg border border-zinc-200 px-3 py-2.5 text-left text-xl font-extrabold hover:border-zinc-400">
                  Add a heading
                </button>
                <button onClick={() => add(textLayer('sub'))} className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-left text-base font-semibold hover:border-zinc-400">
                  Add a subheading
                </button>
                <button onClick={() => add(textLayer('body'))} className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-left text-sm hover:border-zinc-400">
                  Add body text
                </button>
                <p className="pt-2 text-xs font-semibold text-zinc-500">SHAPES</p>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => add(shapeLayer('rect'))} className="grid aspect-square place-items-center rounded-lg border border-zinc-200 hover:border-zinc-400" aria-label="Add rectangle">
                    <Square size={30} className="text-zinc-600" />
                  </button>
                  <button onClick={() => add(shapeLayer('ellipse'))} className="grid aspect-square place-items-center rounded-lg border border-zinc-200 hover:border-zinc-400" aria-label="Add circle">
                    <Circle size={30} className="text-zinc-600" />
                  </button>
                </div>
              </>
            )}
            {tab === 'images' && (
              <>
                <button onClick={() => setPicker(true)} className="w-full rounded-lg bg-zinc-900 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800">
                  Upload or choose image
                </button>
                <p className="text-xs text-zinc-500">AI images from Create, earlier uploads and Studio exports are all in your library.</p>
              </>
            )}
            {tab === 'brand' && (
              <>
                <p className="text-xs font-semibold text-zinc-500">BACKGROUND</p>
                <div className="flex flex-wrap gap-2">
                  {swatches.map((c) => (
                    <button
                      key={c}
                      onClick={() => commit({ ...doc, background: c })}
                      style={{ background: c }}
                      className={`h-9 w-9 rounded-full ring-1 ring-black/10 ${doc.background.toLowerCase() === c.toLowerCase() ? 'outline-2 outline-offset-2 outline-zinc-900' : ''}`}
                      aria-label={`Background ${c}`}
                    />
                  ))}
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="color" value={doc.background} onChange={(e) => commit({ ...doc, background: e.target.value })} className="h-8 w-10" />
                  Custom colour
                </label>
                <p className="pt-2 text-xs font-semibold text-zinc-500">BRAND TEXT</p>
                <button onClick={() => add({ ...textLayer('heading'), text: brand.name, name: 'Brand name' })} className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-left text-sm font-semibold hover:border-zinc-400">
                  {brand.name}
                </button>
              </>
            )}

            <div className="border-t border-zinc-100 pt-3">
              <p className="mb-1 text-xs font-semibold text-zinc-500">LAYERS</p>
              {doc.layers.length === 0 && <p className="text-xs text-zinc-400">No layers yet.</p>}
              {[...doc.layers].reverse().map((l) => (
                <button
                  key={l.id}
                  onClick={() => setSel(l.id)}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs ${sel === l.id ? 'bg-sky-50 text-sky-800' : 'hover:bg-zinc-50'}`}
                >
                  {l.type === 'text' ? <Type size={13} /> : l.type === 'image' ? <ImageIcon size={13} /> : <Square size={13} />}
                  <span className="truncate">{l.type === 'text' ? l.text.slice(0, 30) || l.name : l.name}</span>
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* Stage */}
        <div ref={stage} className="relative grid min-w-0 flex-1 place-items-center overflow-hidden bg-zinc-100" onPointerDown={() => (setSel(null), setEditing(null))}>
          <div className="relative shadow-xl" style={{ width: size.w * scale, height: size.h * scale, background: doc.background }}>
            <div className="absolute inset-0 overflow-hidden">
              {doc.layers.map((l) => (
                <div
                  key={l.id}
                  style={{ ...layerStyle(l, scale), cursor: editing === l.id ? 'text' : 'move' }}
                  onPointerDown={(e) => startDrag(e, l, 'move')}
                  onDoubleClick={() => l.type === 'text' && setEditing(l.id)}
                >
                  {editing === l.id && l.type === 'text' ? (
                    <textarea
                      autoFocus
                      defaultValue={l.text}
                      onPointerDown={(e) => e.stopPropagation()}
                      onBlur={(e) => {
                        patch(l.id, { text: e.target.value })
                        setEditing(null)
                      }}
                      className="h-full w-full resize-none bg-transparent outline-none"
                      style={{
                        color: l.color,
                        fontSize: l.fontSize * scale,
                        fontWeight: l.fontWeight,
                        fontFamily: l.fontFamily === 'Inter' ? 'var(--font-inter), Arial, sans-serif' : l.fontFamily,
                        textAlign: l.align,
                        lineHeight: l.lineHeight,
                      }}
                    />
                  ) : (
                    <LayerView l={l} scale={scale} />
                  )}
                </div>
              ))}
            </div>
            {/* Selection box drawn outside the clip so handles stay visible */}
            {selected && !editing && (
              <div className="pointer-events-none absolute outline-2 outline-sky-500" style={layerStyle(selected, scale)}>
                {(['nw', 'ne', 'sw', 'se'] as const).map((c) => (
                  <span
                    key={c}
                    onPointerDown={(e) => startDrag(e, selected, c)}
                    className="pointer-events-auto absolute h-3 w-3 rounded-sm border-2 border-sky-500 bg-white"
                    style={{
                      left: c.includes('w') ? -6 : undefined,
                      right: c.includes('e') ? -6 : undefined,
                      top: c.includes('n') ? -6 : undefined,
                      bottom: c.includes('s') ? -6 : undefined,
                      cursor: c === 'nw' || c === 'se' ? 'nwse-resize' : 'nesw-resize',
                    }}
                  />
                ))}
              </div>
            )}
          </div>
          <span className="absolute bottom-3 left-3 rounded bg-white/80 px-2 py-0.5 text-xs text-zinc-500">
            {size.w}×{size.h} · {Math.round(scale * 100)}%
          </span>
        </div>

        {/* Right panel */}
        <aside className="hidden w-64 shrink-0 overflow-y-auto border-l border-zinc-200 p-4 md:block">
          {!selected ? (
            <>
              <p className="text-sm font-semibold">Canvas</p>
              <p className="mt-1 text-xs text-zinc-500">Select a layer to edit it. Double-click text to type. Drag corners to resize.</p>
              <Prop label="Background">
                <ColorRow value={doc.background} swatches={swatches} onChange={(c) => commit({ ...doc, background: c })} />
              </Prop>
              <p className="mt-6 text-xs leading-relaxed text-zinc-500">
                Shortcuts: ⌫ delete · ⌘D duplicate · arrows nudge (⇧ ×10) · ⌘Z undo
              </p>
            </>
          ) : (
            <>
              <div className="flex items-center gap-1">
                <p className="mr-auto text-sm font-semibold">{selected.name}</p>
                <IconBtn label="Bring forward" onClick={() => reorder(selected.id, 1)}><ArrowUp size={15} /></IconBtn>
                <IconBtn label="Send backward" onClick={() => reorder(selected.id, -1)}><ArrowDown size={15} /></IconBtn>
                <IconBtn label="Duplicate" onClick={() => duplicate(selected.id)}><Copy size={15} /></IconBtn>
                <IconBtn label="Delete" onClick={() => remove(selected.id)}><Trash2 size={15} className="text-red-600" /></IconBtn>
              </div>

              {selected.type === 'text' && (
                <>
                  <Prop label="Text">
                    <textarea
                      value={selected.text}
                      onChange={(e) => patch(selected.id, { text: e.target.value })}
                      className="min-h-20 w-full rounded-lg border border-zinc-200 p-2 text-sm outline-none focus:border-zinc-400"
                    />
                  </Prop>
                  <Prop label="Font">
                    <select
                      value={selected.fontFamily}
                      onChange={(e) => patch(selected.id, { fontFamily: e.target.value })}
                      className="w-full rounded-lg border border-zinc-200 px-2 py-1.5 text-sm"
                    >
                      {FONTS.map((f) => (
                        <option key={f}>{f}</option>
                      ))}
                    </select>
                  </Prop>
                  <div className="grid grid-cols-2 gap-2">
                    <Prop label="Size">
                      <NumInput value={selected.fontSize} min={4} max={800} onChange={(v) => patch(selected.id, { fontSize: v })} />
                    </Prop>
                    <Prop label="Weight">
                      <select
                        value={selected.fontWeight}
                        onChange={(e) => patch(selected.id, { fontWeight: Number(e.target.value) as 400 | 600 | 800 })}
                        className="w-full rounded-lg border border-zinc-200 px-2 py-1.5 text-sm"
                      >
                        <option value={400}>Regular</option>
                        <option value={600}>Semibold</option>
                        <option value={800}>Bold</option>
                      </select>
                    </Prop>
                  </div>
                  <Prop label="Align">
                    <div className="flex gap-1">
                      {(['left', 'center', 'right'] as const).map((a) => {
                        const I = a === 'left' ? AlignLeft : a === 'center' ? AlignCenter : AlignRight
                        return (
                          <button
                            key={a}
                            onClick={() => patch(selected.id, { align: a })}
                            className={`grid h-8 flex-1 place-items-center rounded-lg border ${selected.align === a ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-200'}`}
                            aria-label={`Align ${a}`}
                          >
                            <I size={15} />
                          </button>
                        )
                      })}
                    </div>
                  </Prop>
                  <Prop label="Line height">
                    <input
                      type="range"
                      min={0.8}
                      max={2}
                      step={0.05}
                      value={selected.lineHeight}
                      onChange={(e) => patch(selected.id, { lineHeight: Number(e.target.value) })}
                      className="w-full"
                    />
                  </Prop>
                  <Prop label="Colour">
                    <ColorRow value={selected.color} swatches={swatches} onChange={(c) => patch(selected.id, { color: c })} />
                  </Prop>
                </>
              )}

              {selected.type === 'shape' && (
                <>
                  <Prop label="Fill">
                    <ColorRow value={selected.fill} swatches={swatches} onChange={(c) => patch(selected.id, { fill: c })} />
                  </Prop>
                  {selected.shape === 'rect' && (
                    <Prop label="Corner radius">
                      <NumInput value={selected.radius} min={0} max={2000} onChange={(v) => patch(selected.id, { radius: v })} />
                    </Prop>
                  )}
                  <Prop label={`Opacity ${Math.round(selected.opacity * 100)}%`}>
                    <input type="range" min={0} max={1} step={0.05} value={selected.opacity} onChange={(e) => patch(selected.id, { opacity: Number(e.target.value) })} className="w-full" />
                  </Prop>
                </>
              )}

              {selected.type === 'image' && (
                <>
                  <Prop label="Fit">
                    <div className="flex gap-1">
                      {(['cover', 'contain'] as const).map((f) => (
                        <button
                          key={f}
                          onClick={() => patch(selected.id, { fit: f })}
                          className={`flex-1 rounded-lg border py-1.5 text-sm capitalize ${selected.fit === f ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-200'}`}
                        >
                          {f === 'cover' ? 'Fill' : 'Fit'}
                        </button>
                      ))}
                    </div>
                  </Prop>
                  <Prop label="Corner radius">
                    <NumInput value={selected.radius} min={0} max={2000} onChange={(v) => patch(selected.id, { radius: v })} />
                  </Prop>
                  <Prop label={`Opacity ${Math.round(selected.opacity * 100)}%`}>
                    <input type="range" min={0} max={1} step={0.05} value={selected.opacity} onChange={(e) => patch(selected.id, { opacity: Number(e.target.value) })} className="w-full" />
                  </Prop>
                </>
              )}

              <Prop label="Position & size">
                <div className="grid grid-cols-2 gap-2">
                  {(['x', 'y', 'w', 'h'] as const).map((k) => (
                    <label key={k} className="flex items-center gap-1.5 text-xs text-zinc-500">
                      {k.toUpperCase()}
                      <NumInput value={Math.round(selected[k])} min={-5000} max={8000} onChange={(v) => patch(selected.id, { [k]: v } as Partial<Layer>)} />
                    </label>
                  ))}
                </div>
              </Prop>
              <Prop label={`Rotation ${selected.rotation}°`}>
                <input type="range" min={-180} max={180} value={selected.rotation} onChange={(e) => patch(selected.id, { rotation: Number(e.target.value) })} className="w-full" />
              </Prop>
            </>
          )}
        </aside>
      </div>

      {picker && (
        <MediaPicker
          max={1}
          onClose={() => setPicker(false)}
          onPick={(items) => items[0] && add(imageLayer(items[0].id, items[0].url))}
        />
      )}
    </div>
  )
}

function Prop({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <p className="mb-1.5 text-xs font-semibold text-zinc-500">{label}</p>
      {children}
    </div>
  )
}

function NumInput({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      onChange={(e) => {
        const v = Number(e.target.value)
        if (Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v)))
      }}
      className="w-full rounded-lg border border-zinc-200 px-2 py-1.5 text-sm outline-none focus:border-zinc-400"
    />
  )
}

function ColorRow({ value, swatches, onChange }: { value: string; swatches: string[]; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {swatches.map((c) => (
        <button
          key={c}
          onClick={() => onChange(c)}
          style={{ background: c }}
          className={`h-7 w-7 rounded-full ring-1 ring-black/10 ${value.toLowerCase() === c.toLowerCase() ? 'outline-2 outline-offset-2 outline-zinc-900' : ''}`}
          aria-label={`Colour ${c}`}
        />
      ))}
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-7 w-9" aria-label="Custom colour" />
    </div>
  )
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} title={label} aria-label={label} className="grid h-7 w-7 place-items-center rounded-md hover:bg-zinc-100">
      {children}
    </button>
  )
}
