// Khma ("voice" in Georgian): three bars of a sound wave inside a rounded tile.
export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-semibold tracking-tight ${className}`}>
      <svg viewBox="0 0 28 28" className="h-7 w-7" aria-hidden>
        <rect width="28" height="28" rx="8" fill="#fafafa" />
        <rect x="7" y="11" width="3" height="6" rx="1.5" fill="#09090b" />
        <rect x="12.5" y="7" width="3" height="14" rx="1.5" fill="#09090b" />
        <rect x="18" y="9.5" width="3" height="9" rx="1.5" fill="#09090b" />
      </svg>
      <span className="text-lg">Khma</span>
    </span>
  );
}
