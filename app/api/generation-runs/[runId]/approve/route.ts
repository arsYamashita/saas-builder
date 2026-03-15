import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/db/supabase/admin";
import { writeAuditLog } from "@/lib/audit/write-audit-log";

type Props = {
  params: Promise<{ runId: string }>;
};

export async function POST(_req: NextRequest, { params }: Props) {
  try {
    const { runId } = await params;
    const supabase = createAdminClient();

    const { data: run, error: fetchErr } = await supabase
      .from("generation_runs")
      .select("id, status, project_id")
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
        { error: "Only completed runs can be approved" },
        { status: 400 }
      );
    }

    const { error: updateErr } = await supabase
      .from("generation_runs")
      .update({
        review_status: "approved",
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", runId);

    if (updateErr) {
      return NextResponse.json(
        { error: "Failed to approve run", details: updateErr.message },
        { status: 500 }
      );
    }

    // Audit log (non-blocking)
    const { data: proj } = await supabase
      .from("projects")
      .select("tenant_id")
      .eq("id", run.project_id)
      .single();

    if (proj) {
      writeAuditLog({
        tenantId: proj.tenant_id,
        action: "generation_run.approve",
        resourceType: "generation_run",
        resourceId: runId,
        beforeJson: { review_status: "pending" },
        afterJson: { review_status: "approved" },
      });
    }

    return NextResponse.json({ ok: true, runId, review_status: "approved" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to approve run", details: message },
      { status: 500 }
    );
  }
}
