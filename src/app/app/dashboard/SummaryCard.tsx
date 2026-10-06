"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import type { PerformanceSummary } from "@/lib/ai";
import { LocalTime } from "@/components/LocalTime";
import { generateSummary } from "./actions";
import { creditsLabel } from "@/lib/pricing";
import { usePrices } from "@/components/Prices";

export function SummaryCard({
  period,
  range,
  initial,
  createdAt,
}: {
  period: number;
  // A chosen date range instead of the last `period` days.
  range?: { from: string; to: string } | null;
  initial: PerformanceSummary | null;
  createdAt: string | null;
}) {
  const P = usePrices();
  const router = useRouter();
  const [summary, setSummary] = useState(initial);
  const [at, setAt] = useState(createdAt);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();

  const run = () =>
    start(async () => {
      setError(undefined);
      const res = await generateSummary(period, range ?? undefined);
      if (res.error) return setError(res.error);
      setSummary(res.summary!);
      setAt(new Date().toISOString());
      router.refresh();
    });

  return (
    <section className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#7b3ff2] via-[#ff2e6e] to-[#ff5b14] p-[1.5px] shadow-[0_16px_40px_-26px_rgba(124,58,237,0.8)]">
      <div className="rounded-[15px] bg-white p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-500 text-white shadow-[0_6px_14px_-6px_rgba(168,85,247,0.9)]">
            <Sparkles size={17} />
          </span>
          <h2 className="text-lg font-semibold tracking-tight">AI summary</h2>
          {at && (
            <span className="text-xs text-zinc-500">
              ·{" "}
              <LocalTime
                iso={at}
                options={{
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                }}
              />
            </span>
          )}
          <button
            onClick={run}
            disabled={pending}
            className="ml-auto inline-flex items-center gap-1.5 rounded-xl bg-zinc-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
          >
            <RefreshCw size={13} className={pending ? "animate-spin" : ""} />
            {pending
              ? "Reading your results…"
              : summary
                ? `Refresh · ${creditsLabel(P.summary)}`
                : `${range ? `Summarise ${range.from} – ${range.to}` : `Summarise last ${period} days`} · ${creditsLabel(P.summary)}`}
          </button>
        </div>
        {error && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        {summary ? (
          <div className="mt-4 space-y-4 text-sm">
            <p className="text-lg font-semibold text-balance text-zinc-900">
              {summary.headline}
            </p>
            <div className="grid gap-3 md:grid-cols-3">
              <List
                title="What worked"
                items={summary.wins}
                tone="bg-emerald-50/70 ring-emerald-100"
                icon={<CheckCircle2 size={14} className="text-emerald-600" />}
              />
              <List
                title="Watch out"
                items={summary.concerns}
                tone="bg-amber-50/70 ring-amber-100"
                icon={<AlertTriangle size={14} className="text-amber-600" />}
              />
              <List
                title="Do this week"
                items={summary.actions}
                tone="bg-violet-50/70 ring-violet-100"
                icon={<ArrowRight size={14} className="text-violet-600" />}
              />
            </div>
          </div>
        ) : (
          !error && (
            <p className="mt-3 text-sm text-zinc-600">
              Loudpilot reads your ads, posts and website for this period and
              tells you what worked, what to watch and what to do next.
            </p>
          )
        )}
      </div>
    </section>
  );
}

function List({
  title,
  items,
  icon,
  tone,
}: {
  title: string;
  items: string[];
  icon: React.ReactNode;
  tone: string;
}) {
  if (items.length === 0) return null;
  return (
    <div className={`rounded-xl p-3.5 ring-1 ${tone}`}>
      <p className="mb-1.5 text-xs font-semibold tracking-wide text-zinc-500 uppercase">
        {title}
      </p>
      <ul className="space-y-1.5">
        {items.map((t, i) => (
          <li key={i} className="flex gap-2 text-zinc-700">
            <span className="mt-0.5 shrink-0">{icon}</span>
            {t}
          </li>
        ))}
      </ul>
    </div>
  );
}
