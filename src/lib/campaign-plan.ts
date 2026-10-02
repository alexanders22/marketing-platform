import { dayIn, zonedToUtc } from './time'

// Pure campaign scheduling helpers (no DB, no AI) — shared by the server
// action and the tests.

// Posts per AI call — small enough that long captions (Georgian, Russian)
// stay well inside the model's output limit.
export const BATCH = 7

// Spread `perWeek` slots evenly over each week, at the chosen local time in
// the user's zone (each date converted on its own, so DST switches are right).
export function slots(startsOn: string, time: string, timeZone: string, weeks: number, perWeek: number, limit = Infinity) {
  const [y, m, d] = startsOn.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  const out: Date[] = []
  for (let w = 0; w < weeks && out.length < limit; w++) {
    for (let k = 0; k < perWeek && out.length < limit; k++) {
      const day = w * 7 + Math.floor((k * 7) / perWeek)
      const local = new Date(Date.UTC(y, m - 1, d + day))
      out.push(zonedToUtc(local.getUTCFullYear(), local.getUTCMonth() + 1, local.getUTCDate(), hh, mm, timeZone))
    }
  }
  return out
}

export const chunks = <T,>(list: T[], size = BATCH) =>
  Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size))

// Pair one batch's answer with that batch's own dates. A short answer only
// drops the dates it didn't fill; nothing shifts onto another day.
export const pairWithDates = <P,>(chunk: Date[], posts: P[]) =>
  posts.slice(0, chunk.length).map((post, j) => ({ post, date: chunk[j] }))

export const startsInPast = (startsOn: string, timeZone: string, now = new Date()) => startsOn < dayIn(now, timeZone)
