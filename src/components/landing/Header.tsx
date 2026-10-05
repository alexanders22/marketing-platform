"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowRight, Check, ChevronDown, Globe, Menu, X } from "lucide-react";
import { Logo } from "./Logo";
import { COPY, LANG_META, LANGS, localePath, switchPath, type Lang } from "./i18n";
import { CONTACT, featureHref, featuresFor, integrationsFor, resourcesFor, type Feature } from "./site";

type MenuKey = "features" | "integrations" | "resources";

export function Header({ lang = "en" }: { lang?: Lang }) {
  const c = COPY[lang];
  const MENUS: { key: MenuKey; label: string }[] = [
    { key: "features", label: c.nav.features },
    { key: "integrations", label: c.nav.integrations },
    { key: "resources", label: c.nav.resources },
  ];
  const [menu, setMenu] = useState<MenuKey | null>(null);
  const [mobile, setMobile] = useState(false);
  const closeTimer = useRef<number | undefined>(undefined);

  const openMenu = (k: MenuKey) => {
    window.clearTimeout(closeTimer.current);
    setMenu(k);
  };
  // Short delay so the pointer can travel from the trigger to the panel.
  const closeSoon = () => {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setMenu(null), 150);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenu(null);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(closeTimer.current);
    };
  }, []);

  return (
    <header className="sticky top-0 z-50 border-b border-white/5 bg-zinc-950/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href={localePath(lang, "/")} aria-label={c.nav.home}>
          <Logo />
        </Link>

        <nav className="hidden items-center gap-1 text-sm md:flex" aria-label="Main">
          {MENUS.map((m) => (
            <button
              key={m.key}
              type="button"
              aria-expanded={menu === m.key}
              aria-controls={`menu-${m.key}`}
              onMouseEnter={() => openMenu(m.key)}
              onMouseLeave={closeSoon}
              onClick={() => (menu === m.key ? setMenu(null) : openMenu(m.key))}
              className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 transition ${
                menu === m.key ? "bg-white/10 text-white" : "text-zinc-400 hover:text-white"
              }`}
            >
              {m.label}
              <ChevronDown size={14} className={`transition ${menu === m.key ? "rotate-180" : ""}`} />
            </button>
          ))}
          <Link href={localePath(lang, "/#pricing")} className="rounded-lg px-3 py-1.5 text-zinc-400 transition hover:text-white">
            {c.nav.pricing}
          </Link>
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <LanguageSwitcher lang={lang} />
          <Link href="/login" className="text-sm text-zinc-300 transition hover:text-white">
            {c.nav.login}
          </Link>
          <Link
            href="/signup"
            className="rounded-full bg-white px-4 py-1.5 text-sm font-medium text-zinc-950 transition hover:bg-zinc-200"
          >
            {c.nav.tryFree}
          </Link>
        </div>

        <div className="flex items-center gap-1 md:hidden">
          <LanguageSwitcher lang={lang} compact />
          <button
            className="rounded-lg p-2 text-zinc-300"
            onClick={() => setMobile((v) => !v)}
            aria-label={mobile ? c.nav.closeMenu : c.nav.openMenu}
            aria-expanded={mobile}
          >
            {mobile ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Desktop mega menu */}
      <div
        className={`fixed top-16 left-1/2 hidden w-full -translate-x-1/2 px-4 pt-3 transition duration-150 md:block ${
          menu === "resources" ? "max-w-[760px]" : "max-w-[1060px]"
        } ${menu ? "visible opacity-100" : "invisible -translate-y-1 opacity-0"}`}
        onMouseEnter={() => window.clearTimeout(closeTimer.current)}
        onMouseLeave={closeSoon}
      >
        <div className="max-h-[calc(100vh-6rem)] overflow-y-auto rounded-3xl border border-white/10 bg-zinc-950 p-3 shadow-2xl shadow-black/60">
          {menu === "features" && <FeaturesPanel lang={lang} onPick={() => setMenu(null)} />}
          {menu === "integrations" && <IntegrationsPanel lang={lang} onPick={() => setMenu(null)} />}
          {menu === "resources" && <ResourcesPanel lang={lang} onPick={() => setMenu(null)} />}
        </div>
      </div>

      {mobile && <MobileMenu lang={lang} onClose={() => setMobile(false)} />}
    </header>
  );
}

/* ─── Panels ───────────────────────────────────────────────────────────── */

function Badge({ status, lang }: { status: Feature["status"]; lang: Lang }) {
  if (status === "live") return null;
  return status === "new" ? (
    <span className="rounded-full bg-emerald-400/15 px-1.5 py-px text-[10px] font-semibold text-emerald-300 uppercase">{COPY[lang].badges.new}</span>
  ) : (
    <span className="rounded-full bg-zinc-700/60 px-1.5 py-px text-[10px] font-semibold text-zinc-300 uppercase">{COPY[lang].badges.soon}</span>
  );
}

function FeatureCard({ f, wide, onPick, lang, className = "" }: { f: Feature; wide?: boolean; onPick: () => void; lang: Lang; className?: string }) {
  return (
    <Link
      href={featureHref(f.slug, lang)}
      onClick={onPick}
      className={`group relative overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/60 p-4 transition duration-200 hover:-translate-y-0.5 hover:border-white/20 hover:bg-zinc-900 ${
        wide ? "grid grid-cols-[1fr_1.1fr] items-center gap-4" : ""
      } ${className}`}
    >
      <span
        aria-hidden
        className={`pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t ${f.glow} to-transparent opacity-60 transition group-hover:opacity-100`}
      />
      <div className="relative">
        <span className={`grid h-8 w-8 place-items-center rounded-lg ${f.tint}`}>
          <f.icon size={15} />
        </span>
        <p className="mt-2.5 flex items-center gap-1.5 text-sm font-semibold text-white">
          {f.title} <Badge status={f.status} lang={lang} />
        </p>
        <p className="mt-1 text-xs leading-relaxed text-zinc-400">{f.short}</p>
      </div>
      <div className={`relative ${wide ? "" : "mt-4"}`}>
        <Preview slug={f.slug} />
      </div>
    </Link>
  );
}

function FeaturesPanel({ onPick, lang }: { onPick: () => void; lang: Lang }) {
  const [a, b, c, d, ...rest] = featuresFor(lang);
  return (
    <div id="menu-features" className="space-y-3">
      <div className="grid grid-cols-4 gap-3">
        {[a, b, c, d].map((f) => (
          <FeatureCard key={f.slug} f={f} onPick={onPick} lang={lang} />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {rest.map((f, i) => (
          <FeatureCard key={f.slug} f={f} wide onPick={onPick} lang={lang} className={rest.length % 2 && i === rest.length - 1 ? "col-span-2" : ""} />
        ))}
      </div>
    </div>
  );
}

function IntegrationsPanel({ onPick, lang }: { onPick: () => void; lang: Lang }) {
  const m = COPY[lang].menu;
  return (
    <div id="menu-integrations">
      <div className="grid grid-cols-4 gap-1">
        {integrationsFor(lang).map((n) => (
          <div key={n.name} className="flex items-start gap-3 rounded-xl px-3 py-2.5 transition hover:bg-white/5">
            <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-zinc-900 text-zinc-200 ring-1 ring-white/10">
              <n.icon size={14} />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium text-white">{n.name}</span>
              <span className="block truncate text-xs text-zinc-500">{n.body}</span>
            </span>
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between gap-4 border-t border-white/5 px-3 pt-3 pb-1 text-xs">
        <span className="text-zinc-500">{m.integrationsNote}</span>
        <span className="flex shrink-0 gap-4">
          <Link href={featureHref("api", lang)} onClick={onPick} className="inline-flex items-center gap-1 text-zinc-300 hover:text-white">
            {m.partnerApi} <ArrowRight size={12} />
          </Link>
          <a href={CONTACT} className="inline-flex items-center gap-1 text-zinc-300 hover:text-white">
            {m.requestNetwork} <ArrowRight size={12} />
          </a>
        </span>
      </div>
    </div>
  );
}

function ResourcesPanel({ onPick, lang }: { onPick: () => void; lang: Lang }) {
  return (
    <div id="menu-resources" className="grid grid-cols-2 gap-3 p-2">
      {resourcesFor(lang).map((col) => (
        <div key={col.title}>
          <p className="px-3 pb-2 text-[11px] font-semibold tracking-wider text-zinc-500 uppercase">{col.title}</p>
          {col.links.map((l) => (
            <a
              key={l.label}
              href={l.href}
              onClick={onPick}
              className="flex items-start gap-3 rounded-xl px-3 py-2.5 transition hover:bg-white/5"
            >
              <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-zinc-900 text-zinc-300 ring-1 ring-white/10">
                <l.icon size={14} />
              </span>
              <span>
                <span className="block text-sm font-medium text-white">{l.label}</span>
                <span className="block text-xs text-zinc-500">{l.body}</span>
              </span>
            </a>
          ))}
        </div>
      ))}
    </div>
  );
}

/* ─── Mini previews (decorative) ───────────────────────────────────────── */

const bar = "rounded-full bg-white/10";

function Preview({ slug }: { slug: string }) {
  switch (slug) {
    case "publish":
      return (
        <div aria-hidden className="grid grid-cols-7 gap-1">
          {Array.from({ length: 14 }, (_, i) => (
            <span key={i} className={`h-4 rounded ${[2, 5, 9, 11].includes(i) ? "bg-emerald-400/40" : "bg-white/5"}`} />
          ))}
        </div>
      );
    case "campaigns":
      return (
        <div aria-hidden className="space-y-1.5">
          {[80, 60, 70].map((w, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded bg-sky-400/40" />
              <span className={`h-1.5 ${bar}`} style={{ width: `${w}%` }} />
            </div>
          ))}
        </div>
      );
    case "design":
      return (
        <div aria-hidden className="flex h-[52px] gap-1.5">
          <span className="w-1/3 rounded-md bg-gradient-to-br from-indigo-400/50 to-fuchsia-400/30" />
          <span className="flex w-2/3 flex-col justify-center gap-1.5 rounded-md bg-white/5 p-2">
            <span className={`h-1.5 w-3/4 ${bar}`} />
            <span className={`h-1.5 w-1/2 ${bar}`} />
          </span>
        </div>
      );
    case "bio":
      return (
        <div aria-hidden className="mx-auto flex w-24 flex-col items-center gap-1 rounded-lg bg-white/5 p-1.5">
          <span className="h-3.5 w-3.5 rounded-full bg-fuchsia-400/50" />
          <span className="h-2 w-full rounded bg-fuchsia-400/30" />
          <span className="h-2 w-full rounded bg-fuchsia-400/30" />
        </div>
      );
    case "inbox":
      return (
        <div aria-hidden className="space-y-1.5">
          {["bg-orange-400/40", "bg-sky-400/40", "bg-zinc-400/40"].map((c, i) => (
            <div key={i} className="flex items-center gap-2 rounded-md bg-white/5 px-2 py-1.5">
              <span className={`h-3 w-3 rounded-full ${c}`} />
              <span className={`h-1.5 flex-1 ${bar}`} />
            </div>
          ))}
        </div>
      );
    case "workflows":
      return (
        <div aria-hidden className="space-y-1.5">
          {["Trigger", "AI step", "Action"].map((t) => (
            <div key={t} className="flex items-center gap-2 rounded-md bg-white/5 px-2 py-1.5 text-[10px] text-zinc-400">
              <span className="h-3 w-3 rounded border border-rose-400/50" />
              {t}
            </div>
          ))}
        </div>
      );
    case "api":
      return (
        <pre aria-hidden className="rounded-md bg-black/40 p-2 font-mono text-[10px] leading-relaxed text-zinc-400 ring-1 ring-white/5">
          {`POST /api/v1/workspaces\n{ "externalId": "agency_42" }\n`}
          <span className="text-emerald-400">201 Created</span>
        </pre>
      );
    case "ads":
      return (
        <div aria-hidden className="flex h-[60px] items-end gap-1 rounded-md bg-white/5 p-2">
          {[30, 45, 38, 60, 52, 75, 90].map((h, i) => (
            <span key={i} className="flex-1 rounded-sm bg-amber-400/40" style={{ height: `${h}%` }} />
          ))}
        </div>
      );
    default:
      return null;
  }
}

/* ─── Mobile ───────────────────────────────────────────────────────────── */

function MobileMenu({ onClose, lang }: { onClose: () => void; lang: Lang }) {
  const c = COPY[lang];
  const [section, setSection] = useState<MenuKey | null>(null);
  const toggle = (k: MenuKey) => setSection((s) => (s === k ? null : k));
  const row = "flex w-full items-center justify-between py-3 text-zinc-200";

  return (
    <nav aria-label="Mobile" className="max-h-[calc(100vh-4rem)] overflow-y-auto border-t border-white/5 px-4 pb-5 md:hidden">
      <button className={row} aria-expanded={section === "features"} onClick={() => toggle("features")}>
        {c.nav.features} <ChevronDown size={16} className={section === "features" ? "rotate-180" : ""} />
      </button>
      {section === "features" && (
        <div className="space-y-1 pb-2">
          {featuresFor(lang).map((f) => (
            <Link key={f.slug} href={featureHref(f.slug, lang)} onClick={onClose} className="flex items-center gap-3 rounded-lg px-2 py-2">
              <span className={`grid h-7 w-7 place-items-center rounded-lg ${f.tint}`}>
                <f.icon size={14} />
              </span>
              <span className="text-sm text-zinc-300">{f.title}</span>
              <Badge status={f.status} lang={lang} />
            </Link>
          ))}
        </div>
      )}

      <button className={row} aria-expanded={section === "integrations"} onClick={() => toggle("integrations")}>
        {c.nav.integrations} <ChevronDown size={16} className={section === "integrations" ? "rotate-180" : ""} />
      </button>
      {section === "integrations" && (
        <div className="grid grid-cols-2 gap-1 pb-2">
          {integrationsFor(lang).map((n) => (
            <span key={n.name} className="flex items-center gap-2 px-2 py-1.5 text-sm text-zinc-400">
              <n.icon size={13} /> {n.name}
            </span>
          ))}
        </div>
      )}

      <button className={row} aria-expanded={section === "resources"} onClick={() => toggle("resources")}>
        {c.nav.resources} <ChevronDown size={16} className={section === "resources" ? "rotate-180" : ""} />
      </button>
      {section === "resources" && (
        <div className="space-y-1 pb-2">
          {resourcesFor(lang).flatMap((col) => col.links).map((l) => (
            <a key={l.label} href={l.href} onClick={onClose} className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm text-zinc-300">
              <l.icon size={14} /> {l.label}
            </a>
          ))}
        </div>
      )}

      <Link href={localePath(lang, "/#pricing")} onClick={onClose} className="block py-3 text-zinc-200">
        {c.nav.pricing}
      </Link>
      <Link href="/login" className="block py-3 text-zinc-200">
        {c.nav.login}
      </Link>
      <Link
        href="/signup"
        onClick={onClose}
        className="mt-2 block rounded-full bg-white py-2.5 text-center text-sm font-medium text-zinc-950"
      >
        {c.nav.tryFree}
      </Link>
    </nav>
  );
}

/* ─── Language ─────────────────────────────────────────────────────────── */

// Remembered for the next visit to / (see src/proxy.ts).
const rememberLang = (l: Lang) => {
  document.cookie = `lp_lang=${l}; path=/; max-age=31536000; samesite=lax`;
};

// The same page in English, Georgian or Russian; the choice is remembered.
function LanguageSwitcher({ lang, compact = false }: { lang: Lang; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const pathname = usePathname();
  const router = useRouter();
  const box = useRef<HTMLDivElement>(null);
  const label = COPY[lang].nav.language;

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);

  const go = (to: Lang) => {
    setOpen(false);
    if (to === lang) return;
    rememberLang(to);
    router.push(switchPath(pathname, to) + window.location.hash);
  };

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${LANG_META[lang].native}`}
        onClick={() => {
          setActive(LANGS.indexOf(lang));
          setOpen((v) => !v);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setActive(LANGS.indexOf(lang));
            setOpen(true);
          }
        }}
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-sm transition ${
          open ? "border-white/25 bg-white/10 text-white" : "border-white/10 text-zinc-300 hover:border-white/20 hover:text-white"
        }`}
      >
        <Globe size={14} className="opacity-80" />
        <span className="font-medium">{LANG_META[lang].short}</span>
        {!compact && <ChevronDown size={13} className={`transition ${open ? "rotate-180" : ""}`} />}
      </button>
      {open && (
        <ul
          role="listbox"
          aria-label={label}
          tabIndex={-1}
          ref={(el) => el?.focus()}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
            else if (e.key === "ArrowDown") setActive((i) => (i + 1) % LANGS.length);
            else if (e.key === "ArrowUp") setActive((i) => (i - 1 + LANGS.length) % LANGS.length);
            else if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              go(LANGS[active]);
            } else return;
            e.preventDefault();
          }}
          className="absolute top-full right-0 z-[60] mt-2 w-52 origin-top-right rounded-2xl border border-white/10 bg-zinc-950/95 p-1.5 shadow-2xl shadow-black/60 outline-none backdrop-blur"
        >
          {LANGS.map((l, i) => (
            <li
              key={l}
              role="option"
              aria-selected={l === lang}
              onMouseEnter={() => setActive(i)}
              onClick={() => go(l)}
              className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                i === active ? "bg-white/10 text-white" : "text-zinc-300"
              }`}
            >
              <span className="text-lg leading-none" aria-hidden>
                {LANG_META[l].flag}
              </span>
              <span className="flex-1">
                <span className="block font-medium">{LANG_META[l].native}</span>
                <span className="block text-[11px] text-zinc-500">{LANG_META[l].short}</span>
              </span>
              {l === lang && <Check size={15} className="text-emerald-400" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
