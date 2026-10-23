import 'server-only'
import { cookies } from 'next/headers'
import { isAppLang, LANG_COOKIE, type AppLang } from './app-lang'

export async function appLang(): Promise<AppLang> {
  const v = (await cookies()).get(LANG_COOKIE)?.value
  return isAppLang(v) ? v : 'en'
}
