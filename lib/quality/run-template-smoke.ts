import { runCommand } from "@/lib/utils/run-command";
import type { QualityStepResult } from "@/lib/quality/run-install";
import {
  getTemplateSmokeEntry,
  getEnabledScenarios,
} from "@/lib/quality/template-smoke-registry";

/**
 * Run template-specific Playwright smoke tests for a given template.
 *
 * Returns success + combined output. If no smoke tests are registered
 * for the template, returns a pass with a skip message.
 *
 * @param projectDir - The exported project directory
 * @param templateKey - Template key to resolve smoke scenarios
 */
export async function runTemplateSmoke(
  projectDir: string,
  templateKey: string
): Promise<QualityStepResult> {
  const entry = getTemplateSmokeEntry(templateKey);
  const scenarios = getEnabledScenarios(templateKey);

  if (!entry || scenarios.length === 0) {
    return {
      success: true,
      combined: `No template-specific smoke tests for ${templateKey}. Skipping.`,
    };
  }

  // Check if the spec file exists in the exported project
  const checkResult = await runCommand(
    `test -f "${entry.specFile}" && echo "exists" || echo "missing"`,
    projectDir,
    5_000
  );

  if (checkResult.stdout.trim() === "missing") {
    return {
      success: true,
      combined: `Smoke spec file not found: ${entry.specFile}. Skipping.`,
    };
  }

  // Run the template-specific spec file
  const scenarioKeys = scenarios.map((s) => s.key);
  const result = await runCommand(
    `npx playwright test "${entry.specFile}" --reporter=list 2>&1`,
    projectDir,
    180_000
  );

  const header = [
    `[playwright-smoke] template=${templateKey}`,
    `scenarios=[${scenarioKeys.join(",")}]`,
    `exitCode=${result.exitCode}`,
    "",
  ].join("\n");

  const combined = header + [result.stdout, result.stderr].filter(Boolean).join("\n").trim();

  return {
    success: result.exitCode === 0,
    combined,
  };
}

/**
 * Build a summary log line for template smoke execution.
 */
export function buildSmokeSummaryLog(
  templateKey: string,
  passed: boolean
): string {
  const scenarios = getEnabledScenarios(templateKey);
  const scenarioKeys = scenarios.map((s) => s.key);
  const failedKeys = passed ? [] : scenarioKeys;

  return `[playwright-smoke] template=${templateKey} scenarios=[${scenarioKeys.join(",")}] failed=[${failedKeys.join(",")}]`;
}
