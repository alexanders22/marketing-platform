import 'server-only'

// Fixed-window failure counter kept in memory. Loudpilot runs as a single process
// (PM2), so this is enough for login throttling; move it to Redis or the DB
// if the app is ever scaled to several instances.
const buckets = new Map<string, { count: number; resetAt: number }>()

export function isLimited(key: string, limit: number) {
  const b = buckets.get(key)
  if (!b || b.resetAt < Date.now()) return false
  return b.count >= limit
}

export function recordFailure(key: string, windowMs: number) {
  const now = Date.now()
  const b = buckets.get(key)
  if (!b || b.resetAt < now) buckets.set(key, { count: 1, resetAt: now + windowMs })
  else b.count++
  // Keep the map small.
  if (buckets.size > 10_000) for (const [k, v] of buckets) if (v.resetAt < now) buckets.delete(k)
}

export function clearFailures(key: string) {
  buckets.delete(key)
}
