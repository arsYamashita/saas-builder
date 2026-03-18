import { createAdminClient } from "@/lib/db/supabase/admin";
import { QualityCheck, QualityCheckKey, COMMON_QUALITY_GATES } from "@/types/quality-run";
import { TEMPLATE_REGISTRY } from "@/lib/templates/template-registry";
import { hasTemplateSmokeTests } from "@/lib/quality/template-smoke-registry";

const DEFAULT_CHECKS: QualityCheck[] = COMMON_QUALITY_GATES.map((g) => ({
  key: g.key,
  label: g.label,
  status: "pending" as const,
  category: "common" as const,
}));

/**
 * Resolve quality checks for a template.
 * Returns common gates + any template-specific extra gates.
 */
export function resolveQualityChecks(templateKey?: string | null): QualityCheck[] {
  const common = [...DEFAULT_CHECKS];
  if (!templateKey) return common;

  const manifest = TEMPLATE_REGISTRY[templateKey];
  if (!manifest?.extraQualityGates?.length) return common;

  const extras: QualityCheck[] = manifest.extraQualityGates.map((g) => ({
    key: g.key,
    label: g.label,
    status: "pending" as const,
    category: "extra" as const,
  }));

  const smoke: QualityCheck[] = hasTemplateSmokeTests(templateKey)
    ? [{
        key: "template_smoke",
        label: "Template Smoke Tests",
        status: "pending" as const,
        category: "extra" as const,
      }]
    : [];

  return [...common, ...extras, ...smoke];
}

/**
 * Resolve extra quality gate definitions from template manifest.
 * Returns empty array for templates with no extra gates.
 */
export function resolveExtraGateDefinitions(templateKey?: string | null) {
  if (!templateKey) return [];
  const manifest = TEMPLATE_REGISTRY[templateKey];
  return manifest?.extraQualityGates ?? [];
}

export async function createQualityRun(
  projectId: string,
  generationRunId?: string | null,
  templateKey?: string | null
) {
  const supabase = createAdminClient();
  const checks = resolveQualityChecks(templateKey);

  const { data, error } = await supabase
    .from("quality_runs")
    .insert({
      project_id: projectId,
      generation_run_id: generationRunId ?? null,
      status: "running",
      checks_json: checks,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create quality run: ${error.message}`);
  }

  return data;
}

export async function updateQualityStep(
  qualityRunId: string,
  checkKey: QualityCheckKey,
  status: QualityCheck["status"],
  output?: string
) {
  const supabase = createAdminClient();

  const { data: run, error: fetchError } = await supabase
    .from("quality_runs")
    .select("*")
    .eq("id", qualityRunId)
    .single();

  if (fetchError) {
    throw new Error(`Failed to fetch quality run: ${fetchError.message}`);
  }

  const checks = (run.checks_json as QualityCheck[]).map((check) =>
    check.key === checkKey
      ? {
          ...check,
          status,
          ...(output !== undefined
            ? { stdout: output.slice(0, 50_000) }
            : {}),
        }
      : check
  );

  const { error: updateError } = await supabase
    .from("quality_runs")
    .update({ checks_json: checks })
    .eq("id", qualityRunId);

  if (updateError) {
    throw new Error(
      `Failed to update quality step: ${updateError.message}`
    );
  }
}

export async function finishQualityRun(
  qualityRunId: string,
  status: "passed" | "failed" | "error"
) {
  const supabase = createAdminClient();

  const { data: run } = await supabase
    .from("quality_runs")
    .select("checks_json")
    .eq("id", qualityRunId)
    .single();

  const checks = (run?.checks_json as QualityCheck[]) ?? [];
  const passedCount = checks.filter((c) => c.status === "passed").length;
  const failedCount = checks.filter((c) => c.status === "failed").length;
  const summary = `${passedCount} passed, ${failedCount} failed out of ${checks.length} checks`;

  const { error } = await supabase
    .from("quality_runs")
    .update({
      status,
      summary,
      finished_at: new Date().toISOString(),
    })
    .eq("id", qualityRunId);

  if (error) {
    throw new Error(
      `Failed to finish quality run: ${error.message}`
    );
  }
}
