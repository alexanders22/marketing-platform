import type { ComponentType, ReactNode } from "react";
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
  UserPlus,
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
import { Header } from "@/components/landing/Header";
import { Pricing } from "@/components/landing/Pricing";
import { Footer } from "@/components/landing/Footer";
import { CONTACT, featureHref } from "@/components/landing/site";

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

export default function Home() {
  return (
    <div className="overflow-x-clip">
      <Header />
      <main>
        <Hero />
        <ModelStrip />
        <OneBrief />
        <Steps />
        <Features />
        <Partners />
        <Comparison />
        <ReplaceAgency />
        <section id="pricing" className="border-y border-white/5 bg-zinc-900/30 py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <SectionHead
              eyebrow="Pricing"
              title="Clear pricing. No surprises."
              sub="Pick the number of seats, profiles and AI credits you need. Every plan has every feature — try any of them free for 7 days."
            />
            <Pricing />
          </div>
        </section>
        <WhatYouGet />
        <FinalCta />
      </main>
      <Footer />
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

function Hero() {
  return (
    <section className="relative">
      <div className="glow pointer-events-none absolute inset-0" />
      <div className="grid-fade pointer-events-none absolute inset-0" />
      <div className="relative mx-auto grid max-w-6xl items-center gap-16 px-4 pt-20 pb-24 sm:px-6 lg:grid-cols-2 lg:pt-28">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-zinc-900/80 px-3 py-1 text-xs text-zinc-300">
            <span className="rounded-full bg-orange-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-orange-300">
              NEW
            </span>
            Meta Ads campaigns + AI recommendations
          </span>
          <h1 className="mt-6 text-5xl leading-[1.05] font-semibold tracking-tight text-balance sm:text-6xl">
            Content, ads and analytics. Run by AI.
          </h1>
          <p className="mt-6 max-w-xl text-lg text-zinc-400 text-pretty">
            Khma writes, designs and publishes your posts, launches your ad campaigns — then reads the results and tells
            you exactly what to change.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <PrimaryCta>Start free</PrimaryCta>
            <a
              href="#how"
              className="inline-flex items-center gap-2 rounded-full border border-white/10 px-5 py-2.5 text-sm font-medium transition hover:bg-white/5"
            >
              <Play size={14} />
              See how it works
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

        <HeroMockup />
      </div>
    </section>
  );
}

function HeroMockup() {
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
            <p className="text-zinc-500">Instagram · Fri 18:30</p>
          </div>
          <SiInstagram size={14} className="ml-auto text-pink-400" />
        </div>
        <p className="mt-3 text-[13px] leading-snug text-zinc-300">
          Fresh out of the oven: our new pistachio croissant 🥐 First 50 get a free coffee this weekend.
        </p>
        <div className="mt-3 h-32 rounded-lg bg-[linear-gradient(135deg,#f59e0b_0%,#ef4444_45%,#7c3aed_100%)] opacity-80" />
        <div className="mt-3 flex items-center justify-between text-[11px]">
          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-300">Scheduled</span>
          <span className="text-zinc-500">AI-written · on brand</span>
        </div>
      </Card>

      {/* Ad campaign stats */}
      <Card solid className="float-delay absolute top-28 left-0 z-20 w-[250px] p-4 shadow-2xl shadow-black/60">
        <div className="flex items-center gap-2 text-xs">
          <Megaphone size={14} className="text-orange-300" />
          <span className="font-semibold">Weekend promo · Meta Ads</span>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          {[
            { k: "Spend", v: "₾184" },
            { k: "Leads", v: "37" },
            { k: "CPL", v: "₾4.97" },
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
          <span className="font-semibold">Recommendation</span>
          <span className="ml-auto rounded-full bg-violet-400/15 px-2 py-0.5 text-[10px] text-violet-200">
            −31% CPL
          </span>
        </div>
        <p className="mt-2 text-[13px] leading-snug text-zinc-300">
          Ad set &ldquo;Women 25–34, Tbilisi&rdquo; brings leads 31% cheaper. Move ₾20/day from &ldquo;Broad&rdquo; and
          refresh creative #2 — its CTR fell 3 days in a row.
        </p>
        <div className="mt-3 flex gap-2">
          <span className="rounded-md bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-950">Apply</span>
          <span className="rounded-md border border-white/10 px-2.5 py-1 text-[11px]">Details</span>
        </div>
      </Card>
    </div>
  );
}

/* ─── Model strip ──────────────────────────────────────────────────────── */

function ModelStrip() {
  const items = [
    "Captions in 30+ languages, incl. Georgian",
    "Image generation",
    "Short-form video",
    "Meta & TikTok ads",
    "Daily performance sync",
    "Lead capture",
  ];
  return (
    <section className="border-y border-white/5 bg-zinc-900/30 py-10">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <p className="text-center text-xs font-medium uppercase tracking-wider text-zinc-500">
          The best AI models for text, image and video — behind one simple workflow
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

function OneBrief() {
  const points = [
    {
      icon: Wand2,
      tint: "bg-orange-400/15 text-orange-300",
      title: "Posts that sound like you",
      body: "Give it one line. Get a finished caption, hashtags and a call to action in your brand voice.",
    },
    {
      icon: ImageIcon,
      tint: "bg-sky-400/15 text-sky-300",
      title: "Visuals and video in seconds",
      body: "Images, carousels and short videos generated in your colours and style — no designer queue.",
    },
    {
      icon: Target,
      tint: "bg-violet-400/15 text-violet-300",
      title: "Ads built from the same brief",
      body: "Turn the best post into a campaign: audience, budget and creatives prepared for your approval.",
    },
  ];
  return (
    <section className="py-24">
      <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 sm:px-6 lg:grid-cols-2">
        <div>
          <Eyebrow>From idea to campaign</Eyebrow>
          <h2 className="mt-5 text-3xl font-semibold tracking-tight text-balance sm:text-5xl">
            One brief in. A month of content and ads out.
          </h2>
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
            <PrimaryCta>Try it free</PrimaryCta>
          </div>
        </div>
        <CalendarMockup />
      </div>
    </section>
  );
}

function CalendarMockup() {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const slots: Record<number, { c: string; t: string }[]> = {
    0: [{ c: "bg-sky-400/20 text-sky-200", t: "Carousel" }],
    1: [{ c: "bg-orange-400/20 text-orange-200", t: "Ad · Promo" }],
    2: [{ c: "bg-pink-400/20 text-pink-200", t: "Reel" }],
    4: [
      { c: "bg-sky-400/20 text-sky-200", t: "Post" },
      { c: "bg-orange-400/20 text-orange-200", t: "Ad · Retarget" },
    ],
    5: [{ c: "bg-pink-400/20 text-pink-200", t: "Story" }],
    8: [{ c: "bg-sky-400/20 text-sky-200", t: "Post" }],
    9: [{ c: "bg-pink-400/20 text-pink-200", t: "Reel" }],
    11: [{ c: "bg-orange-400/20 text-orange-200", t: "Ad · Launch" }],
    12: [{ c: "bg-sky-400/20 text-sky-200", t: "Carousel" }],
  };
  return (
    <Card className="p-5" aria-hidden>
      <div className="mb-4 flex items-center justify-between">
        <span className="inline-flex items-center gap-2 text-sm font-semibold">
          <CalendarDays size={16} /> October
        </span>
        <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs text-emerald-300">
          Auto-filled · best times
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

function Steps() {
  const steps = [
    {
      icon: PlugZap,
      tint: "bg-orange-400/15 text-orange-300",
      title: "Connect your brand",
      body: "Add your website, social pages and ad accounts. Khma learns your voice, colours and audience once.",
    },
    {
      icon: BarChart3,
      tint: "bg-sky-400/15 text-sky-300",
      title: "Get your audit",
      body: "We read the last 90 days of posts and ads and show what works, what wastes money and when to post.",
    },
    {
      icon: Sparkles,
      tint: "bg-violet-400/15 text-violet-300",
      title: "Approve the plan",
      body: "A month of posts and campaigns is drafted for you. Edit anything, or approve it all in one click.",
    },
    {
      icon: TrendingUp,
      tint: "bg-emerald-400/15 text-emerald-300",
      title: "Launch and improve",
      body: "Khma publishes, runs the ads, syncs results daily and suggests the next move.",
    },
  ];
  return (
    <section id="how" className="py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHead
          eyebrow="How it works"
          title="Four steps. No busywork."
          sub="Set up your brand once — every post and every campaign after that is written, designed, launched and measured for you."
        />
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

function Features() {
  const items = [
    {
      icon: Wand2,
      tint: "bg-orange-400/15 text-orange-300",
      title: "Ready-to-publish posts",
      body: "Caption, visual, hashtags and timing in one go — adapted to each network's format and limits.",
      wide: true,
    },
    {
      icon: ImageIcon,
      tint: "bg-sky-400/15 text-sky-300",
      title: "AI photo & video",
      body: "Product shots, banners and short videos from a prompt or your own photos.",
    },
    {
      icon: Megaphone,
      tint: "bg-pink-400/15 text-pink-300",
      title: "Paid ads",
      body: "Create and manage Meta and TikTok campaigns with budgets, audiences and creatives in one place.",
    },
    {
      icon: BarChart3,
      tint: "bg-violet-400/15 text-violet-300",
      title: "Analytics that explain themselves",
      body: "Reach, engagement, spend, CPL and ROAS across every account — with plain-language insights and the next best action.",
      wide: true,
    },
    {
      icon: Palette,
      tint: "bg-emerald-400/15 text-emerald-300",
      title: "Brand kit",
      body: "Voice, colours, fonts and audience applied to everything the AI creates.",
    },
    {
      icon: UserPlus,
      tint: "bg-amber-400/15 text-amber-300",
      title: "Leads straight to your CRM",
      body: "Lead-form submissions land where your sales team works — instantly, with the campaign that brought them.",
    },
    {
      icon: CalendarDays,
      tint: "bg-cyan-400/15 text-cyan-300",
      title: "Smart scheduling",
      body: "One calendar for every network, auto-filled at the times your audience is actually online.",
    },
  ];
  return (
    <section id="features" className="border-y border-white/5 bg-zinc-900/30 py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHead
          eyebrow="One suite"
          title="Everything your marketing needs — in one place"
          sub="Organic content and paid campaigns share one brand, one calendar and one set of numbers."
        />
        <div className="grid gap-5 md:grid-cols-3">
          {items.map((f) => (
            <Card key={f.title} className={`p-6 ${f.wide ? "md:col-span-2" : ""}`}>
              <IconTile icon={f.icon} tint={f.tint} />
              <h3 className="mt-5 text-lg font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-zinc-400">{f.body}</p>
            </Card>
          ))}
          <Card className="flex flex-col gap-4 p-6 md:col-span-3 md:flex-row md:items-center md:justify-between">
            <p className="text-sm text-zinc-400">Publish and advertise on every major network</p>
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

function Partners() {
  return (
    <section id="partners" className="py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHead
          eyebrow="Platform & API"
          title="Use it here — or inside the product you already run"
          sub="Khma is a platform first. Connect your SaaS, CRM or marketplace and give every one of your customers their own marketing module."
        />
        <div className="grid gap-5 lg:grid-cols-2">
          <Card className="p-7">
            <IconTile icon={Code2} tint="bg-sky-400/15 text-sky-300" />
            <h3 className="mt-5 text-xl font-semibold">Partner API</h3>
            <p className="mt-2 text-sm text-zinc-400">
              Each of your companies, agents or sellers gets an isolated workspace with its own brand, social accounts,
              campaigns and credits. You keep your UI — Khma does the marketing.
            </p>
            <pre className="mt-6 overflow-x-auto rounded-xl bg-zinc-950 p-4 text-[12px] leading-relaxed text-zinc-300 ring-1 ring-white/5">
              <code>{`POST /api/v1/workspaces
Authorization: Bearer khma_…

{ "externalId": "agency_42",
  "name": "Sunrise Realty" }`}</code>
            </pre>
            <ul className="mt-6 space-y-2 text-sm text-zinc-300">
              {["Workspace per customer, fully isolated", "Revenue share on every credit purchase", "Webhooks for posts, results and leads"].map(
                (t) => (
                  <li key={t} className="flex items-center gap-2">
                    <Check size={15} className="text-emerald-400" />
                    {t}
                  </li>
                ),
              )}
            </ul>
          </Card>
          <Card className="p-7">
            <IconTile icon={Bot} tint="bg-violet-400/15 text-violet-300" />
            <h3 className="mt-5 flex items-center gap-2 text-xl font-semibold">
              Let your AI assistant drive
              <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-300 uppercase">New</span>
            </h3>
            <p className="mt-2 text-sm text-zinc-400">
              Connect Claude, ChatGPT, Cursor or VS Code over MCP and ask in plain words: &ldquo;Plan next month&apos;s posts
              and a lead campaign for the new collection.&rdquo;
            </p>
            <div className="mt-6 space-y-3 rounded-xl bg-zinc-950 p-4 text-[13px] ring-1 ring-white/5">
              <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-white px-3 py-2 text-zinc-950">
                How did last week&apos;s ads do?
              </p>
              <p className="w-fit max-w-[90%] rounded-2xl rounded-bl-sm bg-zinc-800 px-3 py-2 text-zinc-200">
                ₾412 spent, 81 leads at ₾5.09 — 18% cheaper than the week before. Video ads beat images 2:1. Want me to
                add two more video posts to next week&apos;s plan?
              </p>
            </div>
            <a href="/docs#mcp" className="mt-6 inline-flex items-center gap-1 text-sm font-medium text-white hover:underline">
              Connect your assistant <ArrowRight size={14} />
            </a>
          </Card>
        </div>
      </div>
    </section>
  );
}

/* ─── Comparison ───────────────────────────────────────────────────────── */

function Comparison() {
  type Cell = true | false | string;
  const rows: [string, Cell, Cell, Cell][] = [
    ["AI posts, images and video", true, "Add-on", false],
    ["Paid ad campaigns", true, false, true],
    ["Organic + ads in one calendar", true, false, false],
    ["Daily results with AI recommendations", true, "Basic", "Manual"],
    ["Leads delivered to your CRM", true, false, "Export"],
    ["Georgian language & local currency", true, false, false],
    ["White-label API for platforms", true, false, false],
  ];
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
        <SectionHead
          eyebrow="Why Khma"
          title="Schedulers post. Ad managers spend. Khma does both."
          sub="And then reads the results, so every next post and every next ₾ works harder."
        />
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-white/10 text-zinc-400">
                <th className="px-5 py-4 text-left font-medium">Capability</th>
                <th className="px-3 py-4 font-semibold text-white">Khma</th>
                <th className="px-3 py-4 font-medium">Post schedulers</th>
                <th className="px-3 py-4 font-medium">Ads managers</th>
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

function ReplaceAgency() {
  return (
    <section className="pb-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-zinc-900/60 px-6 py-16 text-center sm:px-16">
          <div className="glow pointer-events-none absolute inset-0" />
          <div className="relative">
            <Eyebrow>The real comparison</Eyebrow>
            <h2 className="mx-auto mt-5 max-w-3xl text-3xl font-semibold tracking-tight text-balance sm:text-5xl">
              The output of a marketing agency — for the price of a lunch a week.
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-zinc-400">
              Agencies charge thousands a month for posts, ads and reports. Khma does the same work every day, from $29.
            </p>
            <div className="mt-8 flex justify-center">
              <PrimaryCta href="#pricing">See plans & pricing</PrimaryCta>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── What you get ─────────────────────────────────────────────────────── */

function WhatYouGet() {
  const items = [
    {
      icon: Palette,
      tint: "bg-orange-400/15 text-orange-300",
      title: "It learns your brand once",
      body: "Describe your business one time. Every caption, image and ad after that stays on voice and on style.",
      tag: "Brand kit included",
    },
    {
      icon: Megaphone,
      tint: "bg-pink-400/15 text-pink-300",
      title: "Ads without an ads specialist",
      body: "Campaign structure, audiences and budgets are prepared for you. You approve — Khma launches and watches them.",
      tag: "Meta first, TikTok next",
    },
    {
      icon: Lightbulb,
      tint: "bg-violet-400/15 text-violet-300",
      title: "Recommendations, not just charts",
      body: "Every day Khma compares results and tells you what to pause, what to scale and what to post next.",
      tag: "Daily insights",
    },
    {
      icon: Send,
      tint: "bg-sky-400/15 text-sky-300",
      title: "Months of calendar in minutes",
      body: "Turn one idea into a full campaign spread across weeks, at the hours your audience is online.",
      tag: "Auto-scheduled",
    },
  ];
  return (
    <section className="py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHead
          eyebrow="Why teams switch"
          title="What you actually get"
          sub="Not another caption generator — a marketing team that never sleeps and always shows its numbers."
        />
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
            <h3 className="text-lg font-semibold">One calendar, every network</h3>
            <p className="mt-1 text-sm text-zinc-400">Organic posts and paid campaigns side by side, from one place.</p>
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

function FinalCta() {
  return (
    <section id="contact" className="pb-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-zinc-900/60 px-6 py-20 text-center">
          <div className="grid-fade pointer-events-none absolute inset-0" />
          <div className="relative">
            <h2 className="mx-auto max-w-2xl text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
              Give your brand a voice that never goes quiet
            </h2>
            <p className="mx-auto mt-5 max-w-lg text-zinc-400">
              Connect your pages in a minute and get your first audit and content plan today.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <PrimaryCta>Start free</PrimaryCta>
              <a
                href={CONTACT}
                className="inline-flex items-center rounded-full border border-white/10 px-5 py-2.5 text-sm font-medium transition hover:bg-white/5"
              >
                Book a demo
              </a>
            </div>
            <p className="mt-5 text-xs text-zinc-500">No credit card · Cancel anytime</p>
          </div>
        </div>
      </div>
    </section>
  );
}
