import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker image serves this process. No standalone trace — monorepo-friendly.
  transpilePackages: ["@agent-board/db", "@agent-board/mcp-core"],
  // Hard rule: no external fonts, analytics, images, or phone-home.
  images: { unoptimized: true },
  poweredByHeader: false,
};

export default nextConfig;
