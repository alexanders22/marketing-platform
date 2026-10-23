'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { APP_LANGS, LANG_COOKIE, LANG_NAMES, type AppLang } from '@/lib/app-lang'

const SHORT: Record<AppLang, string> = { en: 'EN', ka: 'ქარ', ru: 'РУ' }

const saveLang = (l: AppLang) => {
  document.cookie = `${LANG_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`
}

// The language of the plain-words parts of the app (and of the website).
export function LanguageSwitch({ lang }: { lang: AppLang }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const pick = (l: AppLang) => {
    saveLang(l)
    start(() => router.refresh())
  }
  return (
    <div role="radiogroup" aria-label="Language" className={`flex rounded-lg bg-zinc-100 p-1 text-sm ${pending ? 'opacity-60' : ''}`}>
      {APP_LANGS.map((l) => (
        <button
          key={l}
          type="button"
          role="radio"
          aria-checked={l === lang}
          aria-label={LANG_NAMES[l]}
          title={LANG_NAMES[l]}
          onClick={() => pick(l)}
          className={`rounded-md px-2.5 py-1 font-medium ${l === lang ? 'bg-white shadow-sm' : 'text-zinc-500 hover:text-zinc-900'}`}
        >
          {SHORT[l]}
        </button>
      ))}
    </div>
  )
}
