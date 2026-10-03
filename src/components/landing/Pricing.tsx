"use client";

import { useState } from "react";
import { Building2, Check, Coins, Rocket, Sparkles, UserRound, Users } from "lucide-react";

const PLANS = [
  {
    name: "Starter",
    icon: Rocket,
    tint: "bg-emerald-400/15 text-emerald-300",
    blurb: "For founders and small brands running their own marketing.",
    monthly: 29,
    users: 1,
    profiles: 5,
    credits: "300",
  },
  {
    name: "Team",
    icon: Users,
    tint: "bg-sky-400/15 text-sky-300",
    blurb: "For marketing teams handling a few brands and ad accounts.",
    monthly: 79,
    users: 5,
    profiles: 20,
    credits: "1,500",
    popular: true,
  },
  {
    name: "Agency",
    icon: Building2,
    tint: "bg-violet-400/15 text-violet-300",
    blurb: "For agencies and partners serving many clients at once.",
    monthly: 199,
    users: 20,
    profiles: 100,
    credits: "5,000",
  },
];

export function Pricing() {
  const [yearly, setYearly] = useState(false);

  return (
    <div>
      <div className="mx-auto mb-10 flex w-fit rounded-full border border-white/10 bg-zinc-900 p-1 text-sm">
        {[
          { v: false, label: "Monthly" },
          { v: true, label: "Yearly (2 months free)" },
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
                  Most popular
                </span>
              )}
              <div className="flex items-center gap-3">
                <span className={`grid h-9 w-9 place-items-center rounded-lg ${p.tint}`}>
                  <p.icon size={18} />
                </span>
                <h3 className="text-lg font-semibold">{p.name}</h3>
              </div>
              <p className="mt-4 min-h-10 text-sm text-zinc-400">{p.blurb}</p>
              <div className="mt-6 flex items-baseline gap-1">
                <span className="text-4xl font-semibold tracking-tight">${price}</span>
                <span className="text-sm text-zinc-400">/ month</span>
              </div>
              <p className="mt-1 text-xs text-zinc-500">
                {yearly ? `Billed yearly — $${(p.monthly * 10).toLocaleString("en-US")}` : "Billed monthly"}
              </p>
              <a
                href="/signup"
                className={`mt-6 rounded-lg py-2.5 text-center text-sm font-medium transition ${
                  p.popular
                    ? "bg-white text-zinc-950 hover:bg-zinc-200"
                    : "border border-white/10 text-white hover:bg-white/5"
                }`}
              >
                Start free trial
              </a>
              <p className="mt-8 text-xs font-medium uppercase tracking-wider text-zinc-500">What&apos;s included</p>
              <ul className="mt-3 space-y-3 text-sm">
                <Row icon={UserRound} label="Users" value={p.users} />
                <Row icon={Sparkles} label="Social & ad profiles" value={p.profiles} />
                <Row icon={Coins} label="AI credits / month" value={p.credits} />
              </ul>
            </div>
          );
        })}
      </div>

      <div className="mt-8 flex flex-wrap justify-center gap-x-8 gap-y-3 text-sm text-zinc-400">
        {["AI credits refresh every month", "Add profiles and seats as you grow", "Change plan or cancel anytime"].map(
          (t) => (
            <span key={t} className="inline-flex items-center gap-2">
              <Check size={16} className="text-emerald-400" />
              {t}
            </span>
          ),
        )}
      </div>

      <div className="mt-8 flex flex-col items-start justify-between gap-4 rounded-2xl border border-white/10 bg-zinc-900/60 p-6 sm:flex-row sm:items-center">
        <div>
          <h3 className="font-semibold">Need more than Agency?</h3>
          <p className="mt-1 text-sm text-zinc-400">
            Custom limits, white-label and revenue share for platforms that resell Loudpilot to their own customers.
          </p>
        </div>
        <a
          href="mailto:info@brandrepublic.ge?subject=Loudpilot%20partnership"
          className="shrink-0 rounded-lg border border-white/10 px-4 py-2 text-sm font-medium transition hover:bg-white/5"
        >
          Let&apos;s talk
        </a>
      </div>
    </div>
  );
}

function Row({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string | number }) {
  return (
    <li className="flex items-center justify-between border-b border-white/5 pb-3 last:border-0">
      <span className="inline-flex items-center gap-2 text-zinc-400">
        <Icon size={15} />
        {label}
      </span>
      <span className="font-medium">{value}</span>
    </li>
  );
}
