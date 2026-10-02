import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Reference images attached in the composer (downscaled client-side).
      bodySizeLimit: "8mb",
    },
  },
};

export default nextConfig;
