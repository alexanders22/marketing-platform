import type { ComponentType, ReactNode } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Bot,
  CalendarDays,
  Check,
  Code2,
  Image as ImageIcon,
  Lightbulb,
  Megaphone,
  Minus,
  Palette,
  Play,
  PlugZap,
  Send,
  Sparkles,
  Target,
  TrendingUp,
  Inbox,
  Wand2,
} from "lucide-react";
import { FaLinkedinIn } from "react-icons/fa6";
import {
  SiBluesky,
  SiFacebook,
  SiGoogleads,
  SiInstagram,
  SiPinterest,
  SiTelegram,
  SiThreads,
  SiTiktok,
  SiWhatsapp,
  SiX,
  SiYoutube,
} from "react-icons/si";
import { Header } from "./Header";
import { Pricing } from "./Pricing";
import { Footer } from "./Footer";
import { COPY, localePath, type Lang } from "./i18n";
import type { Copy } from "./copy/en";
import { CONTACT } from "./site";

type Icon = ComponentType<{ size?: number; className?: string }>;


const NETWORKS: { icon: Icon; name: string; color: string }[] = [
  { icon: SiFacebook, name: "Facebook", color: "#1877F2" },
  { icon: SiInstagram, name: "Instagram", color: "#E4405F" },
  { icon: SiTiktok, name: "TikTok", color: "#ffffff" },
  { icon: SiYoutube, name: "YouTube", color: "#FF0000" },
  { icon: FaLinkedinIn, name: "LinkedIn", color: "#0A66C2" },
  { icon: SiX, name: "X", color: "#ffffff" },
  { icon: SiThreads, name: "Threads", color: "#ffffff" },
  { icon: SiTelegram, name: "Telegram", color: "#26A5E4" },
  { icon: SiPinterest, name: "Pinterest", color: "#BD081C" },
  { icon: SiBluesky, name: "Bluesky", color: "#0285FF" },
  { icon: SiWhatsapp, name: "WhatsApp", color: "#25D366" },
  { icon: SiGoogleads, name: "Google Ads", color: "#4285F4" },
];

// The marketing page in one language (/, /ka, /ru).
export function Landing({ lang }: { lang: Lang }) {
  const c = COPY[lang];
  return (
    <div className="overflow-x-clip">
      <Header lang={lang} />
      <main>
        <Hero c={c} lang={lang} />
        <ModelStrip c={c} />
        <OneBrief c={c} />
        <Steps c={c} />
        <Features c={c} />
        <Partners c={c} />
        <Comparison c={c} />
        <ReplaceAgency c={c} lang={lang} />
        <section id="pricing" className="border-y border-white/5 bg-zinc-900/30 py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <SectionHead eyebrow={c.pricing.eyebrow} title={c.pricing.title} sub={c.pricing.sub} />
            <Pricing lang={lang} />
          </div>
        </section>
        <WhatYouGet c={c} />
        <FinalCta c={c} />
      </main>
      <Footer lang={lang} />
    </div>
  );
}

/* ─── Building blocks ──────────────────────────────────────────────────── */

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span className="inline-block rounded-full border border-white/10 bg-zinc-900 px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-zinc-300">
      {children}
    </span>
  );
}

function SectionHead({ eyebrow, title, sub }: { eyebrow: string; title: ReactNode; sub?: string }) {
  return (
    <div className="mx-auto mb-14 max-w-2xl text-center">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="mt-5 text-3xl font-semibold tracking-tight text-balance sm:text-5xl">{title}</h2>
      {sub && <p className="mt-5 text-zinc-400 text-pretty sm:text-lg">{sub}</p>}
    </div>
  );
}

