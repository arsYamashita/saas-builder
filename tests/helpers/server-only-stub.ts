/**
 * Vitest stand-in for the `server-only` package.
 *
 * `server-only` throws at import time in any environment that doesn't set
 * the `react-server` export condition — which includes vitest. The poison
 * pill it provides is a Next.js *build-time* guard (a Client Component
 * pulling `@saas/auth/server` fails `next build`); unit tests run outside
 * that client/server boundary, so aliasing it to this empty module (see
 * vitest.config.ts) is safe and keeps tests able to import server modules.
 */
export {};
