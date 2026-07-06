/** @type {import('next').NextConfig} */
const nextConfig = {
  // packages/* workspace packages ship raw TypeScript source (no build
  // step) — Next.js must transpile them like first-party app code.
  transpilePackages: ['@saas/payments', '@saas/auth', '@saas/secret-guard'],
  experimental: {
    optimizePackageImports: ['lucide-react'],
    // Enables instrumentation.ts's register() hook, used to validate
    // required env vars (Stripe keys etc.) at server startup.
    // See [[missing_env_validation_startup]] / [[stripe_env_optional_in_zod]].
    instrumentationHook: true,
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
