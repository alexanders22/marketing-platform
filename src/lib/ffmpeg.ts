import 'server-only'
import { spawn } from 'node:child_process'
import { readFile, rename, rm, stat } from 'node:fs/promises'
import ffmpegPath from 'ffmpeg-static'
import { jpegCopyPath } from './storage'

// The ffmpeg binary that ships with the ffmpeg-static package (no system
// install needed). FFMPEG_PATH overrides it.
const BIN = process.env.FFMPEG_PATH || (ffmpegPath as unknown as string)

export class FfmpegError extends Error {}

type Options = {
  // Stops ffmpeg (a cancelled render).
  signal?: AbortSignal
  // Seconds of output written so far.
  onProgress?: (seconds: number) => void
}

export function ffmpeg(args: string[], timeoutMs = 10 * 60_000, opts: Options = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!BIN) return reject(new FfmpegError('ffmpeg is not available'))
    if (opts.signal?.aborted) return reject(new FfmpegError('Cancelled'))
    const progress = opts.onProgress ? ['-progress', 'pipe:1', '-nostats'] : []
    const p = spawn(BIN, ['-hide_banner', '-nostdin', ...progress, ...args], { stdio: ['ignore', opts.onProgress ? 'pipe' : 'ignore', 'pipe'] })
    let err = ''
    p.stderr!.on('data', (d) => (err = (err + d).slice(-20_000)))
    if (opts.onProgress) {
      const onProgress = opts.onProgress
      let line = ''
      p.stdout!.on('data', (d) => {
        const lines = (line + d).split('\n')
        line = lines.pop() ?? ''
        for (const l of lines) {
          const m = l.match(/^out_time_us=(\d+)/)
          if (m) onProgress(Number(m[1]) / 1e6)
        }
      })
    }
    const stop = () => p.kill('SIGKILL')
    opts.signal?.addEventListener('abort', stop, { once: true })
    const t = setTimeout(stop, timeoutMs)
    p.on('error', (e) => (clearTimeout(t), reject(e)))
    p.on('close', (code) => {
      clearTimeout(t)
      opts.signal?.removeEventListener('abort', stop)
      if (code === 0) resolve(err)
      else if (opts.signal?.aborted) reject(new FfmpegError('Cancelled'))
      else reject(new FfmpegError(err.split('\n').filter(Boolean).slice(-6).join('\n') || `ffmpeg exited with ${code}`))
    })
  })
}

/* ─── Inputs ─────────────────────────────────────────────────────────────── */

// Stored and downloaded files are untrusted bytes: ffmpeg reads them with the
// demuxer of their known type (never guessed from the content, so a "video"
// can't turn out to be a playlist) and may open local files only.
const DEMUXER: Record<string, string> = {
  'image/png': 'png_pipe',
  'image/jpeg': 'jpeg_pipe',
  'image/webp': 'webp_pipe',
  'image/gif': 'gif',
  'video/mp4': 'mov',
  'video/quicktime': 'mov',
  'video/webm': 'matroska',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'mov',
  'audio/aac': 'aac',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/ogg': 'ogg',
}

export function input(file: string, mime: string): string[] {
  const demuxer = DEMUXER[mime]
  if (!demuxer) throw new FfmpegError(`Unsupported file type ${mime}`)
  return ['-protocol_whitelist', 'file', '-f', demuxer, '-i', file]
}

// A PNG from the browser (render overlays and subtitles). Looped ones need
// image2 (the PNG decoder is forced, not guessed).
export const pngInput = (file: string, loop = false) => ['-protocol_whitelist', 'file', ...(loop ? ['-f', 'image2', '-c:v', 'png'] : ['-f', 'png_pipe']), '-i', file]

