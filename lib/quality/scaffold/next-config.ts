export function getScaffoldNextConfig() {
  // Plain CommonJS next.config.js — matches the pinned Next 14.2.x
  // dependency (see package-json.ts). "next.config.ts" support (and the
  // "import type" / ESM syntax previously used here) requires Next 15+;
  // on Next 14 `next build` fails immediately with "Configuring Next.js
  // via 'next.config.ts' is not supported."
  return `/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  experimental: {
    // Enables instrumentation.ts's register() hook (Next 14; default in
    // Next 15+). Only has an effect if an instrumentation.ts file is
    // present — harmless no-op otherwise. See lib/env.ts for the
    // startup env validation it's meant to wire up.
    instrumentationHook: true,
  },
};

module.exports = nextConfig;
`;
}