function IconTile({ icon: I, tint }: { icon: Icon; tint: string }) {
  return (
    <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${tint}`}>
      <I size={18} />
    </span>
  );
}

function Card({ children, className = "", solid = false }: { children: ReactNode; className?: string; solid?: boolean }) {
  return (
    <div className={`rounded-2xl border border-white/10 ${solid ? "bg-zinc-900" : "bg-zinc-900/60"} ${className}`}>
      {children}
    </div>
  );
}

function PrimaryCta({ children, href = "/signup" }: { children: ReactNode; href?: string }) {
  return (
    <a
      href={href}
      className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-medium text-zinc-950 transition hover:bg-zinc-200"
    >
      {children}
      <ArrowRight size={16} />
    </a>
  );
}

/* ─── Hero ─────────────────────────────────────────────────────────────── */

function Hero({ c, lang }: { c: Copy; lang: Lang }) {
  return (
    <section className="relative">
      <div className="glow pointer-events-none absolute inset-0" />
      <div className="grid-fade pointer-events-none absolute inset-0" />
      <div className="relative mx-auto grid max-w-6xl items-center gap-16 px-4 pt-20 pb-24 sm:px-6 lg:grid-cols-2 lg:pt-28">
        <div className="min-w-0">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-zinc-900/80 px-3 py-1 text-xs text-zinc-300">
            <span className="rounded-full bg-orange-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-orange-300">
              {c.badges.new}
            </span>
            {c.hero.badge}
          </span>
          {/* Georgian and Russian words run long: a step smaller so the headline fits small phones. */}
          <h1
            className={`mt-6 leading-[1.08] font-semibold tracking-tight text-balance ${lang === "ka" ? "text-4xl sm:text-5xl" : lang === "ru" ? "text-4xl sm:text-6xl" : "text-5xl sm:text-6xl"}`}
          >
            {c.hero.title}
          </h1>
          <p className="mt-6 max-w-xl text-lg text-zinc-400 text-pretty">
            {c.hero.sub}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <PrimaryCta>{c.hero.start}</PrimaryCta>
            <a
              href="#how"
              className="inline-flex items-center gap-2 rounded-full border border-white/10 px-5 py-2.5 text-sm font-medium transition hover:bg-white/5"
            >
              <Play size={14} />
              {c.hero.how}
            </a>
          </div>
          <div className="mt-10 flex max-w-md flex-wrap gap-3">
            {NETWORKS.map((n) => (
              <span
                key={n.name}
                title={n.name}
                className="grid h-8 w-8 place-items-center rounded-lg bg-zinc-900 ring-1 ring-white/10"
              >
                <n.icon size={15} className="opacity-90" />
              </span>
            ))}
          </div>
        </div>

        <HeroMockup m={c.hero.mock} />
      </div>
    </section>
  );
}

function HeroMockup({ m }: { m: Copy["hero"]["mock"] }) {
  return (
    <div className="relative mx-auto h-[500px] w-full max-w-[520px]" aria-hidden>
      {/* Post preview */}
      <Card solid className="float absolute top-0 right-0 z-10 w-[280px] p-4 shadow-2xl shadow-black/60">
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-orange-400 to-pink-500 text-xs font-bold">
            B
          </span>
          <div className="text-xs">
            <p className="font-semibold">Bloom Bakery</p>
            <p className="text-zinc-500">{m.when}</p>
          </div>
          <SiInstagram size={14} className="ml-auto text-pink-400" />
        </div>
        <p className="mt-3 text-[13px] leading-snug text-zinc-300">
          {m.post}
        </p>
        <div className="mt-3 h-32 rounded-lg bg-[linear-gradient(135deg,#f59e0b_0%,#ef4444_45%,#7c3aed_100%)] opacity-80" />
        <div className="mt-3 flex items-center justify-between text-[11px]">
          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-300">{m.scheduled}</span>
          <span className="text-zinc-500">{m.aiWritten}</span>
        </div>
      </Card>

      {/* Ad campaign stats */}
      <Card solid className="float-delay absolute top-28 left-0 z-20 w-[250px] p-4 shadow-2xl shadow-black/60">
        <div className="flex items-center gap-2 text-xs">
          <Megaphone size={14} className="text-orange-300" />
          <span className="font-semibold">{m.campaign}</span>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          {[
            { k: m.spend, v: "₾184" },
            { k: m.leads, v: "37" },
            { k: m.cpl, v: "₾4.97" },
          ].map((m) => (
            <div key={m.k} className="rounded-lg bg-zinc-950/70 py-2">
              <p className="text-[10px] text-zinc-500">{m.k}</p>
              <p className="text-sm font-semibold">{m.v}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 flex h-12 items-end gap-1">
          {[30, 42, 38, 55, 48, 62, 70, 66, 80, 76, 88, 92].map((h, i) => (
            <span key={i} className="flex-1 rounded-sm bg-orange-400/70" style={{ height: `${h}%` }} />
          ))}
        </div>
      </Card>

      {/* AI recommendation */}
      <Card solid className="float absolute right-0 bottom-0 z-30 w-[290px] sm:right-auto sm:left-16 sm:w-[300px] border-violet-400/30 p-4 shadow-2xl shadow-black/60">
        <div className="flex items-center gap-2 text-xs">
          <Lightbulb size={14} className="text-violet-300" />
          <span className="font-semibold">{m.recommendation}</span>
          <span className="ml-auto rounded-full bg-violet-400/15 px-2 py-0.5 text-[10px] text-violet-200">
            −31% CPL
          </span>
        </div>
        <p className="mt-2 text-[13px] leading-snug text-zinc-300">
          {m.recText}
        </p>
        <div className="mt-3 flex gap-2">
          <span className="rounded-md bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-950">{m.apply}</span>
          <span className="rounded-md border border-white/10 px-2.5 py-1 text-[11px]">{m.details}</span>
        </div>
      </Card>
    </div>
  );
}

/* ─── Model strip ──────────────────────────────────────────────────────── */

function ModelStrip({ c }: { c: Copy }) {
  const items = c.strip.items;
  return (
    <section className="border-y border-white/5 bg-zinc-900/30 py-10">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <p className="text-center text-xs font-medium uppercase tracking-wider text-zinc-500">
          {c.strip.title}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-x-8 gap-y-3 text-sm text-zinc-300">
          {items.map((t) => (
            <span key={t} className="inline-flex items-center gap-2">
              <Sparkles size={14} className="text-zinc-500" />
              {t}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── One brief → a month ──────────────────────────────────────────────── */

function OneBrief({ c }: { c: Copy }) {
  const looks = [
    { icon: Wand2, tint: "bg-orange-400/15 text-orange-300" },
    { icon: ImageIcon, tint: "bg-sky-400/15 text-sky-300" },
    { icon: Target, tint: "bg-violet-400/15 text-violet-300" },
  ];
  const points = c.brief.points.map((p, i) => ({ ...looks[i], ...p }));
  return (
    <section className="py-24">
      <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 sm:px-6 lg:grid-cols-2">
        <div>
          <Eyebrow>{c.brief.eyebrow}</Eyebrow>
          <h2 className="mt-5 text-3xl font-semibold tracking-tight text-balance sm:text-5xl">{c.brief.title}</h2>
          <div className="mt-10 space-y-7">
            {points.map((p) => (
              <div key={p.title} className="flex gap-4">
                <IconTile icon={p.icon} tint={p.tint} />
                <div>
                  <h3 className="font-semibold">{p.title}</h3>
                  <p className="mt-1 text-sm text-zinc-400">{p.body}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-10">
            <PrimaryCta>{c.brief.cta}</PrimaryCta>
          </div>
        </div>
        <CalendarMockup k={c.brief.calendar} />
      </div>
    </section>
  );
}

function CalendarMockup({ k }: { k: Copy["brief"]["calendar"] }) {
  const days = k.days;
  const slots: Record<number, { c: string; t: string }[]> = {
    0: [{ c: "bg-sky-400/20 text-sky-200", t: k.carousel }],
    1: [{ c: "bg-orange-400/20 text-orange-200", t: k.promo }],
    2: [{ c: "bg-pink-400/20 text-pink-200", t: k.reel }],
    4: [
      { c: "bg-sky-400/20 text-sky-200", t: k.post },
      { c: "bg-orange-400/20 text-orange-200", t: k.retarget },
    ],
    5: [{ c: "bg-pink-400/20 text-pink-200", t: k.story }],
    8: [{ c: "bg-sky-400/20 text-sky-200", t: k.post }],
    9: [{ c: "bg-pink-400/20 text-pink-200", t: k.reel }],
    11: [{ c: "bg-orange-400/20 text-orange-200", t: k.launch }],
    12: [{ c: "bg-sky-400/20 text-sky-200", t: k.carousel }],
  };
  return (
    <Card className="p-5" aria-hidden>
      <div className="mb-4 flex items-center justify-between">
        <span className="inline-flex items-center gap-2 text-sm font-semibold">
          <CalendarDays size={16} /> {k.month}
        </span>
        <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs text-emerald-300">
          {k.auto}
        </span>
      </div>
      <div className="grid grid-cols-7 gap-1.5 text-[10px] text-zinc-500">
        {days.map((d) => (
          <span key={d} className="pb-1 text-center">
            {d}
          </span>
        ))}
        {Array.from({ length: 14 }).map((_, i) => (
          <div key={i} className="min-h-20 rounded-lg bg-zinc-950/60 p-1.5">
            <span className="text-zinc-600">{i + 1}</span>
            <div className="mt-1 space-y-1">
              {(slots[i] ?? []).map((s) => (
                <span key={s.t} className={`block truncate rounded px-1 py-0.5 text-[9px] ${s.c}`}>
                  {s.t}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ─── Steps ────────────────────────────────────────────────────────────── */

function Steps({ c }: { c: Copy }) {
  const looks = [
    { icon: PlugZap, tint: "bg-orange-400/15 text-orange-300" },
    { icon: BarChart3, tint: "bg-sky-400/15 text-sky-300" },
    { icon: Sparkles, tint: "bg-violet-400/15 text-violet-300" },
    { icon: TrendingUp, tint: "bg-emerald-400/15 text-emerald-300" },
  ];
  const steps = c.steps.items.map((s, i) => ({ ...looks[i], ...s }));
  return (
    <section id="how" className="py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHead eyebrow={c.steps.eyebrow} title={c.steps.title} sub={c.steps.sub} />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <Card key={s.title} className="p-6">
              <div className="flex items-center justify-between">
                <IconTile icon={s.icon} tint={s.tint} />
                <span className="text-sm font-medium text-zinc-600">0{i + 1}</span>
              </div>
              <h3 className="mt-6 font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm text-zinc-400">{s.body}</p>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Features ─────────────────────────────────────────────────────────── */

function Features({ c }: { c: Copy }) {
  const looks = [
    { icon: Wand2, tint: "bg-orange-400/15 text-orange-300", wide: true },
    { icon: ImageIcon, tint: "bg-sky-400/15 text-sky-300" },
    { icon: Megaphone, tint: "bg-pink-400/15 text-pink-300" },
    { icon: BarChart3, tint: "bg-violet-400/15 text-violet-300", wide: true },
    { icon: Palette, tint: "bg-emerald-400/15 text-emerald-300" },
    { icon: Inbox, tint: "bg-amber-400/15 text-amber-300" },
    { icon: CalendarDays, tint: "bg-cyan-400/15 text-cyan-300" },
  ];
  const items = c.suite.items.map((f, i) => ({ wide: false, ...looks[i], ...f }));
  return (
    <section id="features" className="border-y border-white/5 bg-zinc-900/30 py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHead eyebrow={c.suite.eyebrow} title={c.suite.title} sub={c.suite.sub} />
        <div className="grid gap-5 md:grid-cols-3">
          {items.map((f) => (
            <Card key={f.title} className={`p-6 ${f.wide ? "md:col-span-2" : ""}`}>
              <IconTile icon={f.icon} tint={f.tint} />
              <h3 className="mt-5 text-lg font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-zinc-400">{f.body}</p>
            </Card>
          ))}
          <Card className="flex flex-col gap-4 p-6 md:col-span-3 md:flex-row md:items-center md:justify-between">
            <p className="text-sm text-zinc-400">{c.suite.networks}</p>
            <div className="flex flex-wrap gap-2">
              {NETWORKS.map((n) => (
                <span key={n.name} className="grid h-8 w-8 place-items-center rounded-lg bg-zinc-950 ring-1 ring-white/10">
                  <n.icon size={14} />
                </span>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </section>
  );
}

/* ─── Partners / API ───────────────────────────────────────────────────── */

function Partners({ c }: { c: Copy }) {
  const t = c.partners;
  return (
    <section id="partners" className="py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHead eyebrow={t.eyebrow} title={t.title} sub={t.sub} />
        <div className="grid gap-5 lg:grid-cols-2">
          <Card className="min-w-0 p-7">
            <IconTile icon={Code2} tint="bg-sky-400/15 text-sky-300" />
            <h3 className="mt-5 text-xl font-semibold">{t.apiTitle}</h3>
            <p className="mt-2 text-sm text-zinc-400">{t.apiBody}</p>
            <pre className="mt-6 overflow-x-auto rounded-xl bg-zinc-950 p-4 text-[12px] leading-relaxed text-zinc-300 ring-1 ring-white/5">
              <code>{`POST /api/v1/workspaces
Authorization: Bearer lp_live_…

{ "externalId": "agency_42",
  "name": "Sunrise Realty" }`}</code>
            </pre>
            <ul className="mt-6 space-y-2 text-sm text-zinc-300">
              {t.apiPoints.map(
                (t) => (
                  <li key={t} className="flex items-center gap-2">
                    <Check size={15} className="text-emerald-400" />
                    {t}
                  </li>
                ),
              )}
            </ul>
          </Card>
          <Card className="min-w-0 p-7">
            <IconTile icon={Bot} tint="bg-violet-400/15 text-violet-300" />
            <h3 className="mt-5 flex items-center gap-2 text-xl font-semibold">
              {t.mcpTitle}
              <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-300 uppercase">{c.badges.new}</span>
            </h3>
            <p className="mt-2 text-sm text-zinc-400">{t.mcpBody}</p>
            <div className="mt-6 space-y-3 rounded-xl bg-zinc-950 p-4 text-[13px] ring-1 ring-white/5">
              <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-white px-3 py-2 text-zinc-950">
                {t.mcpQ}
              </p>
              <p className="w-fit max-w-[90%] rounded-2xl rounded-bl-sm bg-zinc-800 px-3 py-2 text-zinc-200">
                {t.mcpA}
              </p>
            </div>
            <Link href="/docs#mcp" className="mt-6 inline-flex items-center gap-1 text-sm font-medium text-white hover:underline">
              {t.mcpLink} <ArrowRight size={14} />
            </Link>
          </Card>
        </div>
      </div>
    </section>
  );
}

/* ─── Comparison ───────────────────────────────────────────────────────── */

function Comparison({ c }: { c: Copy }) {
  type Cell = true | false | string;
  const t = c.compare;
  const cells: [Cell, Cell, Cell][] = [
    [true, t.addOn, false],
    [true, false, t.basic],
    [true, false, false],
    [true, t.basic, t.manual],
    [true, t.some, false],
    [true, false, false],
    [true, false, false],
  ];
  const rows = t.rows.map((label, i) => [label, ...cells[i]] as [string, Cell, Cell, Cell]);
  const render = (c: Cell) =>
    c === true ? (
      <Check size={16} className="mx-auto text-emerald-400" />
    ) : c === false ? (
      <Minus size={16} className="mx-auto text-zinc-600" />
    ) : (
      <span className="text-xs text-zinc-400">{c}</span>
    );
  return (
    <section id="ads" className="py-24">
      <div className="mx-auto max-w-4xl px-4 sm:px-6">
        <SectionHead eyebrow={t.eyebrow} title={t.title} sub={t.sub} />
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-white/10 text-zinc-400">
                <th className="px-5 py-4 text-left font-medium">{t.capability}</th>
                <th className="px-3 py-4 font-semibold text-white">Loudpilot</th>
                <th className="px-3 py-4 font-medium">{t.schedulers}</th>
                <th className="px-3 py-4 font-medium">{t.adsManagers}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([label, ...cells]) => (
                <tr key={label} className="border-b border-white/5 last:border-0">
                  <td className="px-5 py-3.5 text-zinc-300">{label}</td>
                  {cells.map((c, i) => (
                    <td key={i} className={`px-3 py-3.5 text-center ${i === 0 ? "bg-white/[0.03]" : ""}`}>
                      {render(c)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </section>
  );
}

/* ─── Replace agency ───────────────────────────────────────────────────── */

function ReplaceAgency({ c, lang }: { c: Copy; lang: Lang }) {
  const t = c.agency;
  return (
    <section className="pb-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-zinc-900/60 px-6 py-16 text-center sm:px-16">
          <div className="glow pointer-events-none absolute inset-0" />
          <div className="relative">
            <Eyebrow>{t.eyebrow}</Eyebrow>
            <h2 className="mx-auto mt-5 max-w-3xl text-3xl font-semibold tracking-tight text-balance sm:text-5xl">{t.title}</h2>
            <p className="mx-auto mt-5 max-w-xl text-zinc-400">{t.sub}</p>
            <div className="mt-8 flex justify-center">
              <PrimaryCta href={localePath(lang, "/#pricing")}>{t.cta}</PrimaryCta>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── What you get ─────────────────────────────────────────────────────── */

function WhatYouGet({ c }: { c: Copy }) {
  const looks = [
    { icon: Palette, tint: "bg-orange-400/15 text-orange-300" },
    { icon: Megaphone, tint: "bg-pink-400/15 text-pink-300" },
    { icon: Lightbulb, tint: "bg-violet-400/15 text-violet-300" },
    { icon: Send, tint: "bg-sky-400/15 text-sky-300" },
  ];
  const items = c.get.items.map((it, i) => ({ ...looks[i], ...it }));
  return (
    <section className="py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHead eyebrow={c.get.eyebrow} title={c.get.title} sub={c.get.sub} />
        <div className="grid gap-5 md:grid-cols-2">
          {items.map((it) => (
            <Card key={it.title} className="p-7">
              <IconTile icon={it.icon} tint={it.tint} />
              <h3 className="mt-5 text-lg font-semibold">{it.title}</h3>
              <p className="mt-2 text-sm text-zinc-400">{it.body}</p>
              <span className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-zinc-950 px-2.5 py-1 text-xs text-zinc-300 ring-1 ring-white/10">
                <Check size={12} className="text-emerald-400" />
                {it.tag}
              </span>
            </Card>
          ))}
        </div>
        <Card className="mt-5 flex flex-col gap-5 p-7 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-lg font-semibold">{c.get.calendarTitle}</h3>
            <p className="mt-1 text-sm text-zinc-400">{c.get.calendarBody}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {NETWORKS.map((n) => (
              <span key={n.name} title={n.name} className="grid h-8 w-8 place-items-center rounded-lg bg-zinc-950 ring-1 ring-white/10">
                <n.icon size={14} />
              </span>
            ))}
          </div>
        </Card>
      </div>
    </section>
  );
}

/* ─── Final CTA ────────────────────────────────────────────────────────── */

function FinalCta({ c }: { c: Copy }) {
  const t = c.final;
  return (
    <section id="contact" className="pb-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-zinc-900/60 px-6 py-20 text-center">
          <div className="grid-fade pointer-events-none absolute inset-0" />
          <div className="relative">
            <h2 className="mx-auto max-w-2xl text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
              {t.title}
            </h2>
            <p className="mx-auto mt-5 max-w-lg text-zinc-400">
              {t.sub}
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <PrimaryCta>{t.start}</PrimaryCta>
              <a
                href={CONTACT}
                className="inline-flex items-center rounded-full border border-white/10 px-5 py-2.5 text-sm font-medium transition hover:bg-white/5"
              >
                {t.demo}
              </a>
            </div>
            <p className="mt-5 text-xs text-zinc-500">{t.note}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
