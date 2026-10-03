import Link from "next/link";
import { Logo } from "./Logo";
import { CONTACT, FEATURES, SUPPORT, featureHref } from "./site";

export function Footer() {
  // Only links that lead somewhere.
  const cols: { title: string; links: { label: string; href: string }[] }[] = [
    {
      title: "Features",
      links: FEATURES.filter((f) => f.status !== "soon").map((f) => ({ label: f.title, href: featureHref(f.slug) })),
    },
    {
      title: "Product",
      links: [
        { label: "How it works", href: "/#how" },
        { label: "Ads & analytics", href: featureHref("ads") },
        { label: "API documentation", href: "/docs" },
        { label: "Pricing", href: "/#pricing" },
      ],
    },
    {
      title: "Company",
      links: [
        { label: "Contact sales", href: CONTACT },
        { label: "Support", href: SUPPORT },
        { label: "Log in", href: "/login" },
        { label: "Start free", href: "/signup" },
      ],
    },
    {
      title: "Legal",
      links: [
        { label: "Terms of Service", href: "/terms" },
        { label: "Privacy Policy", href: "/privacy" },
        { label: "Data deletion", href: "/data-deletion" },
      ],
    },
  ];
  return (
    <footer className="border-t border-white/5 bg-zinc-900/30">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 sm:grid-cols-2 md:grid-cols-[1.4fr_repeat(4,1fr)]">
        <div>
          <Logo />
          <p className="mt-3 max-w-xs text-sm text-zinc-400">AI marketing: content, ads and analytics in one place.</p>
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
        <span>© {new Date().getFullYear()} Loudpilot. All rights reserved.</span>
      </div>
    </footer>
  );
}
