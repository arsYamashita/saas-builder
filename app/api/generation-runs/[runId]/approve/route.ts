import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/db/supabase/admin";
import { requireRunAccess } from "@/lib/auth/current-user";

type Props = {
  params: Promise<{ runId: string }>;
};

export async function POST(_req: NextRequest, { params }: Props) {
  try {
    const { runId } = await params;
    const { run } = await requireRunAccess(runId);
    const supabase = createAdminClient();

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
        { error: "Failed to approve run" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, runId, review_status: "approved" });
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
    return NextResponse.json(
      { error: "Failed to approve run" },
      { status: 500 }
    );
  }
}
