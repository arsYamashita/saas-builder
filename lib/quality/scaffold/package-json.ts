export function getScaffoldPackageJson() {
  return {
    name: "generated-saas-template",
    private: true,
    version: "0.1.0",
    scripts: {
      dev: "next dev",
      build: "next build",
      start: "next start",
      lint: "eslint .",
      typecheck: "tsc --noEmit",
      test: "vitest run",
      "test:unit": "vitest run",
      "test:unit:watch": "vitest",
      "test:e2e": "playwright test",
    },
    dependencies: {
      // Next/React versions pinned to match what the rest of the
      // saas-builder codebase (and every generated-file type signature) is
      // actually written and tested against. This scaffold previously
      // pinned next@^15 / react@^19 while every AI-generated route and
      // component targets Next 14 / React 18 APIs — a version drift a
      // generated app would only discover at `npm install` / build time.
      next: "^14.2.35",
      react: "^18.3.0",
      "react-dom": "^18.3.0",
      "@supabase/ssr": "^0.5.0",
      "@supabase/supabase-js": "^2.45.0",
      "@upstash/ratelimit": "^2.0.8",
      "@upstash/redis": "^1.37.0",
      stripe: "^16.0.0",
      zod: "^3.23.0",
    },
    devDependencies: {
      typescript: "^5.5.0",
      eslint: "^9.0.0",
      globals: "^15.0.0",
      "@eslint/js": "^9.0.0",
      "@typescript-eslint/parser": "^8.0.0",
      "@typescript-eslint/eslint-plugin": "^8.0.0",
      "@playwright/test": "^1.55.0",
      vitest: "^3.2.4",
      "@types/node": "^20.14.0",
      "@types/react": "^18.3.0",
      "@types/react-dom": "^18.3.0",
    },
  };
}
