import { runCommand } from "@/lib/utils/run-command";
import type { QualityStepResult } from "@/lib/quality/run-install";

/**
 * エクスポート済みプロジェクトに対して Playwright テストを実行する
 * テストファイルがなければスキップ扱いで pass を返す
 */
export async function runPlaywright(projectDir: string): Promise<QualityStepResult> {
  // テストファイルがあるか確認
  const check = await runCommand(
    "find . -name '*.spec.ts' -o -name '*.test.ts' | head -5",
    projectDir,
    10_000
  );

  if (!check.stdout.trim()) {
    return {
      success: true,
      combined: "No test files found. Skipping Playwright.",
    };
  }

  // Playwright ブラウザインストール
  await runCommand(
    "npx playwright install chromium 2>/dev/null || true",
    projectDir,
    120_000
  );

  const result = await runCommand(
    "npx playwright test --reporter=list 2>&1",
    projectDir,
    180_000
  );

  return {
    success: result.exitCode === 0,
    combined: [result.stdout, result.stderr].filter(Boolean).join("\n").trim(),
  };
}
