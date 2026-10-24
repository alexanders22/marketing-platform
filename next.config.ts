import type { NextConfig } from "next";
import { execSync } from "node:child_process";

// One id per deployed commit. A tab still running the previous build then
// reloads on its next navigation instead of failing ("This page couldn't
// load") on scripts and Server Action ids the new build no longer has.
const deploymentId =
  process.env.NEXT_DEPLOYMENT_ID ||
  (() => {
    try {
      return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim() || undefined;
    } catch {
      return undefined;
    }
  })();

// On every response. No page may be framed by another site (clickjacking):
// the website widget (/t.js, /w.js) is a script on the customer's page, not
// a frame. /pay/done — Monrem's return page — opens inside our own payment
// frame, so it may be framed by our own pages.
const security = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
]

const nextConfig: NextConfig = {
  deploymentId,
  poweredByHeader: false,
  async headers() {
    return [
      { source: '/:path*', headers: security },
      {
        source: '/pay/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
        ],
      },
      // Stored files are inert (their routes set the same; this rule would
      // otherwise replace it with the frame-ancestors one above).
      ...['/media/:path*', '/b/:slug/avatar'].map((source) => ({
        source,
        headers: [{ key: 'Content-Security-Policy', value: "default-src 'none'; sandbox" }],
      })),
    ]
  },
  // Landing links to the signed-in product (terminal.loudpilot.app), baked in
  // at build time from the server's TERMINAL_URL.
  env: { NEXT_PUBLIC_TERMINAL_URL: (process.env.TERMINAL_URL ?? "").replace(/\/$/, "") },
  // ffmpeg-static finds its binary next to its own files: keep it unbundled.
  serverExternalPackages: ["ffmpeg-static"],
  experimental: {
    serverActions: {
      // Composer reference images and Studio PNG exports (base64).
      bodySizeLimit: "20mb",
    },
  },
};

export default nextConfig;
