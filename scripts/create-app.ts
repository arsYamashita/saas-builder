#!/usr/bin/env npx tsx
/**
 * create-app — minimal scaffold CLI for spinning up a new standalone SaaS
 * app from the saas-builder fixed common core (+ optional business
 * template overlay from templates/<key>/).
 *
 * This does NOT talk to Supabase / the generation-runs DB — unlike the
 * DB-driven `POST /api/projects/[projectId]/export-files` route, it works
 * purely from files already in this repo, so it can be dry-run offline
 * before wiring up a real project.
 *
 * Usage:
 *   npm run create-app -- --name <app> [--out <dir>] [--template <key>]
 *
 * Examples:
 *   npm run create-app -- --name my-app
 *   npm run create-app -- --name my-app --template community_membership_saas
 *   npm run create-app -- --name my-app --out /tmp/scaffold-dryrun --template community_membership_saas
 *
 * What gets written:
 *   - Fixed common core (always): package.json, tsconfig.json, next.config.js,
 *     playwright.config.ts, vitest.config.ts, eslint.config.mjs, middleware.ts,
 *     app/layout.tsx, app/page.tsx, .gitignore, README.md, next-env.d.ts,
 *     tests/playwright/{auth,smoke}.spec.ts, lib/supabase/{server,client}.ts
 *     (compat), components/built-with-badge.tsx (viral badge) — via the same
 *     writeExportScaffold() helper the DB-driven export route uses.
 *   - Additionally (always): lib/env.ts (startup env validation),
 *     lib/db/supabase/{admin,server,client}.ts, lib/payments/*,
 *     lib/billing/{stripe,webhook-errors}.ts, .env.example,
 *     docs/rules/*.md (the shared generation contract — 06/08 are the
 *     mandatory ones for API + DB boundaries).
 *   - With --template <key>: templates/<key>/src/** flattened onto the
 *     project root (src/app -> app, src/lib -> lib, src/types -> types)
 *     and templates/<key>/supabase/{migrations,seed.sql} -> supabase/.
 *     Business templates ship their own self-contained tenants/users/
 *     memberships schema + RLS policies + guards — this is NOT layered on
 *     top of the builder's own supabase/migrations/ (those model the
 *     BUILDER's internal DB — projects, generation_runs — a different
 *     schema entirely, and would collide table names if copied in too).
 */
import fs from "node:fs";
import path from "node:path";
import { writeExportScaffold } from "../lib/quality/write-export-scaffold";

const REPO_ROOT = path.resolve(__dirname, "..");

function parseArgs(argv: string[]) {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      const key = argv[i].slice(2);
      const value = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "true";
      args[key] = value;
    }
  }
  return args;
}

