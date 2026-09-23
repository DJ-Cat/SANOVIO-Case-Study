import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The data layer is node:sqlite (built into Node >= 24), so there is no
  // native module to mark external here.
  experimental: { serverActions: { bodySizeLimit: "25mb" } },
};

export default nextConfig;
