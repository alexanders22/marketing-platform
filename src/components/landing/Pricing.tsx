"use client";

import { useState } from "react";
import Link from "next/link";
import { Building2, Check, Clapperboard, Code2, Coins, Compass, FileText, Film, ImageIcon, PenLine, Rocket, Sparkles, UserRound, Users } from "lucide-react";
import { BUNDLES } from "@/lib/plans";
import { DEFAULT_PRICING } from "@/lib/pricing";
import { COPY, type Lang } from "./i18n";
import { SIGNUP } from "./site";

const PLANS = [
  {
    name: "Starter",
    id: "STARTER" as const,
    icon: Rocket,
    tint: "bg-emerald-400/15 text-emerald-300",
    veo: DEFAULT_PRICING.veoSecondsPerMonth.STARTER,
    monthly: 29,
    users: 1,
    companies: 2,
    profiles: 5,
    credits: "300",
  },
  {
    name: "Team",
    id: "TEAM" as const,
    icon: Users,
    tint: "bg-sky-400/15 text-sky-300",
    veo: DEFAULT_PRICING.veoSecondsPerMonth.TEAM,
    monthly: 79,
    users: 5,
    companies: 10,
    profiles: 20,
    credits: "1,500",
    popular: true,
  },
  {
    name: "Agency",
    id: "AGENCY" as const,
    icon: Building2,
    tint: "bg-violet-400/15 text-violet-300",
    veo: DEFAULT_PRICING.veoSecondsPerMonth.AGENCY,
    monthly: 199,
    users: 20,
    companies: 50,
    profiles: 100,
    credits: "5,000",
    api: true,
  },
];

const fmt = (n: number) => n.toLocaleString("en-US");

