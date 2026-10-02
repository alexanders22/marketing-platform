"use client";

import { useState } from "react";
import { Menu, X } from "lucide-react";
import { Logo } from "./Logo";

const NAV = [
  { href: "#features", label: "Features" },
  { href: "#ads", label: "Ads & analytics" },
  { href: "#partners", label: "For partners" },
  { href: "#pricing", label: "Pricing" },
];

export function Header() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-white/5 bg-zinc-950/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <a href="#" aria-label="Khma home">
          <Logo />
        </a>

        <nav className="hidden items-center gap-7 text-sm text-zinc-400 md:flex">
          {NAV.map((n) => (
            <a key={n.href} href={n.href} className="transition hover:text-white">
              {n.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <a href="#" className="text-sm text-zinc-300 transition hover:text-white">
            Log in
          </a>
          <a
            href="#pricing"
            className="rounded-full bg-white px-4 py-1.5 text-sm font-medium text-zinc-950 transition hover:bg-zinc-200"
          >
            Try free
          </a>
        </div>

        <button
          className="rounded-lg p-2 text-zinc-300 md:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {open && (
        <nav className="border-t border-white/5 px-4 pb-4 md:hidden">
          {NAV.map((n) => (
            <a key={n.href} href={n.href} onClick={() => setOpen(false)} className="block py-3 text-zinc-300">
              {n.label}
            </a>
          ))}
          <a
            href="#pricing"
            onClick={() => setOpen(false)}
            className="mt-2 block rounded-full bg-white py-2.5 text-center text-sm font-medium text-zinc-950"
          >
            Try free
          </a>
        </nav>
      )}
    </header>
  );
}
