// Wall-clock ↔ UTC conversion in a named IANA time zone (DST-aware), without
// extra dependencies.

export function isValidTimeZone(tz: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

// Minutes the zone is ahead of UTC at `instant` (Tbilisi → +240).
function offsetAt(instant: number, tz: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(new Date(instant))
      .map((p) => [p.type, p.value]),
  )
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second)
  return Math.round((asUtc - instant) / 60_000)
}

// The UTC instant when the wall clock in `tz` shows y-m-d hh:mm.
export function zonedToUtc(y: number, m: number, d: number, hh: number, mm: number, tz: string): Date {
  const wall = Date.UTC(y, m - 1, d, hh, mm)
  let t = wall - offsetAt(wall, tz) * 60_000
  // Second pass settles instants right next to a DST switch.
  t = wall - offsetAt(t, tz) * 60_000
  return new Date(t)
}

// YYYY-MM-DD of `date` as seen in `tz`.
export function dayIn(date: Date, tz: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}
