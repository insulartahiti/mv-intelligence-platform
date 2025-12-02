/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: { esmExternals: 'loose' },
  typescript: {
    // !! WARN !!
    // Dangerously allow production builds to successfully complete even if
    // your project has type errors.
    // !! WARN !!
    ignoreBuildErrors: true,
  },
  eslint: {
    // Warning: This allows production builds to successfully complete even if
    // your project has ESLint errors.
    ignoreDuringBuilds: true,
  },
  // Include YAML files in serverless function bundles
  outputFileTracingIncludes: {
    '/api/ingest': ['./lib/financials/portcos/**/*'],
    '/api/detect-company': ['./lib/financials/portcos/**/*'],
  },
};
module.exports = nextConfig;
