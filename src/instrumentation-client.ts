import { handleClientError } from '@/lib/client-errors'

// Errors outside React's error boundaries (a failed script load, a rejected
// promise) are reported too; a tab left on the previous build reloads once.
try {
  window.addEventListener('error', (e) => handleClientError(e.error ?? e.message, 'window'))
  window.addEventListener('unhandledrejection', (e) => handleClientError(e.reason, 'promise'))
} catch {
  // Never block the app over monitoring.
}
