export function getScaffoldVitestConfig() {
  // The scaffold package.json wires "test" / "test:unit" to `vitest run`
  // (see package-json.ts), so every generated project — DB-driven
  // export-files route AND the offline create-app CLI — needs this config:
  //
  // - exclude tests/playwright/**: the scaffold always writes Playwright
  //   specs there (playwright-tests.ts). Without the exclusion Vitest
  //   picks up *.spec.ts, fails on the missing '@playwright/test'
  //   runtime context, and `npm test` is broken out of the box.
  // - passWithNoTests: a freshly exported project may contain zero unit
  //   tests (templates ship their own, but plain DB-driven exports might
  //   not) — `vitest run` exits 1 on "no test files found" by default,
  //   which would make `npm test` fail on a perfectly healthy export.
  // - "@" alias must mirror tsconfig's "@/*" -> "./*" (tsconfig-json.ts).
  return `import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    exclude: ["**/node_modules/**", "**/tests/playwright/**"],
    passWithNoTests: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
`;
}
