import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
