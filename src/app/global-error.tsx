'use client'

import { useEffect } from 'react'
import { handleClientError } from '@/lib/client-errors'

// Replaces the root layout when it fails: the error is reported (and a tab
// on the previous build reloads once) before this screen is shown.
export default function GlobalError({ error }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => handleClientError(error, 'global'), [error])
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: '100vh', display: 'grid', placeItems: 'center', fontFamily: 'Inter, Arial, sans-serif', background: '#fafafa', color: '#18181b' }}>
        <div style={{ maxWidth: 420, padding: 24, textAlign: 'center' }}>
          <title>Something went wrong — Loudpilot</title>
          <p style={{ fontSize: 18, fontWeight: 600, margin: '0 0 8px' }}>This page couldn’t load</p>
          <p style={{ fontSize: 14, color: '#52525b', margin: '0 0 20px' }}>Reload to try again. If it keeps happening, write to info@loudpilot.app{error.digest ? ` and mention ${error.digest}` : ''}.</p>
          <button
            onClick={() => location.reload()}
            style={{ padding: '10px 18px', borderRadius: 10, border: 0, background: '#18181b', color: '#fff', fontWeight: 600, cursor: 'pointer' }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  )
}
