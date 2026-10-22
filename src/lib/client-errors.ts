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
