import 'server-only'
import { spawn } from 'node:child_process'
import ffmpegPath from 'ffmpeg-static'

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
