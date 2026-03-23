import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/db/supabase/admin";
import { buildScoreboard } from "@/lib/providers/template-scoreboard";
import { TEMPLATE_REGISTRY } from "@/lib/templates/template-registry";
import { requireCurrentUser } from "@/lib/auth/current-user";

export async function GET() {
  try {
    await requireCurrentUser();
    const supabase = createAdminClient();

    // Fetch all data in parallel
    const [
      { data: generationRuns, error: grErr },
      { data: qualityRuns, error: qrErr },
      { data: projects },
      { data: blueprints },
    ] = await Promise.all([
      supabase
        .from("generation_runs")
        .select("id, template_key, status, review_status, reviewed_at, promoted_at, baseline_tag")
        .order("started_at", { ascending: false }),
      supabase
        .from("quality_runs")
        .select("generation_run_id, status")
        .order("started_at", { ascending: false }),
      supabase
        .from("projects")
        .select("id, template_key"),
      supabase
        .from("blueprints")
        .select("project_id, review_status, version")
        .order("version", { ascending: false }),
    ]);

    if (grErr) {
      return NextResponse.json(
        { error: "Failed to fetch generation runs", details: grErr.message },
        { status: 500 }
      );
    }

    if (qrErr) {
      return NextResponse.json(
        { error: "Failed to fetch quality runs", details: qrErr.message },
        { status: 500 }
      );
    }

    // Build blueprint status per template: pick latest blueprint per project, then per template
    const bpByTemplate = new Map<string, string | null>();
    if (projects && blueprints) {
      const projectTemplateMap = new Map(projects.map((p: { id: string; template_key: string }) => [p.id, p.template_key]));
      const seen = new Set<string>(); // track first (latest) blueprint per project
      for (const bp of blueprints) {
        if (seen.has(bp.project_id)) continue;
        seen.add(bp.project_id);
        const tmpl = projectTemplateMap.get(bp.project_id);
        if (tmpl && !bpByTemplate.has(tmpl)) {
          bpByTemplate.set(tmpl, bp.review_status ?? "pending");
        }
      }
    }

    // Build template labels from registry
    const templateLabels = Object.entries(TEMPLATE_REGISTRY).map(
      ([key, entry]) => ({
        templateKey: key,
        label: entry.label,
      })
    );

    const blueprintStatuses = Array.from(bpByTemplate.entries()).map(([k, v]) => ({
      project_template_key: k,
      review_status: v,
    }));

    const scoreboard = buildScoreboard(
      (generationRuns ?? []).map((r) => ({
        id: r.id,
        template_key: r.template_key,
        status: r.status,
        review_status: r.review_status ?? "pending",
        reviewed_at: r.reviewed_at ?? null,
        promoted_at: r.promoted_at ?? null,
        baseline_tag: r.baseline_tag ?? null,
      })),
      (qualityRuns ?? []).map((q) => ({
        generation_run_id: q.generation_run_id,
        status: q.status,
      })),
      templateLabels,
      blueprintStatuses
    );

    return NextResponse.json(scoreboard);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      { error: "Failed to build scoreboard", details: message },
      { status: 500 }
    );
  }
}
