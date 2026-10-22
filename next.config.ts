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

const nextConfig: NextConfig = {
  deploymentId,
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
