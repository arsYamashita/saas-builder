/** @type {import('next').NextConfig} */
const nextConfig = {
  // packages/* workspace packages ship raw TypeScript source (no build
  // step) — Next.js must transpile them like first-party app code.
  transpilePackages: ['@saas/payments', '@saas/auth', '@saas/secret-guard', '@saas/idempotency'],
  experimental: {
    optimizePackageImports: ['lucide-react'],
    // instrumentation.ts's register() hook (env validation at startup) is
    // enabled by default in Next 15; see [[missing_env_validation_startup]].
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
