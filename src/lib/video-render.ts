import 'server-only'
import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { ffmpeg, posterFrame, probe } from './ffmpeg'
import { prisma } from './prisma'
import { mediaFile, renderJobDir, saveMediaFile, tempDir } from './storage'
import { FORMATS, isFormat, timeline, type VideoDoc } from './video'

// Renders a Studio video to an H.264/AAC MP4 with ffmpeg. The browser sends
// one transparent PNG per scene with its text (and the end card), so the text
// looks exactly like the editor preview.
//
// Renders wait in a queue: the job is the Video row (status RENDERING,
// renderQueuedAt) plus its PNGs on disk, so a restart picks waiting and
// interrupted renders up again. KHMA_RENDER_CONCURRENCY renders run at once
// (default 1 — ffmpeg already uses every core). One server process only.

const FPS = 30
const CONCURRENCY = Math.max(1, Number(process.env.KHMA_RENDER_CONCURRENCY) || 1)
const INTERRUPTED = 'The render was interrupted — render the video again'

type QueueState = { running: Map<string, AbortController>; resumed: boolean; filling: boolean; again: boolean }
const g = globalThis as { __khmaRenders?: QueueState }
const state = (g.__khmaRenders ??= { running: new Map(), resumed: false, filling: false, again: false })

const jobOf = (videoId: string, queuedAt: Date) => renderJobDir(`${videoId}-${queuedAt.getTime()}`)

// Puts a video in the render queue. False when it is already waiting or rendering.
export async function enqueueRender(videoId: string, overlays: (Buffer | null)[]): Promise<boolean> {
  const queuedAt = new Date()
  const dir = jobOf(videoId, queuedAt)
  await mkdir(dir, { recursive: true })
  await Promise.all(overlays.map((o, i) => (o && o.length > 0 ? writeFile(path.join(dir, `o${i}.png`), o) : null)))
  await writeFile(path.join(dir, 'job.json'), JSON.stringify({ parts: overlays.length }))
  const claimed = await prisma.video.updateMany({
    where: { id: videoId, OR: [{ status: { not: 'RENDERING' } }, { renderQueuedAt: null }] },
    data: { status: 'RENDERING', error: null, renderQueuedAt: queuedAt, renderStartedAt: null, renderProgress: 0 },
  })
  if (claimed.count === 0) {
    await rm(dir, { recursive: true, force: true })
    return false
  }
  kick()
  return true
}

// Waits until a queued render is done (for background jobs).
export async function waitForRender(videoId: string, timeoutMs = 30 * 60_000) {
  const until = Date.now() + timeoutMs
  while (Date.now() < until) {
    const v = await prisma.video.findUnique({ where: { id: videoId }, select: { status: true } })
    if (v?.status !== 'RENDERING') return v?.status ?? null
    await new Promise((r) => setTimeout(r, 2000))
  }
  return 'RENDERING'
}

// Stops a waiting or running render and drops its files; the caller has
// already moved the video out of RENDERING.
export async function stopRender(videoId: string) {
  state.running.get(videoId)?.abort()
  const root = path.dirname(renderJobDir(videoId))
  const jobs = await readdir(root).catch(() => [] as string[])
  await Promise.all(jobs.filter((j) => j.startsWith(`${videoId}-`)).map((j) => rm(path.join(root, j), { recursive: true, force: true })))
}

// After a restart: renders that were running start over, renders from before
// the queue existed (no job on disk) fail with a clear message. Then fills the
// free slots. Called by the minute ticker.
export async function resumeRenders() {
  if (!state.resumed) {
    state.resumed = true
    const running = [...state.running.keys()]
    await prisma.video.updateMany({ where: { status: 'RENDERING', renderQueuedAt: null }, data: { status: 'FAILED', error: INTERRUPTED } })
    await prisma.video.updateMany({
      where: { status: 'RENDERING', renderStartedAt: { not: null }, id: { notIn: running } },
      data: { renderStartedAt: null, renderProgress: 0 },
    })
  }
  kick()
}

// Starts waiting renders, oldest first, while there are free slots.
function kick() {
  if (state.filling) {
    state.again = true
    return
  }
  state.filling = true
  fill()
    .catch((e) => console.error('render queue failed', e))
    .finally(() => {
      state.filling = false
      if (state.again) {
        state.again = false
        kick()
      }
    })
}

async function fill() {
  while (state.running.size < CONCURRENCY) {
    const next = await prisma.video.findFirst({
      where: { status: 'RENDERING', renderStartedAt: null, renderQueuedAt: { not: null }, id: { notIn: [...state.running.keys()] } },
      orderBy: { renderQueuedAt: 'asc' },
      select: { id: true, renderQueuedAt: true },
    })
    if (!next?.renderQueuedAt) return
    const claimed = await prisma.video.updateMany({
      where: { id: next.id, status: 'RENDERING', renderQueuedAt: next.renderQueuedAt, renderStartedAt: null },
      data: { renderStartedAt: new Date(), renderProgress: 0 },
    })
    if (claimed.count === 0) continue
    const ctl = new AbortController()
    state.running.set(next.id, ctl)
    void render(next.id, next.renderQueuedAt, ctl.signal)
      .catch((e) => console.error('video render failed', next.id, e))
      .finally(() => {
        state.running.delete(next.id)
        kick()
      })
  }
}