export function Pricing({ lang = "en" }: { lang?: Lang }) {
  const [yearly, setYearly] = useState(false);
  const t = COPY[lang].pricing;

  return (
    <div>
      <div className="mx-auto mb-10 flex w-fit rounded-full border border-white/10 bg-zinc-900 p-1 text-sm">
        {[
          { v: false, label: t.monthly },
          { v: true, label: t.yearly },
        ].map((o) => (
          <button
            key={o.label}
            onClick={() => setYearly(o.v)}
            aria-pressed={yearly === o.v}
            className={`rounded-full px-4 py-1.5 transition ${
              yearly === o.v ? "bg-white text-zinc-950" : "text-zinc-400 hover:text-white"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        {PLANS.map((p) => {
          const price = yearly ? Math.round((p.monthly * 10) / 12) : p.monthly;
          return (
            <div
              key={p.name}
              className={`relative flex flex-col rounded-2xl border bg-zinc-900/60 p-6 ${
                p.popular ? "border-white/25" : "border-white/10"
              }`}
            >
              {p.popular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-white px-3 py-0.5 text-xs font-medium text-zinc-950">
                  {t.popular}
                </span>
              )}
              <div className="flex items-center gap-3">
                <span className={`grid h-9 w-9 place-items-center rounded-lg ${p.tint}`}>
                  <p.icon size={18} />
                </span>
                <h3 className="text-lg font-semibold">{p.name}</h3>
              </div>
              <p className="mt-4 min-h-10 text-sm text-zinc-400">{t.blurbs[p.name]}</p>
              <div className="mt-6 flex items-baseline gap-1">
                <span className="text-4xl font-semibold tracking-tight">${price}</span>
                <span className="text-sm text-zinc-400">{t.perMonth}</span>
              </div>
              <p className="mt-1 text-xs text-zinc-500">
                {yearly ? t.billedYearly.replace("{total}", (p.monthly * 10).toLocaleString("en-US")) : t.billedMonthly}
              </p>
              <Link
                href={SIGNUP}
                className={`mt-6 rounded-lg py-2.5 text-center text-sm font-medium transition ${
                  p.popular
                    ? "bg-white text-zinc-950 hover:bg-zinc-200"
                    : "border border-white/10 text-white hover:bg-white/5"
                }`}
              >
                {t.startTrial}
              </Link>
              <p className="mt-8 text-xs font-medium uppercase tracking-wider text-zinc-500">{t.included}</p>
              <ul className="mt-3 space-y-3 text-sm">
                <Row icon={UserRound} label={t.users} value={p.users} />
                <Row icon={Building2} label={t.companies} value={p.companies} />
                <Row icon={Sparkles} label={t.profiles} value={p.profiles} />
                <Row icon={Code2} label={t.api} value={"api" in p && p.api ? "✓" : "—"} />
              </ul>
              <p className="mt-6 text-xs font-medium uppercase tracking-wider text-zinc-500">{t.monthHead}</p>
              <ul className="mt-3 space-y-3 text-sm">
                <Row icon={PenLine} label={t.posts} value={fmt(BUNDLES[p.id].posts)} />
                <Row icon={ImageIcon} label={t.images} value={fmt(BUNDLES[p.id].images)} />
                <Row icon={Film} label={t.videos} value={fmt(BUNDLES[p.id].videos)} />
                <Row icon={Clapperboard} label={t.veo} value={`${p.veo}s`} />
                <Row icon={FileText} label={t.articles} value={fmt(BUNDLES[p.id].articles)} />
                <Row icon={Compass} label={t.strategies} value={fmt(BUNDLES[p.id].strategies)} />
              </ul>
              <p className="mt-4 flex items-start gap-1.5 text-xs text-zinc-500">
                <Coins size={13} className="mt-0.5 shrink-0" />
                {t.flex.replace("{credits}", p.credits)}
              </p>
            </div>
          );
        })}
      </div>

      <p className="mt-6 text-center text-xs text-zinc-500">{t.vat}</p>

      <div className="mt-6 flex flex-wrap justify-center gap-x-8 gap-y-3 text-sm text-zinc-400">
        {t.perks.map(
          (t) => (
            <span key={t} className="inline-flex items-center gap-2">
              <Check size={16} className="text-emerald-400" />
              {t}
            </span>
          ),
        )}
      </div>

      <Rivals t={t.rivals} />

      <div className="mt-8 flex flex-col items-start justify-between gap-4 rounded-2xl border border-white/10 bg-zinc-900/60 p-6 sm:flex-row sm:items-center">
        <div>
          <h3 className="font-semibold">{t.moreTitle}</h3>
          <p className="mt-1 text-sm text-zinc-400">{t.moreBody}</p>
        </div>
        <a
          href="mailto:info@loudpilot.app?subject=Loudpilot%20partnership"
          className="shrink-0 rounded-lg border border-white/10 px-4 py-2 text-sm font-medium transition hover:bg-white/5"
        >
          {t.talk}
        </a>
      </div>
    </div>
  );
}

// List prices for 5 people and 20 social profiles (vendors' websites, Oct 2026).
const RIVALS: { tool: string; plan: string; price: number; basis?: "buffer" | "hootsuite" | "sprout"; us?: true }[] = [
  { tool: "Loudpilot", plan: "Team", price: 79, us: true },
  { tool: "Ocoya", plan: "Team", price: 79 },
  { tool: "Buffer", plan: "Team", price: 200, basis: "buffer" },
  { tool: "Hootsuite", plan: "Professional", price: 995, basis: "hootsuite" },
  { tool: "Sprout Social", plan: "Professional", price: 1495, basis: "sprout" },
];

function Rivals({ t }: { t: (typeof COPY)["en"]["pricing"]["rivals"] }) {
  return (
    <section className="mt-12 rounded-2xl border border-white/10 bg-zinc-900/60 p-6" aria-labelledby="rivals-title">
      <h3 id="rivals-title" className="text-lg font-semibold">
        {t.title}
      </h3>
      <p className="mt-1 text-sm text-zinc-400">{t.sub}</p>
      <div className="mt-5 grid gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" aria-label={t.title}>
            <thead className="text-left text-xs text-zinc-500">
              <tr>
                <th className="py-2 pr-3 font-medium">{t.tool}</th>
                <th className="py-2 pr-3 font-medium">{t.plan}</th>
                <th className="py-2 text-right font-medium">{t.price}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {RIVALS.map((r) => (
                <tr key={r.tool} className={r.us ? "text-white" : "text-zinc-300"}>
                  <td className={`py-2.5 pr-3 ${r.us ? "font-semibold" : ""}`}>{r.tool}</td>
                  <td className="py-2.5 pr-3 text-zinc-400">{r.plan}</td>
                  <td className="py-2.5 text-right">
                    <span className={`tabular-nums ${r.us ? "font-semibold text-emerald-300" : ""}`}>${r.price.toLocaleString("en-US")}</span>
                    {(r.us || r.basis) && <span className="block text-xs text-zinc-500">{r.us ? t.incl : t.basis[r.basis!]}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">{t.ours}</p>
          <ul className="mt-3 space-y-2 text-sm text-zinc-300">
            {t.oursItems.map((x) => (
              <li key={x} className="flex items-start gap-2">
                <Check size={15} className="mt-0.5 shrink-0 text-emerald-400" />
                {x}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p className="mt-4 text-xs text-zinc-500">{t.note}</p>
    </section>
  );
}

function Row({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string | number }) {
  return (
    <li className="flex items-center justify-between border-b border-white/5 pb-3 last:border-0">
      <span className="inline-flex min-w-0 items-center gap-2 text-zinc-400">
        <Icon size={15} />
        {label}
      </span>
      <span className="font-medium">{value}</span>
    </li>
  );
}