function copyFile(src: string, dest: string) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function copyDir(srcDir: string, destDir: string) {
  if (!fs.existsSync(srcDir)) return;
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      copyFile(srcPath, destPath);
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const name = args.name;

  if (!name || !/^[a-z0-9][a-z0-9-]*$/.test(name)) {
    console.error(
      "[create-app] --name <app> is required and must match ^[a-z0-9][a-z0-9-]*$"
    );
    process.exit(1);
  }

  const templateKey = args.template;
  const outDir = args.out
    ? path.resolve(args.out)
    : path.join(REPO_ROOT, "exports", "local", name);

  if (templateKey) {
    const templateDir = path.join(REPO_ROOT, "templates", templateKey);
    if (!fs.existsSync(templateDir)) {
      const available = fs.existsSync(path.join(REPO_ROOT, "templates"))
        ? fs.readdirSync(path.join(REPO_ROOT, "templates"))
        : [];
      console.error(
        `[create-app] Unknown --template "${templateKey}". Available: ${
          available.join(", ") || "(none found under templates/)"
        }`
      );
      process.exit(1);
    }
  }

  fs.mkdirSync(outDir, { recursive: true });

  const written: string[] = [];
  const track = (label: string) => written.push(label);

  // ── 1. Fixed scaffold boilerplate (package.json, tsconfig, next config,
  //       app/layout+page, middleware, badge, playwright tests, compat
  //       supabase client/server) — reuse the same writer the DB-driven
  //       export-files API route uses, so both paths stay consistent. ──
  await writeExportScaffold(outDir, `local-${name}`);
  track("scaffold boilerplate (package.json, tsconfig, next.config, app/, middleware.ts, components/built-with-badge.tsx, lib/supabase/*, tests/playwright/*)");

  // vitest.config.ts isn't part of writeExportScaffold (that only wires
  // Playwright) but the scaffold package.json's "test"/"test:unit" scripts
  // run vitest, so a config is required for `npm test` to work standalone.
  fs.writeFileSync(
    path.join(outDir, "vitest.config.ts"),
    `import { defineConfig } from "vitest/config";\nimport path from "path";\n\nexport default defineConfig({\n  test: {\n    exclude: ["**/node_modules/**", "**/tests/playwright/**"],\n  },\n  resolve: {\n    alias: {\n      "@": path.resolve(__dirname, "."),\n    },\n  },\n});\n`
  );
  track("vitest.config.ts");

  // ── 2. Fixed common core: env validation + Supabase clients + hardened
  //       payments module (idempotency key + signature-verified webhook
  //       helpers) — see docs/rules/06-api-rules.md, "Payments (Stripe) —
  //       Security Baseline". ──
  copyFile(path.join(REPO_ROOT, "lib/env.ts"), path.join(outDir, "lib/env.ts"));
  // Wires lib/env.ts's validateEnv() into server startup (register() hook,
  // enabled by next.config.js's experimental.instrumentationHook). Without
  // this, lib/env.ts is dead code — copying the validator alone does not
  // make it run. See [[missing_env_validation_startup]].
  copyFile(path.join(REPO_ROOT, "instrumentation.ts"), path.join(outDir, "instrumentation.ts"));
  copyDir(path.join(REPO_ROOT, "lib/db/supabase"), path.join(outDir, "lib/db/supabase"));
  copyDir(path.join(REPO_ROOT, "lib/payments"), path.join(outDir, "lib/payments"));
  copyFile(path.join(REPO_ROOT, "lib/billing/stripe.ts"), path.join(outDir, "lib/billing/stripe.ts"));
  copyFile(
    path.join(REPO_ROOT, "lib/billing/webhook-errors.ts"),
    path.join(outDir, "lib/billing/webhook-errors.ts")
  );
  // Redis-backed rate limiter (Upstash, in-memory fallback for local dev) —
  // required by unauthenticated auth endpoints (login/signup) per
  // docs/rules/06-api-rules.md, "Rate Limiting (mandatory for auth +
  // paid-API endpoints)". See [[saas_builder_security_debt_inheritance]].
  copyFile(path.join(REPO_ROOT, "lib/rate-limit.ts"), path.join(outDir, "lib/rate-limit.ts"));
  track("lib/env.ts + instrumentation.ts (startup validation wiring), lib/db/supabase/*, lib/payments/* (idempotency), lib/billing/{stripe,webhook-errors}.ts, lib/rate-limit.ts");

  // ── 3. Env template + shared generation-contract docs (06/08 are the
  //       mandatory API/DB boundary rules; the rest are included as
  //       reference since new code in this project should stay consistent
  //       with the same contract templates are generated against). ──
  copyFile(path.join(REPO_ROOT, ".env.example"), path.join(outDir, ".env.example"));
  copyDir(path.join(REPO_ROOT, "docs/rules"), path.join(outDir, "docs/rules"));
  // docs/rules/ also contains per-template subdirectories (e.g.
  // community_membership_saas/) that aren't rule files — only *.md at the
  // top level are the shared contract; leave any subdirs as-is (harmless
  // reference material) rather than filtering, to keep this step simple.
  track(".env.example, docs/rules/*.md (shared generation contract; 06 + 08 are mandatory)");

  // ── 4. Optional business template overlay ──
  if (templateKey) {
    const templateDir = path.join(REPO_ROOT, "templates", templateKey);
    const srcDir = path.join(templateDir, "src");

    // Template source trees use "src/app", "src/lib", "src/types" — flatten
    // onto the project root (app/, lib/, types/) to match this scaffold's
    // "@/*" -> "./*" tsconfig alias (NOT "./src/*"; see tsconfig-json.ts).
    for (const sub of ["app", "lib", "types", "components"]) {
      copyDir(path.join(srcDir, sub), path.join(outDir, sub));
    }

    // Template's own supabase/ (schema + RLS + seed) is self-contained —
    // it defines its own tenants/users/memberships tables and does NOT
    // depend on (and would collide with) the builder's own
    // supabase/migrations/ (a different schema for the builder's internal
    // projects/generation_runs DB).
    copyDir(path.join(templateDir, "supabase"), path.join(outDir, "supabase"));

    const manifestSrc = path.join(templateDir, "manifest.json");
    if (fs.existsSync(manifestSrc)) {
      copyFile(manifestSrc, path.join(outDir, "template-manifest.json"));
    }

    track(`templates/${templateKey}/src/** flattened onto app/, lib/, types/ + supabase/migrations (self-contained schema+RLS)`);
  }

  console.log(`[create-app] Scaffolded "${name}"${templateKey ? ` (template: ${templateKey})` : ""} at:\n  ${outDir}\n`);
  console.log("Written:");
  for (const item of written) console.log(`  - ${item}`);
  console.log(
    "\nNext steps:\n" +
      `  cd ${path.relative(process.cwd(), outDir) || "."}\n` +
      "  cp .env.example .env.local   # fill in real (or dummy, for a build-only check) values\n" +
      "  npm install\n" +
      "  npm test           # vitest — unit tests only, no live Supabase/Stripe required\n" +
      "  npm run build\n"
  );
}

main().catch((error) => {
  console.error("[create-app] Failed:", error);
  process.exit(1);
});
