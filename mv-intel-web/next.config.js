/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: { 
    esmExternals: 'loose',
    // Include YAML files in serverless function bundles
    outputFileTracingIncludes: {
      '/api/ingest': ['./lib/financials/portcos/**/*'],
      '/api/detect-company': ['./lib/financials/portcos/**/*'],
      '/api/ingest-local': ['./lib/financials/portcos/**/*'],
    },
  },
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
  // Serverless function configuration
  // Vercel Pro: maxDuration up to 300s (default), Fluid Compute up to 800s
  // These settings apply to API routes
  serverRuntimeConfig: {
    // Runtime config available on server-side
  },
};
module.exports = nextConfig;
