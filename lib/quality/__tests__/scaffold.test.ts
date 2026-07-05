import { describe, it, expect } from "vitest";
import { getScaffoldPackageJson } from "../scaffold/package-json";
import { getScaffoldTsconfig } from "../scaffold/tsconfig-json";
import { getScaffoldEslintConfig } from "../scaffold/eslint-config";
import { getScaffoldMiddlewareTs } from "../scaffold/middleware-ts";
import { getScaffoldNextConfig } from "../scaffold/next-config";
import { getScaffoldGitignore } from "../scaffold/gitignore";
import { getScaffoldPlaywrightConfig } from "../scaffold/playwright-config";
import { getScaffoldVitestConfig } from "../scaffold/vitest-config";
import { getScaffoldEnvExample } from "../scaffold/env-example";
import { getScaffoldNextEnvDts } from "../scaffold/next-env-d-ts";
import { getScaffoldReadmeMd } from "../scaffold/readme-md";

describe("scaffold generators", () => {
  describe("package.json", () => {
    it("returns valid object with expected fields", () => {
      const pkg = getScaffoldPackageJson();
      expect(pkg.name).toBe("generated-saas-template");
      expect(pkg.scripts.dev).toBe("next dev");
      expect(pkg.scripts.lint).toBeTruthy();
      expect(pkg.scripts.typecheck).toBeTruthy();
      expect(pkg.dependencies.next).toBeTruthy();
      expect(pkg.dependencies.react).toBeTruthy();
      expect(pkg.devDependencies.typescript).toBeTruthy();
      expect(pkg.devDependencies["@playwright/test"]).toBeTruthy();
    });
  });

  describe("tsconfig.json", () => {
    it("returns valid compiler options", () => {
      const ts = getScaffoldTsconfig();
      expect(ts.compilerOptions.target).toBe("ES2022");
      expect(ts.compilerOptions.jsx).toBe("preserve");
      expect(ts.compilerOptions.noEmit).toBe(true);
      // Must match docs/rules/02-file-path-rules.md's root-level generated
      // paths (e.g. "app/(generated)/...", "components/domain/...") and the
      // root project's own tsconfig.json — not a "./src/*" alias, which
      // broke module resolution for "@/components/built-with-badge" etc.
      // See [[saas_builder_scaffold_tsconfig_src_alias_mismatch]].
      expect(ts.compilerOptions.paths["@/*"]).toEqual(["./*"]);
      expect(ts.include).toContain("**/*.ts");
    });
  });

  describe("eslint config", () => {
    it("returns string with eslint setup", () => {
      const config = getScaffoldEslintConfig();
      expect(typeof config).toBe("string");
      expect(config).toContain("@eslint/js");
      expect(config).toContain("@typescript-eslint");
      expect(config).toContain(".next/**");
    });
  });

  describe("middleware.ts", () => {
    it("returns string with middleware function", () => {
      const mw = getScaffoldMiddlewareTs();
      expect(typeof mw).toBe("string");
      expect(mw).toContain("export function middleware");
      expect(mw).toContain("/dashboard");
      expect(mw).toContain("NextResponse.next()");
    });
  });

  describe("next.config", () => {
    it("returns string with next config", () => {
      const config = getScaffoldNextConfig();
      expect(typeof config).toBe("string");
    });
  });

  describe("gitignore", () => {
    it("returns string with common ignores", () => {
      const gi = getScaffoldGitignore();
      expect(typeof gi).toBe("string");
      expect(gi).toContain("node_modules");
      expect(gi).toContain(".next");
    });
  });

  describe("playwright config", () => {
    it("returns string with playwright setup", () => {
      const config = getScaffoldPlaywrightConfig();
      expect(typeof config).toBe("string");
      expect(config).toContain("playwright");
    });
  });

  // Regression: package.json wires "test"/"test:unit" to `vitest run`, but
  // the scaffold previously shipped NO vitest.config.ts (only the offline
  // create-app CLI wrote one inline). In a DB-driven export, Vitest then
  // picked up tests/playwright/*.spec.ts and `npm test` failed out of the
  // box on the '@playwright/test' runtime context.
  describe("vitest config", () => {
    it("excludes the Playwright spec directory so npm test doesn't pick up e2e specs", () => {
      const config = getScaffoldVitestConfig();
      expect(typeof config).toBe("string");
      expect(config).toContain("tests/playwright");
      expect(config).toContain("node_modules");
    });

    it("passes with no tests (a plain DB-driven export may ship zero unit tests)", () => {
      expect(getScaffoldVitestConfig()).toContain("passWithNoTests: true");
    });

    it("mirrors tsconfig's root-level '@' alias", () => {
      const config = getScaffoldVitestConfig();
      expect(config).toContain('"@": path.resolve(__dirname, ".")');
    });
  });

  // Regression: the documented flow is `cp .env.example .env.local` — an
  // empty `GEMINI_API_KEY=` line becomes a present-but-empty string in
  // process.env and used to trip startup validation for keys that are
  // supposed to be optional. Optional keys must therefore be COMMENTED OUT
  // in the scaffold env example, never bare `KEY=` lines.
  // See [[missing_env_validation_startup]] / [[stripe_env_optional_in_zod]].
  describe(".env.example", () => {
    const envExample = getScaffoldEnvExample();
    const uncommentedKeys = envExample
      .split("\n")
      .filter((line) => /^[A-Z0-9_]+=/.test(line))
      .map((line) => line.split("=")[0]);

    it("lists exactly the required keys as uncommented lines", () => {
      expect(uncommentedKeys.sort()).toEqual(
        [
          "NEXT_PUBLIC_APP_URL",
          "NEXT_PUBLIC_SUPABASE_ANON_KEY",
          "NEXT_PUBLIC_SUPABASE_URL",
          "SUPABASE_SERVICE_ROLE_KEY",
        ].sort()
      );
    });

    it("ships every optional key commented out (never a bare KEY= line)", () => {
      for (const key of [
        "STRIPE_SECRET_KEY",
        "STRIPE_WEBHOOK_SECRET",
        "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
        "UPSTASH_REDIS_REST_URL",
        "UPSTASH_REDIS_REST_TOKEN",
        "GEMINI_API_KEY",
        "CLAUDE_API_KEY",
        "OPENAI_API_KEY",
      ]) {
        expect(envExample).toContain(`#${key}=`);
        expect(uncommentedKeys).not.toContain(key);
      }
    });
  });

  describe("next-env.d.ts", () => {
    it("returns string with triple-slash directive", () => {
      const env = getScaffoldNextEnvDts();
      expect(typeof env).toBe("string");
      expect(env).toContain("next");
    });
  });

  describe("readme.md", () => {
    it("returns string", () => {
      const readme = getScaffoldReadmeMd("proj-123");
      expect(typeof readme).toBe("string");
      expect(readme).toContain("proj-123");
      expect(readme).toContain("npm install");
    });
  });
});
