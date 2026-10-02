import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Composer reference images and Studio PNG exports (base64).
      bodySizeLimit: "20mb",
    },
  },
};

export default nextConfig;
