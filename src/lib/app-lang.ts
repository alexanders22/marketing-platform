// The language of the app's plain-words parts (Dashboard, explanations):
// English, Georgian or Russian. Kept in the same cookie as the website's
// language (lp_lang), so both follow one choice.

export const APP_LANGS = ['en', 'ka', 'ru'] as const
export type AppLang = (typeof APP_LANGS)[number]
export const LANG_COOKIE = 'lp_lang'
export const LANG_NAMES: Record<AppLang, string> = { en: 'English', ka: 'ქართული', ru: 'Русский' }
export const isAppLang = (v: unknown): v is AppLang => APP_LANGS.includes(v as AppLang)
