export function getScaffoldTsconfig() {
  return {
    compilerOptions: {
      target: "ES2022",
      lib: ["dom", "dom.iterable", "es2022"],
      allowJs: false,
      skipLibCheck: true,
      strict: false,
      noEmit: true,
      esModuleInterop: true,
      module: "esnext",
      moduleResolution: "bundler",
      resolveJsonModule: true,
      isolatedModules: true,
      jsx: "preserve",
      incremental: true,
      baseUrl: ".",
      // Root-level "@/*" (not "./src/*") — must match docs/rules/02-file-path-rules.md,
      // which specifies AI-generated file_path values at the project root
      // (e.g. "app/(generated)/dashboard/page.tsx", "components/domain/...",
      // "lib/validation/..."), and the root saas-builder project's own
      // tsconfig.json. A "./src/*" alias here silently broke module
      // resolution for every exported project: app/layout.tsx's
      // "@/components/built-with-badge" import (badge is written to
      // components/built-with-badge.tsx, not src/components/...) and any
      // DB-driven generated file that imports another generated file via "@/...".
      paths: {
        "@/*": ["./*"],
      },
      plugins: [{ name: "next" }],
    },
    include: [
      "next-env.d.ts",
      "**/*.ts",
      "**/*.tsx",
      ".next/types/**/*.ts",
    ],
    exclude: ["node_modules"],
  };
}
