import { describe, it, expect } from "vitest";
import { getScaffoldPackageJson } from "../scaffold/package-json";
import { getScaffoldTsconfig } from "../scaffold/tsconfig-json";
import { getScaffoldEslintConfig } from "../scaffold/eslint-config";
import { getScaffoldMiddlewareTs } from "../scaffold/middleware-ts";
import { getScaffoldNextConfig } from "../scaffold/next-config";
import { getScaffoldGitignore } from "../scaffold/gitignore";
import { getScaffoldPlaywrightConfig } from "../scaffold/playwright-config";
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
      expect(ts.compilerOptions.paths["@/*"]).toEqual(["./src/*"]);
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
