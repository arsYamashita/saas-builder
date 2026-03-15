import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/db/supabase/admin";
import { getTemplateShortName } from "@/lib/templates/template-registry";
import { writeAuditLog } from "@/lib/audit/write-audit-log";

type Props = {
  params: Promise<{ runId: string }>;
};

export async function POST(req: NextRequest, { params }: Props) {
  try {
    const { runId } = await params;
    const body = await req.json().catch(() => ({}));
    const supabase = createAdminClient();

    // Fetch generation run
    const { data: run, error: fetchErr } = await supabase
      .from("generation_runs")
      .select("id, project_id, template_key, status, review_status")
      .eq("id", runId)
      .single();

    if (fetchErr || !run) {
      return NextResponse.json(
        { error: "Generation run not found" },
        { status: 404 }
      );
    }

    if (run.status !== "completed") {
      return NextResponse.json(
        { error: "Only completed runs can be promoted" },
        { status: 400 }
      );
    }

    if (run.review_status !== "approved") {
      return NextResponse.json(
        {
          error: "Only approved runs can be promoted to baseline",
          current_review_status: run.review_status,
        },
        { status: 400 }
      );
    }

    // Check latest blueprint is approved
    const { data: latestBlueprint, error: bpErr } = await supabase
      .from("blueprints")
      .select("id, review_status")
      .eq("project_id", run.project_id)
      .order("version", { ascending: false })
      .limit(1)
      .single();

    if (bpErr || !latestBlueprint) {
      return NextResponse.json(
        { error: "No blueprint found for this project — cannot promote" },
        { status: 400 }
      );
    }

    if (latestBlueprint.review_status !== "approved") {
      return NextResponse.json(
        {
          error: "Blueprint must be approved before promoting a generation run",
          blueprint_review_status: latestBlueprint.review_status ?? "pending",
        },
        { status: 400 }
      );
    }

    // Check quality gates passed
    const { data: qualityRun } = await supabase
      .from("quality_runs")
      .select("id, status, checks_json")
      .eq("generation_run_id", runId)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!qualityRun || qualityRun.status !== "passed") {
      return NextResponse.json(
        {
          error: "Quality gates must pass before promotion",
          quality_status: qualityRun?.status ?? "none",
        },
        { status: 400 }
      );
    }

    // Verify individual checks
    const checks = (qualityRun.checks_json ?? []) as Array<{ key: string; status: string }>;
    const failedChecks = checks.filter((c) => c.status !== "passed");
    if (failedChecks.length > 0) {
      return NextResponse.json(
        {
          error: "Not all quality checks passed",
          failed_checks: failedChecks.map((c) => c.key),
        },
        { status: 400 }
      );
    }

    // Build baseline tag
    const templateShort = getTemplateShortName(run.template_key);
    const versionLabel = body.versionLabel || `v${Date.now()}`;
    const baselineTag = `baseline/${templateShort}-${versionLabel}`;

    // Insert promotion record
    const { data: promotion, error: insertErr } = await supabase
      .from("baseline_promotions")
      .insert({
        project_id: run.project_id,
        generation_run_id: runId,
        template_key: run.template_key,
        baseline_tag: baselineTag,
        version_label: versionLabel,
        status: "draft",
      })
      .select()
      .single();

    if (insertErr) {
      return NextResponse.json(
        { error: "Failed to create promotion", details: insertErr.message },
        { status: 500 }
      );
    }

    // Update generation run with promotion info
    await supabase
      .from("generation_runs")
      .update({
        promoted_at: new Date().toISOString(),
        baseline_tag: baselineTag,
      })
      .eq("id", runId);

    // Audit log (non-blocking)
    const { data: proj } = await supabase
      .from("projects")
      .select("tenant_id")
      .eq("id", run.project_id)
      .single();

    if (proj) {
      writeAuditLog({
        tenantId: proj.tenant_id,
        action: "generation_run.promote",
        resourceType: "generation_run",
        resourceId: runId,
        afterJson: { baselineTag, versionLabel, promotionId: promotion.id },
      });
    }

    return NextResponse.json({
      ok: true,
      promotionId: promotion.id,
      baselineTag,
      versionLabel,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to promote run", details: message },
      { status: 500 }
    );
  }
}

// getTemplateShortName is now imported from template-registry
