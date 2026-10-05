import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
