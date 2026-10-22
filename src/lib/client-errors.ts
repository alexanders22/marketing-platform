// Errors the browser hits are sent to /api/client-errors, which writes them to
// the server log (`pm2 logs khma --err | grep client-error`). An error that
// comes from a tab still running the previous build (a deploy replaced its
// scripts or Server Action ids) reloads the page once instead of failing.

const STALE = /ChunkLoadError|Loading (CSS )?chunk|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Failed to find Server Action|UnrecognizedActionError|was not found on the server/i

export const isStaleBuild = (e: unknown) => {
  const x = e as { name?: string; message?: string } | null
  return STALE.test(`${x?.name ?? ''} ${x?.message ?? String(e ?? '')}`)
}

// One automatic reload per page within a minute, so a real bug can't loop.
export function reloadOnce(): boolean {
  try {
    const key = `lp_reload:${location.pathname}`
    const last = Number(sessionStorage.getItem(key) ?? 0)
    if (Date.now() - last < 60_000) return false
    sessionStorage.setItem(key, String(Date.now()))
  } catch {
    return false
  }
  location.reload()
  return true
}

export function reportClientError(e: unknown, where: string, reloaded = false) {
  try {
    const x = (e ?? {}) as { name?: string; message?: string; stack?: string; digest?: string }
    const body = JSON.stringify({
      where,
      url: location.href,
      name: x.name,
      message: x.message ?? String(e),
      stack: x.stack,
      digest: x.digest,
      build: document.documentElement.dataset.dplId,
      reloaded,
    })
    if (!navigator.sendBeacon?.('/api/client-errors', new Blob([body], { type: 'application/json' }))) {
      void fetch('/api/client-errors', { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true }).catch(() => {})
    }
  } catch {
    // Reporting must never break the page.
  }
}

// A request that failed on the way (offline, a laptop waking up, the server
// restarting during a deploy: 502/500 pages instead of the app's answer).
// Trying again shortly usually just works.
const TRANSIENT = /Failed to fetch|NetworkError|Load failed|fetch failed|network error|An unexpected response was received from the server|Internal Server Error|Bad Gateway|Gateway Time-?out|Service Unavailable/i

export const isTransient = (e: unknown) => {
  const x = e as { name?: string; message?: string; digest?: string } | null
  // An error the app itself threw on the server carries a digest: not a blip.
  if (x?.digest) return false
  return TRANSIENT.test(`${x?.name ?? ''} ${x?.message ?? String(e ?? '')}`)
}

// Automatic retries per page: a few within a minute, then the error is shown.
let retries = { path: '', count: 0, at: 0 }
export function nextRetryDelay(): number | null {
  const path = location.pathname
  if (retries.path !== path || Date.now() - retries.at > 60_000) retries = { path, count: 0, at: Date.now() }
  if (retries.count >= 3) return null
  return [1000, 3000, 6000][retries.count++]
}

// Tells the page a request was lost and the view was restored (ConnectionNotice).
export const RECOVERED_EVENT = 'lp:recovered'

// Runs fn once the browser is online, after the delay.
export function whenOnline(delay: number, fn: () => void) {
  let timer: ReturnType<typeof setTimeout> | undefined
  const go = () => (timer = setTimeout(fn, delay))
  if (navigator.onLine) go()
  else window.addEventListener('online', go, { once: true })
  return () => {
    window.removeEventListener('online', go)
    if (timer) clearTimeout(timer)
  }
}

// Browser noise that is not ours to fix.
const NOISE = /ResizeObserver loop|Script error\.?$|extension:\/\//i

// What an error screen does first: report it, and reload a stale tab.
export function handleClientError(e: unknown, where: string) {
  const x = e as { message?: string; stack?: string } | null
  if (NOISE.test(`${x?.message ?? String(e ?? '')} ${x?.stack ?? ''}`)) return
  const stale = isStaleBuild(e)
  reportClientError(e, where, stale)
  if (stale) reloadOnce()
}
