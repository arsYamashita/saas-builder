import { NextRequest, NextResponse } from "next/server";
import {
  createQualityRun,
  updateQualityStep,
  finishQualityRun,
} from "@/lib/db/quality-runs";
import { getLatestGenerationRun } from "@/lib/db/generation-runs";
import { getProjectExportPath } from "@/lib/utils/project-export-path";
import { runInstall } from "@/lib/quality/run-install";
import { runLint } from "@/lib/quality/run-lint";
import { runTypecheck } from "@/lib/quality/run-typecheck";
import { runPlaywright } from "@/lib/quality/run-playwright";

type Props = {
  params: Promise<{ projectId: string }>;
};

export async function POST(_req: NextRequest, { params }: Props) {
  const { projectId } = await params;
  let qualityRunId = "";

  try {
    const latestGenerationRun = await getLatestGenerationRun(projectId);
    const qualityRun = await createQualityRun(
      projectId,
      latestGenerationRun?.id ?? null
    );
    qualityRunId = qualityRun.id;

    const projectDir = getProjectExportPath(projectId);

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

    const overallPassed =
      installResult.success &&
      lintResult.success &&
      typecheckResult.success &&
      playwrightResult.success;

    await finishQualityRun(qualityRunId, overallPassed ? "passed" : "failed");

    return NextResponse.json({
      ok: overallPassed,
      qualityRunId,
      install: installResult,
      lint: lintResult,
      typecheck: typecheckResult,
      playwright: playwrightResult,
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
