import 'server-only'
import { writeFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { ffmpeg, posterFrame, probe } from './ffmpeg'
import { prisma } from './prisma'
import { mediaFile, saveMediaFile, tempDir } from './storage'
import { FORMATS, isFormat, timeline, type VideoDoc } from './video'

// Renders a Studio video to an H.264/AAC MP4 with ffmpeg. The browser sends
// one transparent PNG per scene with its text (and the end card), so the text
// looks exactly like the editor preview. One render at a time per server.

const FPS = 30
let queue: Promise<unknown> = Promise.resolve()

export function enqueueRender(videoId: string, overlays: (Buffer | null)[]) {
  const job = queue.then(() => render(videoId, overlays)).catch((e) => console.error('video render failed', videoId, e))
  queue = job
  return job
}

const hex = (c: string) => (/^#[0-9a-fA-F]{6}$/.test(c) ? `0x${c.slice(1)}` : '0x111827')
const num = (n: number) => n.toFixed(3)

async function render(videoId: string, overlays: (Buffer | null)[]) {
  const video = await prisma.video.findUnique({ where: { id: videoId } })
  if (!video) return
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

      const png = overlays[i]
      if (png && png.length > 0) {
        const file = path.join(dir, `o${i}.png`)
        await writeFile(file, png)
        const o = input++
        args.push('-loop', '1', '-t', num(d), '-i', file)
        // Text fades in; the end card is the whole frame, no fade.
        const fadeIn = s ? `,fade=in:st=0.15:d=0.35:alpha=1` : ''
        filters.push(`[${o}:v]format=rgba,scale=${W}:${H}${fadeIn}[o${i}]`, `[b${i}][o${i}]overlay=0:0:shortest=1,format=yuv420p[s${i}]`)
      } else {
        filters.push(`[b${i}]null[s${i}]`)
      }
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
    await ffmpeg(args, 15 * 60_000)

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
    await prisma.video.update({
      where: { id: video.id },
      data: { status: 'READY', error: null, outputMediaId: media.id, renderedAt: new Date() },
    })
  } catch (e) {
    console.error('render error', videoId, e)
    const message = e instanceof Error ? e.message : String(e)
    await prisma.video.update({
      where: { id: video.id },
      data: { status: 'FAILED', error: message.slice(0, 1000) },
    })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}
