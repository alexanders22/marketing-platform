import 'server-only'
import { spawn } from 'node:child_process'
import ffmpegPath from 'ffmpeg-static'

// The ffmpeg binary that ships with the ffmpeg-static package (no system
// install needed). FFMPEG_PATH overrides it.
const BIN = process.env.FFMPEG_PATH || (ffmpegPath as unknown as string)

export class FfmpegError extends Error {}

export function ffmpeg(args: string[], timeoutMs = 10 * 60_000): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!BIN) return reject(new FfmpegError('ffmpeg is not available'))
    const p = spawn(BIN, ['-hide_banner', '-nostdin', ...args], { stdio: ['ignore', 'ignore', 'pipe'] })
    let err = ''
    p.stderr.on('data', (d) => (err = (err + d).slice(-20_000)))
    const t = setTimeout(() => p.kill('SIGKILL'), timeoutMs)
    p.on('error', (e) => (clearTimeout(t), reject(e)))
    p.on('close', (code) => {
      clearTimeout(t)
      if (code === 0) resolve(err)
      else reject(new FfmpegError(err.split('\n').filter(Boolean).slice(-6).join('\n') || `ffmpeg exited with ${code}`))
    })
  })
}

export type Probe = { durationMs: number | null; width: number | null; height: number | null; video: boolean; audio: boolean }

// ffmpeg prints the stream info on stderr; no ffprobe needed.
export async function probe(file: string): Promise<Probe> {
  let out = ''
  try {
    out = await ffmpeg(['-i', file, '-f', 'null', '-t', '0', '-'], 60_000)
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

// A JPEG still from a video, for lists and the post preview.
export async function posterFrame(file: string, out: string, atSeconds = 0.5) {
  await ffmpeg(['-y', '-ss', String(atSeconds), '-i', file, '-frames:v', '1', '-vf', 'scale=720:-2', '-q:v', '4', out], 60_000)
}
