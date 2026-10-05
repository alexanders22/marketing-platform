'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, useTransition } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BarChart3,
  CalendarClock,
  Check,
  ChevronRight,
  Copy,
  Download,
  FileText,
  Gift,
  GraduationCap,
  Hash,
  Image as ImageIcon,
  Languages,
  LayoutTemplate,
  Megaphone,
  Mic,
  PartyPopper,
  Plus,
  Rocket,
  Settings,
  Smile,
  Sparkles,
  Star,
  Target,
  Type,
  UserRound,
  X,
  Zap,
  Paperclip,
  Lightbulb,
  Quote,
  ShoppingBag,
} from 'lucide-react'
import { MenuItem, MenuLabel, Popover } from '@/components/ui/Popover'
import { useRouter } from 'next/navigation'
import { savePost } from '../posts/actions'
import { createPost, type CreatedPost } from './actions'
import { HashtagModal, type Library } from './HashtagModal'
import { audienceLine, BriefAssistant } from '@/components/BriefAssistant'
import { creditsLabel } from '@/lib/pricing'
import { usePrices } from '@/components/Prices'

type Tone = 'Professional' | 'Friendly' | 'Educational' | 'Bold' | 'Founder-led'
type Length = 'Short' | 'Medium' | 'Long'
type Language = 'English' | 'Georgian' | 'Russian'

const TONES: { v: Tone; icon: typeof Smile }[] = [
  { v: 'Professional', icon: BarChart3 },
  { v: 'Friendly', icon: Smile },
  { v: 'Educational', icon: GraduationCap },
  { v: 'Bold', icon: Megaphone },
  { v: 'Founder-led', icon: UserRound },
]
const LENGTHS: { v: Length; hint: string }[] = [
  { v: 'Short', hint: 'A line or two — under 200 characters' },
  { v: 'Medium', hint: 'A short paragraph — 300–600 characters' },
  { v: 'Long', hint: 'A story or explainer — up to 1,300 characters' },
]
const LANGS: { v: Language; speech: string }[] = [
  { v: 'English', speech: 'en-US' },
  { v: 'Georgian', speech: 'ka-GE' },
  { v: 'Russian', speech: 'ru-RU' },
]

const SUGGESTIONS = [
  { icon: Rocket, tint: 'bg-violet-50 text-violet-600', title: 'New product launch', body: 'New product launch. Announce the product, name the problem it solves and where to get it.' },
  { icon: Megaphone, tint: 'bg-rose-50 text-rose-600', title: 'Limited-time offer', body: 'Limited-time offer. Say what the deal is and exactly when it ends, with one clear call to action.' },
  { icon: PartyPopper, tint: 'bg-emerald-50 text-emerald-600', title: 'Event invitation', body: 'Event invitation. Invite people in with the date, time and location, and what they will get.' },
  { icon: Lightbulb, tint: 'bg-amber-50 text-amber-600', title: 'Helpful tip', body: 'Share one practical tip our customers can use today, related to what we do.' },
  { icon: Quote, tint: 'bg-sky-50 text-sky-600', title: 'Customer story', body: 'A customer success story: the problem they had, what they chose us for and the result.' },
  { icon: ShoppingBag, tint: 'bg-pink-50 text-pink-600', title: 'Product spotlight', body: 'Spotlight one product or service: who it is for, the key benefit and the price if known.' },
  { icon: Star, tint: 'bg-yellow-50 text-yellow-600', title: 'Behind the scenes', body: 'Behind the scenes of our team or how we make our product — personal and authentic.' },
  { icon: Gift, tint: 'bg-teal-50 text-teal-600', title: 'Giveaway', body: 'A giveaway post: what people can win, how to enter and when the winner is announced.' },
]

type Attachment = { mime: string; data: string; preview: string }

