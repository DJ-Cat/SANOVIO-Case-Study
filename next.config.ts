import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The demo edition builds into its own folder, so it can run beside the
  // clean one (`npm run dev` and `npm run demo` at the same time) without the
  // two dev servers fighting over one .next directory.
  distDir: process.env.SANOVIO_EDITION === "demo" ? ".next-demo" : ".next",
  // The data layer is node:sqlite (built into Node >= 24), so there is no
  // native module to mark external here.
  experimental: { serverActions: { bodySizeLimit: "25mb" } },
};

export default nextConfig;
