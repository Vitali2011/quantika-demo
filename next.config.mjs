import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [{ source: '/api/v1/:path*', destination: '/api/:path*' }];
  },
};

export default withSentryConfig(nextConfig, { silent: true, org: "", project: "" });
