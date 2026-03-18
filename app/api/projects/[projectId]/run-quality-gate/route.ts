import { NextRequest, NextResponse } from "next/server";
import {
  createQualityRun,
  updateQualityStep,
  finishQualityRun,
  resolveExtraGateDefinitions,
} from "@/lib/db/quality-runs";
import { getLatestGenerationRun } from "@/lib/db/generation-runs";
import { getProjectExportPath } from "@/lib/utils/project-export-path";
import { runInstall } from "@/lib/quality/run-install";
import { runLint } from "@/lib/quality/run-lint";
import { runTypecheck } from "@/lib/quality/run-typecheck";
import { runPlaywright } from "@/lib/quality/run-playwright";
import { runExtraGate } from "@/lib/quality/run-extra-gate";
import { runTemplateSmoke, buildSmokeSummaryLog } from "@/lib/quality/run-template-smoke";
import { hasTemplateSmokeTests } from "@/lib/quality/template-smoke-registry";

type Props = {
  params: Promise<{ projectId: string }>;
};

export async function POST(_req: NextRequest, { params }: Props) {
  const { projectId } = await params;
  let qualityRunId = "";

  try {
    const latestGenerationRun = await getLatestGenerationRun(projectId);
    const templateKey = latestGenerationRun?.template_key ?? null;

    const qualityRun = await createQualityRun(
      projectId,
      latestGenerationRun?.id ?? null,
      templateKey
    );
    qualityRunId = qualityRun.id;

    const projectDir = getProjectExportPath(projectId);

    // ---------------------------------------------------------------
    // Common gates
    // ---------------------------------------------------------------
    const installResult = await runInstall(projectDir);

    await updateQualityStep(qualityRunId, "lint", "running");
    const lintResult = installResult.success
      ? await runLint(projectDir)
      : {
          success: false,
          combined: `npm install failed\n\n${installResult.combined}`,
        };

    await updateQualityStep(
      qualityRunId,
      "lint",
      lintResult.success ? "passed" : "failed",
      lintResult.combined
    );

    await updateQualityStep(qualityRunId, "typecheck", "running");
    const typecheckResult = installResult.success
      ? await runTypecheck(projectDir)
      : {
          success: false,
          combined: "Skipped because install failed",
        };

    await updateQualityStep(
      qualityRunId,
      "typecheck",
      typecheckResult.success ? "passed" : "failed",
      typecheckResult.combined
    );

    await updateQualityStep(qualityRunId, "playwright", "running");
    const playwrightResult =
      installResult.success
        ? await runPlaywright(projectDir)
        : {
            success: false,
            combined: "Skipped because install failed",
          };

    await updateQualityStep(
      qualityRunId,
      "playwright",
      playwrightResult.success ? "passed" : "failed",
      playwrightResult.combined
    );

    let commonPassed =
      installResult.success &&
      lintResult.success &&
      typecheckResult.success &&
      playwrightResult.success;

    // ---------------------------------------------------------------
    // Extra gates (template-specific)
    // ---------------------------------------------------------------
    const extraGates = resolveExtraGateDefinitions(templateKey);
    const extraResults: Record<string, { success: boolean; combined: string }> = {};
    let extraPassed = true;

    for (const gate of extraGates) {
      await updateQualityStep(qualityRunId, gate.key, "running");

      const result = await runExtraGate(gate, projectDir, templateKey ?? "");
      extraResults[gate.key] = result;

      await updateQualityStep(
        qualityRunId,
        gate.key,
        result.success ? "passed" : "failed",
        result.combined
      );

      if (!result.success) {
        extraPassed = false;
      }
    }

    // ---------------------------------------------------------------
    // Template-specific smoke tests
    // ---------------------------------------------------------------
    let smokePassed = true;
    if (templateKey && hasTemplateSmokeTests(templateKey) && installResult.success) {
      await updateQualityStep(qualityRunId, "template_smoke", "running");

      const smokeResult = await runTemplateSmoke(projectDir, templateKey);
      extraResults["template_smoke"] = smokeResult;

      await updateQualityStep(
        qualityRunId,
        "template_smoke",
        smokeResult.success ? "passed" : "failed",
        smokeResult.combined
      );

      smokePassed = smokeResult.success;
      console.log(buildSmokeSummaryLog(templateKey, smokeResult.success));
    }

    // ---------------------------------------------------------------
    // Logging
    // ---------------------------------------------------------------
    const commonKeys = ["lint", "typecheck", "playwright"];
    const extraKeys = extraGates.map((g) => g.key);
    const allFailed = [
      ...(lintResult.success ? [] : ["lint"]),
      ...(typecheckResult.success ? [] : ["typecheck"]),
      ...(playwrightResult.success ? [] : ["playwright"]),
      ...extraGates.filter((g) => !extraResults[g.key]?.success).map((g) => g.key),
      ...(!smokePassed ? ["template_smoke"] : []),
    ];

    console.log(
      `[quality-gates] template=${templateKey ?? "unknown"} common=[${commonKeys.join(",")}] extra=[${extraKeys.join(",")}] failed=[${allFailed.join(",")}]`
    );

    // ---------------------------------------------------------------
    // Finish
    // ---------------------------------------------------------------
    const overallPassed = commonPassed && extraPassed && smokePassed;

    await finishQualityRun(qualityRunId, overallPassed ? "passed" : "failed");

    return NextResponse.json({
      ok: overallPassed,
      qualityRunId,
      install: installResult,
      lint: lintResult,
      typecheck: typecheckResult,
      playwright: playwrightResult,
      ...extraResults,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown quality gate error";

    if (qualityRunId) {
      await updateQualityStep(qualityRunId, "lint", "failed", message).catch(
        () => {}
      );
      await finishQualityRun(qualityRunId, "failed").catch(() => {});
    }

    return NextResponse.json(
      {
        error: "Failed to run quality gate",
        details: message,
      },
      { status: 500 }
    );
  }
}