// The type from the first bytes. `video`/`audio` say which kind the caller
// wants, for containers that hold either (MP4/M4A).
export function sniffType(buf: Buffer, want: 'image' | 'video' | 'audio'): string | null {
  const ascii = (from: number, to: number) => buf.subarray(from, to).toString('latin1')
  if (want === 'image') {
    if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'
    if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp'
    if (ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a') return 'image/gif'
    return null
  }
  if (ascii(4, 8) === 'ftyp') return want === 'audio' ? 'audio/mp4' : ascii(8, 12) === 'qt  ' ? 'video/quicktime' : 'video/mp4'
  if (buf.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return want === 'video' ? 'video/webm' : null
  if (want === 'video') return null
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE') return 'audio/wav'
  if (ascii(0, 4) === 'OggS') return 'audio/ogg'
  if (ascii(0, 3) === 'ID3') return 'audio/mpeg'
  // Frame sync: layer bits 00 are ADTS AAC, others MPEG audio (MP3).
  if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return (buf[1] & 0x06) === 0 ? 'audio/aac' : 'audio/mpeg'
  return null
}

// Width and height from an image's header (PNG, JPEG, WebP, GIF).
export function imageSize(buf: Buffer): { width: number; height: number } | null {
  const ascii = (from: number, to: number) => buf.subarray(from, to).toString('latin1')
  if (buf.length >= 24 && ascii(1, 4) === 'PNG') return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
  if (buf.length >= 10 && ascii(0, 3) === 'GIF') return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) }
  if (buf.length >= 30 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') {
    const chunk = ascii(12, 16)
    if (chunk === 'VP8X') return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) }
    if (chunk === 'VP8L') {
      const b = buf.readUInt32LE(21)
      return { width: 1 + (b & 0x3fff), height: 1 + ((b >> 14) & 0x3fff) }
    }
    if (chunk === 'VP8 ') return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff }
    return null
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    // Walk the segments to the frame header (SOF0–SOF15, not DHT/JPG/DAC).
    let i = 2
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) return null
      const marker = buf[i + 1]
      if (marker === 0xff) {
        i++
        continue
      }
      if (marker === 0xd9) return null
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        i += 2
        continue
      }
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) }
      i += 2 + buf.readUInt16BE(i + 2)
    }
  }
  return null
}

// Bigger pictures than this are refused before ffmpeg decodes them.
export const MAX_IMAGE_SIDE = 8000

export function imageTooBig(buf: Buffer) {
  const size = imageSize(buf)
  return !size || size.width < 1 || size.height < 1 || size.width > MAX_IMAGE_SIDE || size.height > MAX_IMAGE_SIDE
}

// A stored picture ffmpeg is about to read: readable and not too big.
export async function checkImage(file: string) {
  if (imageTooBig(await readFile(file))) throw new FfmpegError(`This picture is too big or unreadable — up to ${MAX_IMAGE_SIDE} pixels on a side.`)
}

export type Probe = { durationMs: number | null; width: number | null; height: number | null; video: boolean; audio: boolean }

// ffmpeg prints the stream info on stderr; no ffprobe needed.
export async function probe(file: string, mime: string): Promise<Probe> {
  let out = ''
  try {
    out = await ffmpeg([...input(file, mime), '-f', 'null', '-t', '0', '-'], 60_000)
  } catch (e) {
    out = e instanceof Error ? e.message : ''
  }
  const d = out.match(/Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/)
  const v = out.match(/Stream #[^\n]*Video:[^\n]*?(\d{2,5})x(\d{2,5})/)
  // Phones store portrait video as landscape + a rotation flag.
  const rotated = /rotate\s*:\s*-?(90|270)|displaymatrix: rotation of -?(90|270)/.test(out)
  const w = v ? Number(v[1]) : null
  const h = v ? Number(v[2]) : null
  return {
    durationMs: d ? Math.round((Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3])) * 1000) : null,
    width: rotated ? h : w,
    height: rotated ? w : h,
    video: /Stream #[^\n]*Video:/.test(out),
    audio: /Stream #[^\n]*Audio:/.test(out),
  }
}

// A JPEG copy of a PNG/WebP image (Instagram takes JPEG only), made once and
// kept next to the original. Transparent parts go on white.
export async function jpegCopy(file: string, mime: string) {
  const out = jpegCopyPath(file)
  if (await stat(out).then(() => true, () => false)) return out
  await checkImage(file)
  const tmp = `${out}.${process.pid}-${Date.now()}.tmp.jpg`
  try {
    await ffmpeg(['-y', ...input(file, mime), '-filter_complex', 'color=white[c];[c][0:v]scale2ref[bg][img];[bg][img]overlay=shortest=1:format=auto,format=yuvj420p', '-frames:v', '1', '-q:v', '2', tmp], 60_000)
    await rename(tmp, out)
  } finally {
    await rm(tmp, { force: true })
  }
  return out
}

// A JPEG still from a video, for lists and the post preview.
export async function posterFrame(file: string, mime: string, out: string, atSeconds = 0.5) {
  await ffmpeg(['-y', '-ss', String(atSeconds), ...input(file, mime), '-frames:v', '1', '-vf', 'scale=720:-2', '-q:v', '4', out], 60_000)
}
