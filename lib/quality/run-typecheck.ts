import { runCommand } from "@/lib/utils/run-command";
import type { QualityStepResult } from "@/lib/quality/run-install";

/**
 * エクスポート済みプロジェクトに対して tsc --noEmit を実行する
 * npm install は run-install で事前に済んでいる前提
 */
export async function runTypecheck(projectDir: string): Promise<QualityStepResult> {
  const result = await runCommand("npx tsc --noEmit 2>&1", projectDir, 120_000);

  return {
    success: result.exitCode === 0,
    combined: [result.stdout, result.stderr].filter(Boolean).join("\n").trim(),
  };
}
