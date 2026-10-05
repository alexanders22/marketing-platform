import { en, type Copy } from "./copy/en";
import { ka } from "./copy/ka";
import { ru } from "./copy/ru";

// Landing languages. English lives at /, the others under /ka and /ru.
export const LANGS = ["en", "ka", "ru"] as const;
export type Lang = (typeof LANGS)[number];
export const isLang = (v: string): v is Lang => (LANGS as readonly string[]).includes(v);

export const LANG_META: Record<Lang, { native: string; short: string; flag: string }> = {
  en: { native: "English", short: "EN", flag: "🇬🇧" },
  ka: { native: "ქართული", short: "KA", flag: "🇬🇪" },
  ru: { native: "Русский", short: "RU", flag: "🇷🇺" },
};

export const COPY: Record<Lang, Copy> = { en, ka, ru };

// "/features/x" → "/ka/features/x"; "/#pricing" → "/ka#pricing".
export function localePath(lang: Lang, path: string) {
  if (lang === "en") return path;
  if (path === "/") return `/${lang}`;
  if (path.startsWith("/#")) return `/${lang}${path.slice(1)}`;
  return `/${lang}${path}`;
}

// The same page in another language, from the current pathname.
export function switchPath(pathname: string, to: Lang) {
  const m = pathname.match(/^\/(ka|ru)(?=\/|$)/);
  const base = m ? pathname.slice(m[0].length) || "/" : pathname;
  return localePath(to, base);
}

// hreflang alternates for metadata.
export function alternates(path: string) {
  return {
    canonical: path,
    languages: Object.fromEntries(LANGS.map((l) => [l, localePath(l, path)])) as Record<string, string>,
  };
}
