import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/db/supabase/admin";
import { requireRunAccess } from "@/lib/auth/current-user";
import { serverErrorResponse } from "@/lib/api/errors";

type Props = {
  params: Promise<{ runId: string }>;
};

export async function POST(_req: NextRequest, { params }: Props) {
  try {
    const { runId } = await params;
    const { run } = await requireRunAccess(runId);
    const supabase = createAdminClient();

    const { error: updateErr } = await supabase
      .from("generation_runs")
      .update({
        review_status: "rejected",
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", runId);

    if (updateErr) {
      return serverErrorResponse("generation-runs/reject", updateErr, {
        message: "Failed to reject run",
      });
    }

    return NextResponse.json({ ok: true, runId, review_status: "rejected" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (message === "Not found") {
      return NextResponse.json(
        { error: "Generation run not found" },
        { status: 404 }
      );
    }
    return serverErrorResponse("generation-runs/reject", error, {
      message: "Failed to reject run",
    });
  }
}