// Downscale to max 1280px JPEG so uploads stay small.
async function toAttachment(file: File): Promise<Attachment> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image()
      i.onload = () => res(i)
      i.onerror = rej
      i.src = url
    })
    const scale = Math.min(1, 1280 / Math.max(img.width, img.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.width * scale)
    canvas.height = Math.round(img.height * scale)
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
    return { mime: 'image/jpeg', data: dataUrl.split(',')[1], preview: dataUrl }
  } finally {
    URL.revokeObjectURL(url)
  }
}

type SpeechRec = {
  lang: string
  interimResults: boolean
  continuous: boolean
  start: () => void
  stop: () => void
  onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void
  onend: () => void
  onerror: () => void
}

export function Composer({ credits, libraries: initialLibs }: { credits: number; libraries: Library[] }) {
  const [prompt, setPrompt] = useState('')
  const [aiHashtags, setAiHashtags] = useState(true)
  const [libraries, setLibraries] = useState(initialLibs)
  const [libIds, setLibIds] = useState<string[]>([])
  const [images, setImages] = useState(0)
  const [tone, setTone] = useState<Tone>('Professional')
  const [length, setLength] = useState<Length>('Medium')
  const [language, setLanguage] = useState<Language>('English')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [modal, setModal] = useState<'create' | 'manage' | null>(null)
  const [result, setResult] = useState<CreatedPost>()
  const [error, setError] = useState<string>()
  const [copied, setCopied] = useState(false)
  const [listening, setListening] = useState(false)
  const [speechOk, setSpeechOk] = useState(false)
  const [pending, start] = useTransition()
  const [saving, startSave] = useTransition()
  const [planFor, setPlanFor] = useState('')
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const recRef = useRef<SpeechRec | null>(null)
  const sugRef = useRef<HTMLDivElement>(null)

  const P = usePrices()
  const cost = P.postText + images * P.image
  const hashtagCount = libIds.length + (aiHashtags ? 1 : 0)

  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }
    // Feature detection has to run in the browser after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSpeechOk(Boolean(w.SpeechRecognition || w.webkitSpeechRecognition))
  }, [])

  const toggleMic = () => {
    if (listening) return recRef.current?.stop()
    const w = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec }
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition
    if (!Ctor) return
    const rec = new Ctor()
    rec.lang = LANGS.find((l) => l.v === language)!.speech
    rec.interimResults = false
    rec.continuous = true
    const base = prompt
    let heard = ''
    rec.onresult = (e) => {
      heard = Array.from(e.results)
        .map((r) => r[0].transcript)
        .join(' ')
      setPrompt([base, heard].filter(Boolean).join(base ? ' ' : ''))
    }
    rec.onend = () => setListening(false)
    rec.onerror = () => setListening(false)
    recRef.current = rec
    rec.start()
    setListening(true)
  }

  const addFiles = async (files: FileList | null) => {
    if (!files) return
    const room = 3 - attachments.length
    const picked = Array.from(files)
      .filter((f) => f.type.startsWith('image/'))
      .slice(0, room)
    const converted = await Promise.all(picked.map(toAttachment))
    setAttachments((a) => [...a, ...converted])
  }

  const submit = () => {
    if (!prompt.trim() || pending) return
    setError(undefined)
    recRef.current?.stop()
    start(async () => {
      const res = await createPost({
        prompt,
        tone,
        length,
        language,
        aiHashtags,
        libraryIds: libIds,
        images,
        attachments: attachments.map(({ mime, data }) => ({ mime: mime as 'image/jpeg', data })),
      })
      if (res.error) setError(res.error)
      else setResult(res.post)
    })
  }

  // Keep the generated post as a draft (or planned post) and open it in the editor.
  const keep = (scheduledAt: string | null) =>
    result &&
    startSave(async () => {
      const res = await savePost({
        kind: 'SOCIAL',
        content: result.caption,
        hashtags: result.hashtags,
        mediaIds: result.images.map((i) => i.id),
        channels: [],
        scheduledAt,
        aiGenerated: true,
      })
      if (res.error) setError(res.error)
      else router.push(`/app/posts/${res.id}`)
    })

  const fullText = result
    ? [result.caption, result.hashtags.map((h) => `#${h}`).join(' ')].filter(Boolean).join('\n\n')
    : ''

  const ToneIcon = TONES.find((t) => t.v === tone)!.icon

  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-x-0 -top-8 h-80 bg-[radial-gradient(700px_260px_at_50%_0%,rgba(16,185,129,0.10),transparent)]" />
      <div className="relative">
        <Link href="/app/planner" className="inline-grid h-10 w-10 place-items-center rounded-lg bg-zinc-100 hover:bg-zinc-200" aria-label="Back">
          <ArrowLeft size={18} />
        </Link>

        <div className="mx-auto mt-2 max-w-3xl">
          <div className="mx-auto flex w-fit rounded-lg bg-zinc-100 p-1 text-sm">
            <span className="inline-flex items-center gap-2 rounded-md bg-white px-3 py-1.5 font-semibold shadow-sm">
              <Sparkles size={15} /> Social post
            </span>
            <Link href="/app/blog/ai" className="inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-zinc-600 hover:text-zinc-900">
              <FileText size={15} /> Blog article
              <span className="rounded bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-700">NEW</span>
            </Link>
          </div>

          <div className="mt-8 flex items-center justify-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-sky-50 text-sky-600">
              <Sparkles size={20} />
            </span>
            <h1 className="text-2xl font-semibold sm:text-3xl">What should we post?</h1>
          </div>
          <p className="mt-2 text-center text-zinc-500">
            Turn a simple idea into a polished, on-brand social post ready to refine and publish.
          </p>

          <div className="mt-6">
            <BriefAssistant
              kind="post"
              language={language}
              defaultOpen={false}
              onUse={(idea, audience) => setPrompt([idea.prompt, idea.format && `Format: ${idea.format}.`, audienceLine(audience)].filter(Boolean).join('\n'))}
            />
          </div>

          {/* ─── Prompt box ─────────────────────────────────────────── */}
          <div
            className="mt-8 rounded-2xl border border-zinc-200 bg-white shadow-sm"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              addFiles(e.dataTransfer.files)
            }}
          >
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit()
              }}
              aria-label="Describe the post"
              placeholder={listening ? 'Listening… speak now' : 'Describe the post you want Loudpilot to create…'}
              className="min-h-36 w-full resize-none rounded-t-2xl px-5 py-4 text-[15px] outline-none placeholder:text-zinc-400"
            />

            {attachments.length > 0 && (
              <div className="flex gap-2 px-5 pb-3">
                {attachments.map((a, i) => (
                  <span key={i} className="group relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={a.preview} alt="" className="h-16 w-16 rounded-lg object-cover ring-1 ring-zinc-200" />
                    <button
                      onClick={() => setAttachments(attachments.filter((_, j) => j !== i))}
                      className="absolute -top-1.5 -right-1.5 grid h-5 w-5 place-items-center rounded-full bg-zinc-900 text-white"
                      aria-label="Remove image"
                    >
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 border-t border-zinc-100 px-3 py-2.5">
              {/* Hashtags */}
              <Popover
                tooltip="Hashtag library"
                width="w-80"
                trigger={() => (
                  <Chip icon={Hash} on={hashtagCount > 0}>
                    Hashtags{libIds.length > 0 && ` (${libIds.length})`}
                  </Chip>
                )}
              >
                {(close) => (
                  <>
                    <button
                      type="button"
                      onClick={() => setAiHashtags(!aiHashtags)}
                      className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left hover:bg-zinc-100"
                    >
                      <Sparkles size={16} className="text-emerald-600" />
                      <span className="flex-1">
                        <span className="block text-sm text-zinc-800">AI hashtags</span>
                        <span className="block text-xs text-zinc-500">Let Loudpilot pick 3–6 relevant tags</span>
                      </span>
                      <Switch on={aiHashtags} />
                    </button>
                    <div className="my-1 h-px bg-zinc-100" />
                    <MenuLabel>Hashtag library</MenuLabel>
                    {libraries.length === 0 ? (
                      <p className="px-2.5 py-2 text-sm text-zinc-500">No hashtag libraries</p>
                    ) : (
                      <div className="max-h-56 overflow-y-auto">
                        {libraries.map((l) => (
                          <MenuItem
                            key={l.id}
                            icon={<Hash size={15} />}
                            checked={libIds.includes(l.id)}
                            hint={l.tags.map((t) => `#${t}`).join(' ')}
                            onClick={() =>
                              setLibIds(libIds.includes(l.id) ? libIds.filter((x) => x !== l.id) : [...libIds, l.id])
                            }
                          >
                            {l.name}
                          </MenuItem>
                        ))}
                      </div>
                    )}
                    <div className="my-1 h-px bg-zinc-100" />
                    <MenuItem icon={<Plus size={15} className="text-zinc-700" />} onClick={() => (close(), setModal('create'))}>
                      Create new
                    </MenuItem>
                    <MenuItem icon={<Settings size={15} className="text-zinc-700" />} onClick={() => (close(), setModal('manage'))}>
                      Manage
                    </MenuItem>
                  </>
                )}
              </Popover>

              {/* Images */}
              <Popover
                tooltip="AI images"
                width="w-64"
                trigger={() => (
                  <Chip icon={ImageIcon} on={images > 0}>
                    Images{images > 0 && ` (${images})`}
                  </Chip>
                )}
              >
                {(close) => (
                  <>
                    <MenuLabel>Images per post</MenuLabel>
                    {[0, 1, 2, 3, 4].map((n) => (
                      <MenuItem
                        key={n}
                        checked={images === n}
                        hint={n === 0 ? 'Text only' : `+${n} credit${n > 1 ? 's' : ''}`}
                        onClick={() => (setImages(n), close())}
                      >
                        {n === 0 ? 'No images' : `${n} image${n > 1 ? 's' : ''}`}
                      </MenuItem>
                    ))}
                  </>
                )}
              </Popover>

              {/* Tone */}
              <Popover
                tooltip="Tone"
                side="top"
                width="w-64"
                trigger={() => (
                  <Chip icon={ToneIcon} on>
                    {tone}
                  </Chip>
                )}
              >
                {(close) => (
                  <>
                    <MenuLabel>Tone</MenuLabel>
                    {TONES.map((t) => (
                      <MenuItem key={t.v} icon={<t.icon size={16} />} checked={tone === t.v} onClick={() => (setTone(t.v), close())}>
                        {t.v}
                      </MenuItem>
                    ))}
                  </>
                )}
              </Popover>

              {/* Length */}
              <Popover
                tooltip="Length"
                side="top"
                trigger={() => (
                  <Chip icon={Type} on>
                    {length}
                  </Chip>
                )}
              >
                {(close) => (
                  <>
                    <MenuLabel>Length</MenuLabel>
                    {LENGTHS.map((l) => (
                      <MenuItem key={l.v} checked={length === l.v} hint={l.hint} onClick={() => (setLength(l.v), close())}>
                        {l.v}
                      </MenuItem>
                    ))}
                  </>
                )}
              </Popover>

              {/* Language */}
              <Popover
                tooltip="Language"
                side="top"
                width="w-56"
                trigger={() => (
                  <Chip icon={Languages} on>
                    {language}
                  </Chip>
                )}
              >
                {(close) => (
                  <>
                    <MenuLabel>Write in</MenuLabel>
                    {LANGS.map((l) => (
                      <MenuItem key={l.v} checked={language === l.v} onClick={() => (setLanguage(l.v), close())}>
                        {l.v}
                      </MenuItem>
                    ))}
                  </>
                )}
              </Popover>

              <div className="ml-auto flex items-center gap-1">
                <span
                  className="mr-1 inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700"
                  title={`${creditsLabel(cost)}: ${P.postText} for the text${images ? ` + ${images * P.image} for images` : ''}`}
                >
                  <Zap size={13} /> {cost}
                </span>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  multiple
                  hidden
                  onChange={(e) => {
                    addFiles(e.target.files)
                    e.target.value = ''
                  }}
                />
                <IconButton
                  label="Attach reference images (up to 3)"
                  onClick={() => fileRef.current?.click()}
                  disabled={attachments.length >= 3}
                >
                  <Paperclip size={18} />
                </IconButton>
                {speechOk && (
                  <IconButton label={listening ? 'Stop dictation' : 'Dictate'} onClick={toggleMic} active={listening}>
                    <Mic size={18} />
                  </IconButton>
                )}
                <button
                  onClick={submit}
                  disabled={!prompt.trim() || pending}
                  className="ml-1 grid h-9 w-9 place-items-center rounded-lg bg-zinc-900 text-white transition hover:bg-zinc-700 disabled:bg-zinc-100 disabled:text-zinc-400"
                  aria-label="Generate"
                >
                  {pending ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  ) : (
                    <ArrowUp size={18} />
                  )}
                </button>
              </div>
            </div>
          </div>
          <p className="mt-2 text-right text-xs text-zinc-400">{credits.toLocaleString()} credits left</p>

          {pending && (
            <p className="mt-4 text-center text-sm text-zinc-500">
              Writing your post{images > 0 && ` and generating ${images} image${images > 1 ? 's' : ''}`}… this can take
              up to a minute.
            </p>
          )}
          {error && <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

          {result && !pending && (
            <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50/40 p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-semibold text-emerald-800">
                  Your post · {result.charged} credit{result.charged > 1 ? 's' : ''} used
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(fullText)
                      setCopied(true)
                      setTimeout(() => setCopied(false), 1500)
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm hover:bg-zinc-50"
                  >
                    {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy text'}
                  </button>
                  <button
                    onClick={() => keep(null)}
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm hover:bg-zinc-50 disabled:opacity-60"
                  >
                    <FileText size={14} /> Save draft
                  </button>
                  <Popover
                    align="right"
                    width="w-72"
                    trigger={() => (
                      <span className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800">
                        <CalendarClock size={14} /> Add to planner
                      </span>
                    )}
                  >
                    {() => (
                      <div className="p-2">
                        <p className="mb-2 text-sm font-medium">Plan for</p>
                        <input
                          type="datetime-local"
                          value={planFor}
                          onChange={(e) => setPlanFor(e.target.value)}
                          className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                        />
                        <button
                          onClick={() => planFor && keep(new Date(planFor).toISOString())}
                          disabled={!planFor || saving}
                          className="mt-2 w-full rounded-lg bg-zinc-900 py-2 text-sm font-semibold text-white disabled:opacity-40"
                        >
                          {saving ? 'Saving…' : 'Add to planner'}
                        </button>
                      </div>
                    )}
                  </Popover>
                </div>
              </div>
              {result.images.length > 0 && (
                <div className={`mb-4 grid gap-2 ${result.images.length > 1 ? 'grid-cols-2' : 'grid-cols-1 sm:max-w-sm'}`}>
                  {result.images.map((img) => (
                    <a key={img.id} href={img.url} target="_blank" rel="noreferrer" className="group relative block">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img.url} alt="" className="aspect-square w-full rounded-xl object-cover ring-1 ring-black/5" />
                      <span className="absolute right-2 bottom-2 hidden rounded-lg bg-white/90 p-1.5 shadow group-hover:block">
                        <Download size={15} />
                      </span>
                    </a>
                  ))}
                </div>
              )}
              {result.imagesFailed > 0 && (
                <p className="mb-3 text-sm text-amber-700">
                  {result.imagesFailed} image{result.imagesFailed > 1 ? 's' : ''} could not be generated — you were not
                  charged for {result.imagesFailed > 1 ? 'them' : 'it'}.
                </p>
              )}
              <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-zinc-800">{result.caption}</p>
              {result.hashtags.length > 0 && (
                <p className="mt-3 text-[15px] text-sky-700">{result.hashtags.map((h) => `#${h}`).join(' ')}</p>
              )}
            </div>
          )}

          {/* ─── Suggestions ──────────────────────────────────────────── */}
          <h2 className="mt-10 mb-3 text-sm text-zinc-500">Suggestions</h2>
          <div className="relative">
            <div ref={sugRef} className="flex snap-x gap-3 overflow-x-auto scroll-smooth pb-2 [scrollbar-width:none]">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.title}
                  onClick={() => setPrompt(s.body)}
                  className="flex w-[290px] shrink-0 snap-start gap-3 rounded-xl border border-zinc-200 bg-white p-4 text-left transition hover:border-zinc-300 hover:shadow-sm"
                >
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${s.tint}`}>
                    <s.icon size={17} />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-semibold">{s.title}</span>
                    <span className="mt-0.5 line-clamp-2 block text-sm text-zinc-500">{s.body}</span>
                  </span>
                </button>
              ))}
            </div>
            <button
              onClick={() => sugRef.current?.scrollBy({ left: 300, behavior: 'smooth' })}
              className="absolute top-1/2 -right-3 hidden h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-white shadow ring-1 ring-zinc-200 sm:grid"
              aria-label="More suggestions"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <h2 className="mt-10 mb-3 text-sm text-zinc-500">Other options</h2>
          <div className="space-y-3">
            <Option icon={Target} tint="bg-indigo-50 text-indigo-600" title="Planning multiple posts?" body="Turn this idea into a coordinated campaign with multiple scheduled posts." cta="Create a campaign" href="/app/campaigns" color="text-indigo-600" />
            <Option icon={LayoutTemplate} tint="bg-rose-50 text-rose-600" title="Want to design it yourself?" body="Start from a template and customise it in Studio." cta="Open Studio" href="/app/studio" color="text-rose-600" />
          </div>
        </div>
      </div>

      {modal && (
        <HashtagModal
          mode={modal}
          libraries={libraries}
          onClose={() => setModal(null)}
          onChange={(libs, createdName) => {
            setLibraries(libs)
            setLibIds((ids) => {
              const kept = ids.filter((id) => libs.some((l) => l.id === id))
              const created = createdName && libs.find((l) => l.name === createdName && !ids.includes(l.id))
              return created ? [...kept, created.id] : kept
            })
          }}
        />
      )}
    </div>
  )
}

function Chip({ children, icon: Icon, on }: { children: React.ReactNode; icon: typeof Hash; on?: boolean }) {
  return (
    <span
      className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition select-none ${
        on ? 'border-zinc-200 text-zinc-800 hover:bg-zinc-50' : 'border-zinc-100 text-zinc-500 hover:bg-zinc-50'
      }`}
    >
      <Icon size={15} className={on ? 'text-emerald-600' : 'text-zinc-400'} />
      {children}
    </span>
  )
}

function Switch({ on }: { on: boolean }) {
  return (
    <span className={`relative h-5 w-9 shrink-0 rounded-full transition ${on ? 'bg-emerald-500' : 'bg-zinc-300'}`}>
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
    </span>
  )
}

function IconButton({
  children,
  label,
  onClick,
  disabled,
  active,
}: {
  children: React.ReactNode
  label: string
  onClick: () => void
  disabled?: boolean
  active?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`grid h-9 w-9 place-items-center rounded-lg transition disabled:opacity-40 ${
        active ? 'animate-pulse bg-red-50 text-red-600' : 'text-zinc-600 hover:bg-zinc-100'
      }`}
    >
      {children}
    </button>
  )
}

function Option({
  icon: Icon,
  tint,
  title,
  body,
  cta,
  href,
  color,
}: {
  icon: typeof Target
  tint: string
  title: string
  body: string
  cta: string
  href: string
  color: string
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4 sm:flex-row sm:items-center">
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${tint}`}>
        <Icon size={18} />
      </span>
      <div className="flex-1">
        <p className="font-semibold">{title}</p>
        <p className="text-sm text-zinc-500">{body}</p>
      </div>
      <Link href={href} className={`inline-flex items-center gap-1.5 text-sm font-semibold ${color}`}>
        {cta} <ArrowRight size={15} />
      </Link>
    </div>
  )
}
