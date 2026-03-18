import type { QualityStepResult } from "@/lib/quality/run-install";
import type { QualityGateDefinition } from "@/types/quality-run";
import { checkRoleConsistency } from "@/lib/validation/role-consistency";

/**
 * Built-in gate handlers keyed by tool name.
 * These run in-process instead of shelling out.
 */
const BUILTIN_HANDLERS: Record<
  string,
  (projectDir: string, templateKey: string) => QualityStepResult
> = {
  "role-consistency-check": (projectDir, templateKey) => {
    const result = checkRoleConsistency(projectDir, templateKey);
    const summary = result.passed
      ? `Role consistency passed. ${result.filesScanned} files scanned.`
      : [
          `Role consistency FAILED. ${result.violations.length} violation(s) in ${result.filesScanned} files:`,
          ...result.violations.map(
            (v) => `  ${v.file}:${v.line} — forbidden role "${v.forbiddenRole}": ${v.content}`
          ),
        ].join("\n");

    return { success: result.passed, combined: summary };
  },
};

/**
 * Run a single extra quality gate.
 *
 * Checks for a built-in handler first (e.g. role-consistency-check).
 * Falls back to shell execution via runCommand for unknown tools.
 */
export async function runExtraGate(
  gate: QualityGateDefinition,
  projectDir: string,
  templateKey: string
): Promise<QualityStepResult> {
  const handler = BUILTIN_HANDLERS[gate.tool];
  if (handler) {
    return handler(projectDir, templateKey);
  }

  // Fallback: shell execution
  const { runCommand } = await import("@/lib/utils/run-command");
  const result = await runCommand(`${gate.tool} 2>&1`, projectDir, gate.timeoutMs);

  return {
    success: result.exitCode === 0,
    combined: [result.stdout, result.stderr].filter(Boolean).join("\n").trim(),
  };
}
