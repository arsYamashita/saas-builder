import path from "node:path";
import { writeTextFile } from "@/lib/utils/write-file";
import { getScaffoldPackageJson } from "@/lib/quality/scaffold/package-json";
import { getScaffoldTsconfig } from "@/lib/quality/scaffold/tsconfig-json";
import { getScaffoldNextConfig } from "@/lib/quality/scaffold/next-config";
import { getScaffoldPlaywrightConfig } from "@/lib/quality/scaffold/playwright-config";
import { getScaffoldEslintConfig } from "@/lib/quality/scaffold/eslint-config";
import { getScaffoldMiddlewareTs } from "@/lib/quality/scaffold/middleware-ts";
import { getScaffoldAppLayoutTsx } from "@/lib/quality/scaffold/app-layout-tsx";
import { getScaffoldAppPageTsx } from "@/lib/quality/scaffold/app-page-tsx";
import { getScaffoldGitignore } from "@/lib/quality/scaffold/gitignore";
import { getScaffoldReadmeMd } from "@/lib/quality/scaffold/readme-md";
import { getScaffoldNextEnvDts } from "@/lib/quality/scaffold/next-env-d-ts";
import { getScaffoldAuthSpec, getScaffoldSmokeSpec } from "@/lib/quality/scaffold/playwright-tests";
import { getScaffoldSupabaseServer } from "@/lib/quality/scaffold/compat-supabase-server";
import { getScaffoldSupabaseClient } from "@/lib/quality/scaffold/compat-supabase-client";

export async function writeExportScaffold(projectDir: string, projectId: string) {
  await writeTextFile(
    path.join(projectDir, "package.json"),
    JSON.stringify(getScaffoldPackageJson(), null, 2)
  );

  await writeTextFile(
    path.join(projectDir, "tsconfig.json"),
    JSON.stringify(getScaffoldTsconfig(), null, 2)
  );

  await writeTextFile(
    path.join(projectDir, "next.config.ts"),
    getScaffoldNextConfig()
  );

  await writeTextFile(
    path.join(projectDir, "playwright.config.ts"),
    getScaffoldPlaywrightConfig()
  );

  await writeTextFile(
    path.join(projectDir, "eslint.config.mjs"),
    getScaffoldEslintConfig()
  );

  await writeTextFile(
    path.join(projectDir, "middleware.ts"),
    getScaffoldMiddlewareTs()
  );

  await writeTextFile(
    path.join(projectDir, "app/layout.tsx"),
    getScaffoldAppLayoutTsx()
  );

  await writeTextFile(
    path.join(projectDir, "app/page.tsx"),
    getScaffoldAppPageTsx()
  );

  await writeTextFile(
    path.join(projectDir, ".gitignore"),
    getScaffoldGitignore()
  );

  await writeTextFile(
    path.join(projectDir, "README.md"),
    getScaffoldReadmeMd(projectId)
  );

  await writeTextFile(
    path.join(projectDir, "next-env.d.ts"),
    getScaffoldNextEnvDts()
  );

  await writeTextFile(
    path.join(projectDir, "tests/playwright/auth.spec.ts"),
    getScaffoldAuthSpec()
  );

  await writeTextFile(
    path.join(projectDir, "tests/playwright/smoke.spec.ts"),
    getScaffoldSmokeSpec()
  );

  // Compatibility files — AI-generated code often imports from these paths
  await writeTextFile(
    path.join(projectDir, "src/lib/supabase/server.ts"),
    getScaffoldSupabaseServer()
  );

  await writeTextFile(
    path.join(projectDir, "src/lib/supabase/client.ts"),
    getScaffoldSupabaseClient()
  );
}
