import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["10.31.7.29"],
  outputFileTracingIncludes: {
    "/api/*": ["./src/server/legacy-api.cjs", "./public/legacy/inbound-receipts.js", "./data/**/*"]
  },
  poweredByHeader: false,
  reactStrictMode: true,
  experimental: {
    optimizePackageImports: ["lucide-react"]
  }
};

export default nextConfig;
