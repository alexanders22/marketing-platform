import Link from "next/link";
import { Logo } from "./Logo";
import { COPY, localePath, type Lang } from "./i18n";
import { CONTACT, SUPPORT, featureHref, featuresFor } from "./site";

export function Footer({ lang = "en" }: { lang?: Lang }) {
  const t = COPY[lang].footer;
  // Only links that lead somewhere.
  const cols: { title: string; links: { label: string; href: string }[] }[] = [
    {
      title: t.features,
      links: featuresFor(lang)
        .filter((f) => f.status !== "soon")
        .map((f) => ({ label: f.title, href: featureHref(f.slug, lang) })),
    },
    {
      title: t.product,
      links: [
        { label: t.howItWorks, href: localePath(lang, "/#how") },
        { label: t.adsAnalytics, href: featureHref("ads", lang) },
        { label: t.apiDocs, href: "/docs" },
        { label: t.pricing, href: localePath(lang, "/#pricing") },
      ],
    },
    {
      title: t.company,
      links: [
        { label: t.contactSales, href: CONTACT },
        { label: t.support, href: SUPPORT },
        { label: t.login, href: "/login" },
        { label: t.startFree, href: "/signup" },
      ],
    },
    {
      title: t.legal,
      links: [
        { label: t.terms, href: "/terms" },
        { label: t.privacy, href: "/privacy" },
        { label: t.deletion, href: "/data-deletion" },
      ],
    },
  ];
  return (
    <footer className="border-t border-white/5 bg-zinc-900/30">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 sm:grid-cols-2 md:grid-cols-[1.4fr_repeat(4,1fr)]">
        <div>
          <Logo />
          <p className="mt-3 max-w-xs text-sm text-zinc-400">{t.tagline}</p>
        </div>
        {cols.map((c) => (
          <div key={c.title}>
            <h4 className="text-sm font-semibold">{c.title}</h4>
            <ul className="mt-4 space-y-2.5 text-sm text-zinc-400">
              {c.links.map((l) => (
                <li key={l.label}>
                  {l.href.startsWith("/") ? (
                    <Link href={l.href} className="transition hover:text-white">
                      {l.label}
                    </Link>
                  ) : (
                    <a href={l.href} className="transition hover:text-white">
                      {l.label}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mx-auto flex max-w-6xl flex-col justify-between gap-2 border-t border-white/5 px-4 py-6 text-xs text-zinc-500 sm:flex-row sm:px-6">
        <span>
          © {new Date().getFullYear()} Loudpilot. {t.rights}
        </span>
      </div>
    </footer>
  );
}
