import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

/**
 * End-to-end regression test for
 * [[saas_builder_scaffold_missing_saas_packages]]:
 *
 * `npm run create-app` (scripts/create-app.ts) copies lib/db/supabase/*,
 * lib/payments/*, and lib/billing/{stripe,webhook-errors}.ts into the
 * generated app — but those files are thin re-export shims around the
 * `@saas/auth` / `@saas/payments` workspace packages (see packages/*).
 * Before this fix, the generated package.json never declared those
 * dependencies and the package source was never copied, so `npm install`
 * (or `tsc`) in the generated app failed to resolve `@saas/auth`,
 * `@saas/auth/server`, `@saas/auth/client`, and `@saas/payments` — a
 * completely broken generated app that no test ever caught.
 *
 * This test runs the REAL CLI (via child_process, like
 * security-gate-check.test.ts) into a disposable temp dir and inspects the
 * generated artifact directly:
 *   1. every `@saas/*` import actually present in the generated app code
 *      has a matching `file:./packages/<name>` dependency in package.json
 *   2. the referenced packages/<name> directory was actually copied
 *   3. next.config.js transpiles those workspace packages (they ship TS
 *      source, not a prebuilt dist)
 *   4. the whole thing actually resolves under `tsc --noEmit`
 *
 * Deliberately scans the GENERATED OUTPUT for `@saas/*` imports (rather
 * than hardcoding "auth" + "payments") so this stays a real regression
 * guard if a future change (e.g. the rate-limit -> @saas/supabase-guard
 * unification) adds another workspace import to a copied file.
 */

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const TSX_BIN = path.join(REPO_ROOT, "node_modules", ".bin", "tsx");
const TSC_BIN = path.join(REPO_ROOT, "node_modules", ".bin", "tsc");
const CREATE_APP_SCRIPT = path.join(REPO_ROOT, "scripts", "create-app.ts");

const SAAS_IMPORT_RE = /@saas\/([a-zA-Z0-9_-]+)/g;

function collectFiles(dir: string, out: string[]) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "packages") continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) collectFiles(p, out);
    // .ts/.tsx only: the actual `@saas/*`-importing shims are all TS app
    // code. next.config.js is deliberately excluded even though it now
    // legitimately CONTAINS the string "@saas/auth" (in
    // transpilePackages) — that's config data, not an import to
    // typecheck, and feeding a plain .js file into the tsc "files" list
    // below would fail with TS6504 (allowJs) for reasons unrelated to
    // this regression guard.
    else if (/\.tsx?$/.test(entry.name)) out.push(p);
  }
}

/**
 * Scans the generated app's OWN code (excluding node_modules/ and the
 * packages/ we copy in ourselves) for `@saas/<name>` import specifiers.
 * Returns the unique package names found + the relative file paths that
 * reference them (used to drive the tsc smoke check below).
 */
function scanGeneratedSaasImports(outDir: string): {
  names: Set<string>;
  relFiles: string[];
} {
  const files: string[] = [];
  collectFiles(outDir, files);

  const names = new Set<string>();
  const relFiles: string[] = [];
  for (const f of files) {
    const content = fs.readFileSync(f, "utf8");
    const matches = content.match(SAAS_IMPORT_RE);
    if (matches && matches.length > 0) {
      relFiles.push(path.relative(outDir, f));
      for (const m of matches) names.add(m.slice("@saas/".length));
    }
  }
  return { names, relFiles };
}

describe("create-app scaffold — @saas/* workspace package generation", () => {
  const tempDirs: string[] = [];
  let outDir: string;
  let pkgJson: { dependencies?: Record<string, string> };
  let nextConfigContent: string;
  let saasImports: { names: Set<string>; relFiles: string[] };

  beforeAll(() => {
    outDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "create-app-scaffold-pkg-test-")
    );
    tempDirs.push(outDir);

    execFileSync(
      TSX_BIN,
      [CREATE_APP_SCRIPT, "--name", "scaffold-pkg-test", "--out", outDir],
      { cwd: REPO_ROOT, encoding: "utf8" }
    );

    pkgJson = JSON.parse(
      fs.readFileSync(path.join(outDir, "package.json"), "utf8")
    );
    nextConfigContent = fs.readFileSync(
      path.join(outDir, "next.config.js"),
      "utf8"
    );
    saasImports = scanGeneratedSaasImports(outDir);
  }, 60_000);

  afterAll(() => {
    while (tempDirs.length > 0) {
      fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
    }
  });

  it("sanity check: the generated app actually imports @saas/* (regression guard would be vacuous otherwise)", () => {
    expect(saasImports.relFiles.length).toBeGreaterThan(0);
    expect(Array.from(saasImports.names).sort()).toEqual(
      expect.arrayContaining(["auth", "payments"])
    );
  });

  it("declares a file: dependency in package.json for every @saas/* import found in the generated app", () => {
    for (const name of Array.from(saasImports.names)) {
      const dep = pkgJson.dependencies?.[`@saas/${name}`];
      expect(dep, `missing "@saas/${name}" in generated package.json dependencies`).toBeTruthy();
      expect(dep!.startsWith("file:"), `"@saas/${name}" dependency ("${dep}") is not a file: reference`).toBe(true);

      const target = path.resolve(outDir, dep!.slice("file:".length));
      expect(
        fs.existsSync(path.join(target, "package.json")),
        `"@saas/${name}" file: target ${target} was not actually copied into the generated app`
      ).toBe(true);
    }
  });

  it("copies the actual @saas/* package source (not just the dependency declaration)", () => {
    for (const name of Array.from(saasImports.names)) {
      const srcDir = path.join(outDir, "packages", name, "src");
      expect(
        fs.existsSync(srcDir),
        `packages/${name}/src was not copied into the generated app`
      ).toBe(true);
    }
  });

  it("adds every @saas/* workspace package to next.config.js transpilePackages", () => {
    expect(nextConfigContent).toMatch(/transpilePackages/);
    for (const name of Array.from(saasImports.names)) {
      expect(nextConfigContent).toContain(`@saas/${name}`);
    }
  });

  it("resolves cleanly under tsc --noEmit (proves the @saas/* imports are not dangling)", () => {
    // Reuse this repo's own node_modules (already `npm install`-ed with the
    // real @saas/* workspace symlinks) purely for TYPE RESOLUTION — this
    // does NOT require running `npm install` inside the generated app, and
    // it is the exact node_modules layout `npm install` would produce for
    // the file: dependencies we just asserted above.
    const nmLink = path.join(outDir, "node_modules");
    if (!fs.existsSync(nmLink)) {
      fs.symlinkSync(path.join(REPO_ROOT, "node_modules"), nmLink, "dir");
    }

    const checkTsconfigPath = path.join(outDir, "tsconfig.scaffold-check.json");
    fs.writeFileSync(
      checkTsconfigPath,
      JSON.stringify(
        {
          extends: "./tsconfig.json",
          compilerOptions: { noEmit: true },
          include: [],
          files: saasImports.relFiles,
        },
        null,
        2
      )
    );

    try {
      execFileSync(TSC_BIN, ["-p", checkTsconfigPath], {
        cwd: outDir,
        encoding: "utf8",
      });
    } catch (err) {
      const e = err as { stdout?: string; stderr?: string };
      throw new Error(
        `tsc failed to resolve the generated app's @saas/* imports:\n${e.stdout ?? ""}\n${e.stderr ?? ""}`
      );
    }
  }, 60_000);
});
