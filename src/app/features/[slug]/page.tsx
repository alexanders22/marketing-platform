import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Check } from "lucide-react";
import { Header } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { CONTACT, FEATURES, featureHref } from "@/components/landing/site";

export const dynamicParams = false;

export function generateStaticParams() {
  return FEATURES.map((f) => ({ slug: f.slug }));
}

const find = (slug: string) => FEATURES.find((f) => f.slug === slug);

export async function generateMetadata({ params }: PageProps<"/features/[slug]">): Promise<Metadata> {
  const f = find((await params).slug);
  if (!f) return { title: "Not found" };
  return { title: `${f.title} — Khma`, description: f.short };
}

export default async function FeaturePage({ params }: PageProps<"/features/[slug]">) {
  const f = find((await params).slug);
  if (!f) notFound();
  const soon = f.status === "soon";
  const others = FEATURES.filter((x) => x.slug !== f.slug);

  return (
    <div className="overflow-x-clip">
      <Header />
      <main>
        <section className="relative">
          <div className="glow pointer-events-none absolute inset-0" />
          <div className="grid-fade pointer-events-none absolute inset-0" />
          <div className="relative mx-auto max-w-3xl px-4 pt-20 pb-16 text-center sm:px-6 lg:pt-28">
            <span className={`mx-auto grid h-14 w-14 place-items-center rounded-2xl ${f.tint}`}>
              <f.icon size={26} />
            </span>
            <p className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-zinc-300">
              {f.title}
              {soon && (
                <span className="rounded-full bg-zinc-700/60 px-2 py-0.5 text-[11px] font-semibold text-zinc-300 uppercase">
                  Coming soon
                </span>
              )}
              {f.status === "new" && (
                <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-300 uppercase">
                  New
                </span>
              )}
            </p>
            <h1 className="mt-4 text-4xl leading-[1.08] font-semibold tracking-tight text-balance sm:text-6xl">{f.headline}</h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-zinc-400 text-pretty">{f.intro}</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <a
                href={soon || f.slug === "api" ? CONTACT : "/signup"}
                className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-medium text-zinc-950 transition hover:bg-zinc-200"
              >
                {soon ? "Get early access" : f.slug === "api" ? "Talk to us" : "Start free"} <ArrowRight size={16} />
              </a>
              <Link
                href="/#pricing"
                className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-medium text-zinc-200 transition hover:bg-white/5"
              >
                See pricing
              </Link>
            </div>
          </div>
        </section>

        <section className="pb-24">
          <div className="mx-auto grid max-w-5xl gap-4 px-4 sm:grid-cols-2 sm:px-6">
            {f.points.map((p) => (
              <div key={p.title} className="rounded-2xl border border-white/10 bg-zinc-900/60 p-6">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-400/15 text-emerald-300">
                  <Check size={16} />
                </span>
                <h2 className="mt-4 text-lg font-semibold">{p.title}</h2>
                <p className="mt-2 text-sm text-zinc-400">{p.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-t border-white/5 bg-zinc-900/30 py-20">
          <div className="mx-auto max-w-5xl px-4 sm:px-6">
            <h2 className="text-2xl font-semibold tracking-tight">More in Khma</h2>
            <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {others.map((o) => (
                <Link
                  key={o.slug}
                  href={featureHref(o.slug)}
                  className="rounded-2xl border border-white/10 bg-zinc-900/60 p-4 transition hover:-translate-y-0.5 hover:border-white/20"
                >
                  <span className={`grid h-8 w-8 place-items-center rounded-lg ${o.tint}`}>
                    <o.icon size={15} />
                  </span>
                  <p className="mt-3 text-sm font-semibold">{o.title}</p>
                  <p className="mt-1 text-xs text-zinc-400">{o.short}</p>
                </Link>
              ))}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
