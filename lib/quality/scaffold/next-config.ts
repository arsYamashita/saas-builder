export function getScaffoldNextConfig(transpilePackages: string[] = []) {
  // Plain CommonJS next.config.js — matches the pinned Next 14.2.x
  // dependency (see package-json.ts). "next.config.ts" support (and the
  // "import type" / ESM syntax previously used here) requires Next 15+;
  // on Next 14 `next build` fails immediately with "Configuring Next.js
  // via 'next.config.ts' is not supported."
  //
  // `transpilePackages` is opt-in (empty by default) because only
  // create-app.ts's CLI output ships `@saas/*` workspace packages (thin TS
  // source, not a prebuilt dist) alongside the app — the DB-driven
  // export-files route (the other caller of writeExportScaffold(), which
  // this file also serves) never copies those packages in, so it must keep
  // getting the old no-transpile output unchanged. See
  // [[saas_builder_scaffold_missing_saas_packages]]: without this, Next
  // ships the `@saas/*` re-export shims but can't compile the TS package
  // source they point at.
  const transpileBlock = transpilePackages.length
    ? `\n  // @saas/* workspace packages (see packages/*, copied in under\n  // packages/) ship raw TS source, not a prebuilt dist — Next must\n  // transpile them like first-party app code.\n  transpilePackages: ${JSON.stringify(transpilePackages)},`
    : "";
  return `/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  experimental: {
    // Enables instrumentation.ts's register() hook (Next 14; default in
    // Next 15+). Only has an effect if an instrumentation.ts file is
    // present — harmless no-op otherwise. See lib/env.ts for the
    // startup env validation it's meant to wire up.
    instrumentationHook: true,
  },${transpileBlock}
};

module.exports = nextConfig;
`;
}