const hex = (c: string) => (/^#[0-9a-fA-F]{6}$/.test(c) ? `0x${c.slice(1)}` : '0x111827')
const num = (n: number) => n.toFixed(3)

async function render(videoId: string, queuedAt: Date, signal: AbortSignal) {
  const video = await prisma.video.findUnique({ where: { id: videoId } })
  // Only this job may write the result: a cancel or a newer render changes queuedAt.
  const mine = { id: videoId, status: 'RENDERING' as const, renderQueuedAt: queuedAt }
  const job = jobOf(videoId, queuedAt)
  if (!video || video.renderQueuedAt?.getTime() !== queuedAt.getTime()) return void (await rm(job, { recursive: true, force: true }))
  const doc = video.data as unknown as VideoDoc
  const format = isFormat(video.format) ? video.format : '9:16'
  const { w: W, h: H } = FORMATS[format]
  const { parts, total, fade } = timeline(doc)

  // Every file must belong to this workspace.
  const ids = [...new Set([...doc.scenes.flatMap((s) => [s.media?.id, s.voiceMediaId]), doc.music?.mediaId].filter((x): x is string => Boolean(x)))]
  const files = await prisma.media.findMany({ where: { id: { in: ids }, workspaceId: video.workspaceId } })
  const byId = new Map(files.map((f) => [f.id, f]))
  const dir = await tempDir('render')
  try {
    if (ids.some((id) => !byId.has(id))) throw new Error('Some media are no longer available')
    const { parts: count } = JSON.parse(await readFile(path.join(job, 'job.json'), 'utf8').catch(() => '{}')) as { parts?: number }
    if (count !== parts.length) throw new Error(INTERRUPTED)

    const args: string[] = ['-y']
    const filters: string[] = []
    let input = 0
    const scenes: string[] = []

    for (const [i, p] of parts.entries()) {
      const d = p.seconds
      const frames = Math.round(d * FPS)
      const s = p.scene
      const media = s?.media ? byId.get(s.media.id) : null
      const v = input++
      if (media && media.kind === 'VIDEO') {
        args.push('-ss', num(Math.max(0, s!.clipStart)), '-t', num(d), '-i', mediaFile(media.path))
        filters.push(
          `[${v}:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=${FPS},setsar=1,format=yuv420p,tpad=stop_mode=clone:stop_duration=${num(d)},trim=duration=${num(d)},setpts=PTS-STARTPTS[b${i}]`,
        )
      } else if (media && media.kind === 'IMAGE') {
        args.push('-i', mediaFile(media.path))
        // Ken Burns on a 1.5× canvas so zooms stay sharp.
        const BW = Math.round(W * 1.5 / 2) * 2
        const BH = Math.round(H * 1.5 / 2) * 2
        const z = { 'zoom-in': `1+0.12*on/${frames}`, 'zoom-out': `1.12-0.12*on/${frames}`, 'pan-left': '1.12', 'pan-right': '1.12', none: '1' }[s!.motion]
        const x = s!.motion === 'pan-left' ? `(iw-iw/zoom)*(1-on/${frames})` : s!.motion === 'pan-right' ? `(iw-iw/zoom)*on/${frames}` : 'iw/2-(iw/zoom/2)'
        filters.push(
          `[${v}:v]scale=${BW}:${BH}:force_original_aspect_ratio=increase,crop=${BW}:${BH},zoompan=z='${z}':x='${x}':y='ih/2-(ih/zoom/2)':d=${frames}:s=${W}x${H}:fps=${FPS},setsar=1,format=yuv420p,trim=duration=${num(d)}[b${i}]`,
        )
      } else {
        args.push('-f', 'lavfi', '-i', `color=c=${hex(s?.color ?? '#111827')}:s=${W}x${H}:r=${FPS}:d=${num(d)}`)
        filters.push(`[${v}:v]format=yuv420p,setsar=1[b${i}]`)
      }

      const file = path.join(job, `o${i}.png`)
      if (existsSync(file)) {
        const o = input++
        args.push('-loop', '1', '-t', num(d), '-i', file)
        // Text fades in; the end card is the whole frame, no fade.
        const fadeIn = s ? `,fade=in:st=0.15:d=0.35:alpha=1` : ''
        filters.push(`[${o}:v]format=rgba,scale=${W}:${H}${fadeIn}[o${i}]`, `[b${i}][o${i}]overlay=0:0:shortest=1,format=yuv420p,fps=${FPS}[s${i}]`)
      } else {
        filters.push(`[b${i}]fps=${FPS}[s${i}]`)
      }
      // Every scene ends with a declared constant frame rate: ffmpeg 7's xfade
      // refuses inputs whose rate got lost (a clip stretched with tpad/trim).
      scenes.push(`[s${i}]`)
    }

    if (scenes.length === 1) filters.push(`${scenes[0]}null[vout]`)
    else if (!fade) filters.push(`${scenes.join('')}concat=n=${scenes.length}:v=1:a=0[vout]`)
    else {
      let prev = scenes[0]
      for (let i = 1; i < scenes.length; i++) {
        const out = i === scenes.length - 1 ? '[vout]' : `[x${i}]`
        filters.push(`${prev}${scenes[i]}xfade=transition=fade:duration=${num(fade)}:offset=${num(parts[i].start)}${out}`)
        prev = out
      }
    }

    // Voice-over lines start a beat after their scene; clips that keep their
    // own sound join the same mix.
    const voices: string[] = []
    for (const [i, p] of parts.entries()) {
      const s = p.scene
      const media = s?.keepAudio && s.media?.kind === 'video' ? byId.get(s.media.id) : null
      if (!media || !(await probe(mediaFile(media.path))).audio) continue
      const a = input++
      args.push('-ss', num(Math.max(0, s!.clipStart)), '-t', num(p.seconds), '-i', mediaFile(media.path))
      const ms = Math.round(p.start * 1000)
      filters.push(`[${a}:a]aformat=sample_rates=44100:channel_layouts=stereo,afade=t=in:d=0.2,afade=t=out:st=${num(Math.max(0, p.seconds - 0.3))}:d=0.3,adelay=${ms}|${ms}[c${i}]`)
      voices.push(`[c${i}]`)
    }
    for (const [i, p] of parts.entries()) {
      const id = p.scene?.voiceMediaId
      const media = id ? byId.get(id) : null
      if (!media) continue
      const a = input++
      args.push('-i', mediaFile(media.path))
      const ms = Math.round((p.start + 0.25) * 1000)
      filters.push(`[${a}:a]aformat=sample_rates=44100:channel_layouts=stereo,adelay=${ms}|${ms}[v${i}]`)
      voices.push(`[v${i}]`)
    }
    const music = doc.music ? byId.get(doc.music.mediaId) : null
    const T = num(total)
    if (voices.length) filters.push(`${voices.join('')}amix=inputs=${voices.length}:normalize=0,apad,atrim=duration=${T}[voice]`)
    if (music) {
      const m = input++
      args.push('-stream_loop', '-1', '-i', mediaFile(music.path))
      const vol = Math.min(1, Math.max(0, doc.music!.volume ?? 0.6))
      filters.push(
        `[${m}:a]aformat=sample_rates=44100:channel_layouts=stereo,volume=${vol.toFixed(2)},atrim=duration=${T},afade=t=out:st=${num(Math.max(0, total - 1.5))}:d=1.5[mus]`,
      )
    }
    if (voices.length && music) {
      // Music ducks under the voice.
      filters.push('[voice]asplit=2[vsc][vmix]', '[mus][vsc]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=400[duck]', '[duck][vmix]amix=inputs=2:normalize=0[aout]')
    } else if (voices.length) filters.push('[voice]anull[aout]')
    else if (music) filters.push('[mus]anull[aout]')
    else {
      // Silent track: some players and networks expect audio.
      const s = input++
      args.push('-f', 'lavfi', '-t', T, '-i', 'anullsrc=r=44100:cl=stereo')
      filters.push(`[${s}:a]anull[aout]`)
    }

    const out = path.join(dir, 'out.mp4')
    args.push(
      '-filter_complex', filters.join(';'),
      '-map', '[vout]', '-map', '[aout]',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-pix_fmt', 'yuv420p', '-r', String(FPS),
      '-c:a', 'aac', '-b:a', '160k',
      '-movflags', '+faststart', '-t', T,
      out,
    )
    // Progress: the share of the timeline written, saved at most every second.
    let saved = 0
    let savedAt = 0
    await ffmpeg(args, 15 * 60_000, {
      signal,
      onProgress: (sec) => {
        const pct = Math.min(97, Math.floor((sec / total) * 100))
        if (pct <= saved || Date.now() - savedAt < 1000) return
        saved = pct
        savedAt = Date.now()
        prisma.video.updateMany({ where: mine, data: { renderProgress: pct } }).catch(() => {})
      },
    })

    const info = await probe(out)
    const poster = path.join(dir, 'poster.jpg')
    await posterFrame(out, poster, Math.min(1, total / 2))
    const posterMedia = await saveMediaFile(video.workspaceId, poster, 'image/jpeg', `Poster: ${video.name}`)
    const media = await saveMediaFile(video.workspaceId, out, 'video/mp4', `Studio video: ${video.name}`, {
      width: W,
      height: H,
      durationMs: info.durationMs ?? Math.round(total * 1000),
      posterId: posterMedia.id,
    })
    await prisma.video.updateMany({
      where: mine,
      data: { status: 'READY', error: null, outputMediaId: media.id, renderedAt: new Date(), renderProgress: 100 },
    })
  } catch (e) {
    if (signal.aborted) return
    console.error('render error', videoId, e)
    const message = e instanceof Error ? e.message : String(e)
    await prisma.video.updateMany({ where: mine, data: { status: 'FAILED', error: message.slice(0, 1000) } })
  } finally {
    await rm(dir, { recursive: true, force: true })
    await rm(job, { recursive: true, force: true })
  }
}
