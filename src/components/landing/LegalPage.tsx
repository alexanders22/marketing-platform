import type { ReactNode } from "react";
import { Header } from "./Header";
import { Footer } from "./Footer";

// Shared shell for /terms, /privacy and /data-deletion.
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <div className="overflow-x-clip">
      <Header />
      <main className="mx-auto max-w-3xl px-4 pt-16 pb-24 sm:px-6">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">{title}</h1>
        <p className="mt-3 text-sm text-zinc-500">Last updated: {updated}</p>
        <div className="legal mt-10 space-y-5 text-[15px] leading-relaxed text-zinc-300 [&_a]:text-white [&_a]:underline [&_h2]:mt-12 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-white [&_h3]:mt-6 [&_h3]:font-semibold [&_h3]:text-white [&_li]:mt-1.5 [&_strong]:text-white [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">
          {children}
        </div>
      </main>
      <Footer />
    </div>
  );
}
