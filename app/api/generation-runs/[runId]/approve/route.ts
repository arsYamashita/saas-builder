import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/db/supabase/admin";
import { requireCurrentUser } from "@/lib/auth/current-user";

type Props = {
  params: Promise<{ runId: string }>;
};

export async function POST(_req: NextRequest, { params }: Props) {
  try {
    await requireCurrentUser();
    const { runId } = await params;
    const supabase = createAdminClient();

    const { data: run, error: fetchErr } = await supabase
      .from("generation_runs")
      .select("id, status")
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

    return NextResponse.json({ ok: true, runId, review_status: "approved" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      { error: "Failed to approve run", details: message },
      { status: 500 }
    );
  }
}
