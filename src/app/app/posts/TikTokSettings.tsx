'use client'

import { useEffect, useState } from 'react'
import { tiktokCreator } from '../channels/network-actions'

// TikTok asks every app to let the person choose, per post, who sees it and
// what others may do with it — nothing preselected — and to show the
// account and TikTok's consent text.

const PRIVACY = {
  PUBLIC_TO_EVERYONE: 'Everyone',
  MUTUAL_FOLLOW_FRIENDS: 'Friends',
  FOLLOWER_OF_CREATOR: 'Followers',
  SELF_ONLY: 'Only me',
} as const
type Privacy = keyof typeof PRIVACY

export type TikTokOptions = { privacy?: Privacy; comments?: boolean; duet?: boolean; stitch?: boolean; brand?: 'none' | 'own' | 'branded' }

type Creator = { id: string; nickname: string; privacy: string[]; comment: boolean; duet: boolean; stitch: boolean; maxSeconds: number }

export function TikTokSettings({ value, onChange, video, seconds }: { value: TikTokOptions; onChange: (v: TikTokOptions) => void; video: boolean; seconds: number | null }) {
  const [creators, setCreators] = useState<Creator[]>()
  const [error, setError] = useState<string>()
  useEffect(() => {
    tiktokCreator().then((r) => (r.error ? setError(r.error) : setCreators(r.creators)))
  }, [])
  const set = (patch: Partial<TikTokOptions>) => onChange({ ...value, ...patch })
  const c = creators?.[0]
  const brand = value.brand ?? 'none'
  return (
    <section className="rounded-xl border border-zinc-200 p-4 text-sm" aria-label="TikTok settings">
      <p className="font-semibold">TikTok</p>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      {!creators && !error && <p className="mt-1 text-xs text-zinc-500">Asking TikTok what this account allows…</p>}
      {c && (
        <div className="mt-2 space-y-3">
          <p className="text-zinc-600">
            Posting as <b>{creators!.map((x) => x.nickname).join(', ')}</b>
          </p>
          {video && seconds && seconds > c.maxSeconds && <p className="text-xs text-red-600">This account can post videos up to {c.maxSeconds} seconds; this one is {Math.round(seconds)}.</p>}
          <label className="flex items-center gap-2">
            <span className="w-28 text-xs text-zinc-500">Who can see it</span>
            <select value={value.privacy ?? ''} onChange={(e) => set({ privacy: (e.target.value || undefined) as Privacy | undefined })} className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5" aria-label="TikTok visibility">
              <option value="">Choose…</option>
              {c.privacy.map((p) => (
                <option key={p} value={p} disabled={p === 'SELF_ONLY' && brand === 'branded'}>
                  {PRIVACY[p as Privacy] ?? p}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap gap-4 text-xs">
            {(
              [
                ['comments', 'Allow comments', c.comment],
                ...(video
                  ? ([
                      ['duet', 'Allow Duet', c.duet],
                      ['stitch', 'Allow Stitch', c.stitch],
                    ] as const)
                  : []),
              ] as const
            ).map(([k, label, allowed]) => (
              <label key={k} className={`flex items-center gap-1.5 ${allowed ? '' : 'text-zinc-400'}`}>
                <input type="checkbox" disabled={!allowed} checked={!!value[k] && allowed} onChange={(e) => set({ [k]: e.target.checked })} />
                {label}
                {!allowed && ' (off in TikTok)'}
              </label>
            ))}
          </div>
          <div className="space-y-1.5 text-xs">
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={brand !== 'none'} onChange={(e) => set({ brand: e.target.checked ? 'own' : 'none' })} />
              This post promotes a brand, product or service
            </label>
            {brand !== 'none' && (
              <div className="ml-5 space-y-1">
                <label className="flex items-center gap-1.5">
                  <input type="radio" name="tt-brand" checked={brand === 'own'} onChange={() => set({ brand: 'own' })} /> Your brand — labelled &ldquo;Promotional content&rdquo;
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    name="tt-brand"
                    checked={brand === 'branded'}
                    onChange={() => set({ brand: 'branded', ...(value.privacy === 'SELF_ONLY' ? { privacy: undefined } : {}) })}
                  />{' '}
                  Branded content — labelled &ldquo;Paid partnership&rdquo;
                </label>
              </div>
            )}
          </div>
          <p className="text-xs text-zinc-500">
            By posting, you agree to TikTok&rsquo;s{' '}
            <a href="https://www.tiktok.com/legal/page/global/music-usage-confirmation/en" target="_blank" rel="noreferrer" className="underline">
              Music Usage Confirmation
            </a>
            {brand === 'branded' && (
              <>
                {' '}
                and{' '}
                <a href="https://www.tiktok.com/legal/page/global/bc-policy/en" target="_blank" rel="noreferrer" className="underline">
                  Branded Content Policy
                </a>
              </>
            )}
            . After publishing, it can take a few minutes to appear on the profile.
          </p>
        </div>
      )}
    </section>
  )
}
