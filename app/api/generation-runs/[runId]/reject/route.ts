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

    const { error: updateErr } = await supabase
      .from("generation_runs")
      .update({
        review_status: "rejected",
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", runId);

    if (updateErr) {
      return NextResponse.json(
        { error: "Failed to reject run", details: updateErr.message },
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
        action: "generation_run.reject",
        resourceType: "generation_run",
        resourceId: runId,
        beforeJson: { review_status: run.status === "completed" ? "pending" : run.status },
        afterJson: { review_status: "rejected" },
      });
    }

    return NextResponse.json({ ok: true, runId, review_status: "rejected" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to reject run", details: message },
      { status: 500 }
    );
  }
}
