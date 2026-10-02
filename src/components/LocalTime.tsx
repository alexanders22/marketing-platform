'use client'

import { useSyncExternalStore } from 'react'

const noop = () => () => {}

// True only after hydration. Server HTML and the first client render agree
// (false), then the client re-renders with browser-only values such as the
// user's time zone — no hydration mismatch.
export function useIsClient() {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  )
}

// A date/time formatted in the viewer's own time zone.
export function LocalTime({ iso, options, placeholder = '' }: { iso: string; options: Intl.DateTimeFormatOptions; placeholder?: string }) {
  const client = useIsClient()
  return <>{client ? new Date(iso).toLocaleString('en-GB', options) : placeholder}</>
}
