import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/db/supabase/admin";
import { blueprintSchema } from "@/lib/validation/blueprint";
import { requireProjectAccess } from "@/lib/auth/current-user";

type Props = {
  params: Promise<{ projectId: string }>;
};

export async function POST(req: NextRequest, { params }: Props) {
  try {
    const { projectId } = await params;
    await requireProjectAccess(projectId);
    const body = await req.json();

    const parsed = blueprintSchema.safeParse(body.blueprint);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid blueprint",
          issues: parsed.error.issues,
        },
        { status: 400 }
      );
    }

    const blueprint = parsed.data;
    const supabase = createAdminClient();

    const { data: existing, error: existingError } = await supabase
      .from("blueprints")
      .select("version")
      .eq("project_id", projectId)
      .order("version", { ascending: false })
      .limit(1);

    if (existingError) {
      return NextResponse.json(
        {
          error: "Failed to check existing blueprints",
          details: existingError.message,
        },
        { status: 500 }
      );
    }

    const nextVersion = existing && existing.length > 0 ? existing[0].version + 1 : 1;

    const { data: inserted, error: insertError } = await supabase
      .from("blueprints")
      .insert({
        project_id: projectId,
        version: nextVersion,
        prd_json: blueprint.product_summary ?? {},
        entities_json: blueprint.entities ?? [],
        screens_json: blueprint.screens ?? [],
        roles_json: blueprint.roles ?? [],
        permissions_json: blueprint.permissions ?? [],
        billing_json: blueprint.billing ?? {},
        affiliate_json: blueprint.affiliate ?? {},
        kpi_json: blueprint.kpis ?? [],
        assumptions_json: blueprint.assumptions ?? [],
        events_json: blueprint.events ?? [],
        mvp_scope_json: blueprint.mvp_scope ?? [],
        future_scope_json: blueprint.future_scope ?? [],
        raw_prompt: body.rawPrompt ?? null,
        source: body.source ?? "gemini",
      })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json(
        { error: "Failed to save blueprint", details: insertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ blueprint: inserted }, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown server error";
    if (message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (message === "Not found") {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    return NextResponse.json(
      { error: "Failed to save blueprint", details: message },
      { status: 500 }
    );
  }
}
