import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/db/supabase/admin";
import { buildProviderScoreboard } from "@/lib/providers/provider-scoreboard";
import type { GenerationStep } from "@/types/generation-run";

export async function GET() {
  try {
    const supabase = createAdminClient();

    // Try full select first; fall back to core columns if promoted_at/review_status don't exist yet
    let runs: Record<string, unknown>[] = [];
    const { data: fullRuns, error: fullErr } = await supabase
      .from("generation_runs")
      .select("id, template_key, status, steps_json, promoted_at, review_status")
      .order("started_at", { ascending: false });

    if (fullErr && fullErr.message.includes("does not exist")) {
      // Fallback: migration 0009 not yet applied
      const { data: coreRuns, error: coreErr } = await supabase
        .from("generation_runs")
        .select("id, template_key, status, steps_json")
        .order("started_at", { ascending: false });

      if (coreErr) {
        return NextResponse.json(
          { error: "Failed to fetch generation runs", details: coreErr.message },
          { status: 500 }
        );
      }
      runs = coreRuns ?? [];
    } else if (fullErr) {
      return NextResponse.json(
        { error: "Failed to fetch generation runs", details: fullErr.message },
        { status: 500 }
      );
    } else {
      runs = fullRuns ?? [];
    }

    const scoreboard = buildProviderScoreboard(
      runs.map((r: Record<string, unknown>) => ({
        id: r.id as string,
        template_key: r.template_key as string,
        status: r.status as string,
        steps_json: (r.steps_json ?? []) as GenerationStep[],
        promoted_at: (r.promoted_at as string) ?? null,
        review_status: (r.review_status as string) ?? "pending",
      }))
    );

    return NextResponse.json(scoreboard);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to build provider scoreboard", details: message },
      { status: 500 }
    );
  }
}
