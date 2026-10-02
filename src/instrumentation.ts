// Starts the background ticker (scheduled publishing, insights refresh) in
// the Node.js server. KHMA_SCHEDULER=off disables it, e.g. for a second
// instance. The work itself runs in /api/cron/tick.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || process.env.KHMA_SCHEDULER === 'off') return
  const g = globalThis as { __khmaTicker?: ReturnType<typeof setInterval> }
  if (g.__khmaTicker) return

  const { cronSecret } = await import('./lib/cron-secret')
  const base = (process.env.KHMA_INTERNAL_URL || `http://127.0.0.1:${process.env.PORT || 3100}`).replace(/\/$/, '')
  let busy = false
  const tick = async () => {
    if (busy) return
    busy = true
    try {
      const res = await fetch(`${base}/api/cron/tick`, { method: 'POST', headers: { 'x-khma-cron': cronSecret() } })
      if (!res.ok) console.error('khma tick', res.status)
    } catch (e) {
      console.error('khma tick failed', e instanceof Error ? e.message : e)
    } finally {
      busy = false
    }
  }
  g.__khmaTicker = setInterval(tick, 60_000)
  setTimeout(tick, 15_000)
}
