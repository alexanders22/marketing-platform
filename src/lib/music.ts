import 'server-only'
import { rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { probe } from './ffmpeg'
import { safeFetchBytes } from './safe-fetch'
import { saveMediaFile, tempDir } from './storage'

// Free music for videos from Openverse (openverse.org): Creative Commons
// tracks from Jamendo, Freesound, Wikimedia… Only licences that allow
// commercial use and editing without share-alike: CC0, public domain and
// CC BY (which needs a credit line — added to the post text).

const API = 'https://api.openverse.org/v1/audio/'
const LICENSES = ['cc0', 'pdm', 'by'] as const
const MAX_BYTES = 25_000_000

export type FreeTrack = {
  id: string
  title: string
  creator: string
  durationMs: number | null
  license: string
  // What to credit (CC BY); null when no credit is needed.
  credit: string | null
  previewUrl: string
  source: string
  pageUrl: string | null
}

type Row = {
  id: string
  title?: string | null
  creator?: string | null
  duration?: number | null
  license?: string
  license_version?: string | null
  url?: string | null
  source?: string | null
  foreign_landing_url?: string | null
  alt_files?: { url: string; filetype?: string | null }[] | null
  filetype?: string | null
}

const licenseName = (r: Row) => (r.license === 'cc0' ? 'CC0' : r.license === 'pdm' ? 'Public domain' : `CC BY ${r.license_version ?? ''}`.trim())

function toTrack(r: Row): FreeTrack | null {
  if (!r.url || !LICENSES.includes(r.license as (typeof LICENSES)[number])) return null
  const title = r.title?.trim() || 'Untitled'
  const creator = r.creator?.trim() || 'Unknown artist'
  return {
    id: r.id,
    title,
    creator,
    durationMs: r.duration ?? null,
    license: licenseName(r),
    credit: r.license === 'by' ? `Music: “${title}” by ${creator} (${licenseName(r)})` : null,
    previewUrl: r.url,
    source: r.source ?? 'openverse',
    pageUrl: r.foreign_landing_url ?? null,
  }
}

async function getJson(url: string) {
  const res = await fetch(url, { headers: { accept: 'application/json', 'user-agent': 'Loudpilot/1.0 (+https://loudpilot.app)' }, signal: AbortSignal.timeout(10_000) })
  if (!res.ok) throw new Error(res.status === 429 ? 'The free library is busy — try again in a minute.' : `The free library answered ${res.status}`)
  return res.json()
}

// Short music tracks (up to 4 minutes) matching the words.
export async function searchFreeMusic(q: string): Promise<FreeTrack[]> {
  const params = new URLSearchParams({
    q: q || 'background',
    category: 'music',
    license: LICENSES.join(','),
    page_size: '30',
  })
  const data = (await getJson(`${API}?${params}`)) as { results?: Row[] }
  return (data.results ?? []).map(toTrack).filter((t): t is FreeTrack => t !== null && (t.durationMs ?? 0) <= 240_000)
}

// Downloads a track into the workspace library. The track is looked up again
// by id, so only what Openverse lists (and its licence) is trusted.
export async function importFreeMusic(workspaceId: string, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('Unknown track')
  const track = toTrack((await getJson(`${API}${id}/`)) as Row)
  if (!track) throw new Error('This track can’t be used in ads')
  const { bytes, contentType } = await safeFetchBytes(track.previewUrl, { maxBytes: MAX_BYTES, timeoutMs: 60_000, accept: 'audio/*' })
  const mime = contentType?.split(';')[0].trim() ?? ''
  const ext = { 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/ogg': 'ogg', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/mp4': 'm4a' }[mime]
  if (!ext) throw new Error('This track’s file type isn’t supported')
  const dir = await tempDir('music')
  try {
    const file = path.join(dir, `track.${ext}`)
    await writeFile(file, bytes)
    const info = await probe(file)
    if (!info.durationMs) throw new Error('Could not read this track')
    const name = `${track.title} — ${track.creator}`
    const media = await saveMediaFile(workspaceId, file, mime === 'audio/mp3' ? 'audio/mpeg' : mime, `Music: ${name} · ${track.license} · ${track.pageUrl ?? 'Openverse'}`, {
      durationMs: info.durationMs,
    })
    return { media, name, credit: track.credit }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

// A generated (Lyria) track into the library.
export async function saveGeneratedMusic(workspaceId: string, data: Buffer, mime: string, prompt: string) {
  const ext = mime === 'audio/wav' || mime === 'audio/x-wav' ? 'wav' : 'mp3'
  const dir = await tempDir('music')
  try {
    const file = path.join(dir, `track.${ext}`)
    await writeFile(file, data)
    const info = await probe(file)
    return saveMediaFile(workspaceId, file, ext === 'wav' ? 'audio/wav' : 'audio/mpeg', `Music (AI): ${prompt.slice(0, 200)}`, { durationMs: info.durationMs ?? undefined })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}
