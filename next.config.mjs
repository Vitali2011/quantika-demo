import { withSentryConfig } from "@sentry/nextjs";
import createBundleAnalyzer from "@next/bundle-analyzer";

const withBundleAnalyzer = createBundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['better-sqlite3', 'sqlite-vec'],
  async rewrites() {
    return [{ source: '/api/v1/:path*', destination: '/api/:path*' }];
  },
};

export default withSentryConfig(withBundleAnalyzer(nextConfig), {
  silent: true,
  org: "",
  project: "",
  sourcemaps: { disable: true },
});
