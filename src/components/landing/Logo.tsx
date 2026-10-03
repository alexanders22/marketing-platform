// Loudpilot mark: an L whose corner opens into sound waves, on the brand
// gradient (orange → pink → violet). See brand/icon-c2-loud-l.svg.
// The gradient id is fixed: repeated marks on one page share identical
// definitions, so whichever the browser picks renders the same.
const id = "loudpilot-mark";

export function LogoMark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#ff6a00" />
          <stop offset=".55" stopColor="#ff2e63" />
          <stop offset="1" stopColor="#8b5cf6" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill={`url(#${id})`} />
      <path d="M19 15 V45 H32" fill="none" stroke="#fff" strokeWidth="8.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M38.5 23 a 11 11 0 0 1 0 15" fill="none" stroke="#fff" strokeWidth="4.6" strokeLinecap="round" />
      <path d="M45.5 16.5 a 20 20 0 0 1 0 28" fill="none" stroke="#fff" strokeWidth="4.6" strokeLinecap="round" opacity=".6" />
    </svg>
  );
}

// "loud" in the current text colour, "pilot" in the brand gradient.
export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`} aria-label="Loudpilot">
      <LogoMark />
      <span className="text-lg font-extrabold tracking-[-0.035em]" aria-hidden>
        loud
        <span className="bg-gradient-to-r from-[#ff6a00] to-[#ff2e63] bg-clip-text text-transparent">pilot</span>
      </span>
    </span>
  );
}
