// Full-bleed abstract "painted" backdrop for auth screens — flat colour
// blocks and curves in warm, saturated tones. Pure SVG, no image request.
export function ArtBackground() {
  return (
    <svg
      className="absolute inset-0 h-full w-full"
      viewBox="0 0 1600 1000"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
    >
      <rect width="1600" height="1000" fill="#2b2a3a" />
      <path d="M0 0h620L430 420 0 520z" fill="#c2410c" />
      <path d="M620 0h420L860 380 430 420z" fill="#eab308" />
      <path d="M1040 0h560v300L1180 520 860 380z" fill="#1d4ed8" />
      <path d="M1600 300v380l-300 120-120-280z" fill="#0f766e" />
      <path d="M0 520l430-100 210 330L0 1000z" fill="#7c2d12" />
      <path d="M430 420l430-40 320 140-260 330-280 150-210-250z" fill="#a21caf" />
      <path d="M1180 520l120 280-180 200H640l280-150z" fill="#f97316" />
      <path d="M1300 800l300-120v320h-480z" fill="#365314" />
      <circle cx="300" cy="640" r="170" fill="#facc15" />
      <circle cx="300" cy="640" r="70" fill="#1c1917" />
      <circle cx="1240" cy="230" r="120" fill="#fde68a" opacity="0.9" />
      <path d="M760 160c140 40 260 160 300 330" stroke="#1c1917" strokeWidth="18" fill="none" />
      <path d="M560 760c90-80 220-120 360-90" stroke="#fef3c7" strokeWidth="14" fill="none" />
      <path d="M1380 560l120 60-60 140-140-40z" fill="#be123c" />
      <path d="M90 140l160 30-40 140-150-30z" fill="#fef3c7" opacity="0.85" />
      <g stroke="#1c1917" strokeWidth="10" opacity="0.6">
        <path d="M1050 640l120-60M1070 680l120-60M1090 720l120-60" />
      </g>
      <rect width="1600" height="1000" fill="url(#grain)" opacity="0.18" />
      <defs>
        <pattern id="grain" width="6" height="6" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="1" fill="#000" />
          <circle cx="4" cy="4" r="0.7" fill="#fff" />
        </pattern>
      </defs>
    </svg>
  )
}
