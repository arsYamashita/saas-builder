import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/db/supabase/admin";
import { requireProjectAccess } from "@/lib/auth/current-user";
import { parseJsonBody, serverErrorResponse } from "@/lib/api/errors";

type Props = {
  params: Promise<{ projectId: string }>;
};

export async function POST(req: NextRequest, { params }: Props) {
  try {
    const { projectId } = await params;
    await requireProjectAccess(projectId);
    // allowEmpty: blueprintId is optional (defaults to the latest blueprint),
    // so an absent body is fine — but a malformed one must 400 instead of
    // being silently coerced to {}. See [[request_json_parse_silent_fallback]].
    const parsedBody = await parseJsonBody<{ blueprintId?: string }>(req, {
      allowEmpty: true,
    });
    if (!parsedBody.ok) return parsedBody.response;
    const body = parsedBody.data;
    const supabase = createAdminClient();

    // If blueprintId is provided, approve that specific blueprint.
    // Otherwise approve the latest blueprint for the project.
    let blueprintId: string | undefined = body.blueprintId;

    if (!blueprintId) {
      const { data: latest, error: fetchErr } = await supabase
        .from("blueprints")
        .select("id")
        .eq("project_id", projectId)
        .order("version", { ascending: false })
        .limit(1)
        .single();

      if (fetchErr || !latest) {
        return NextResponse.json(
          { error: "No blueprint found for this project" },
          { status: 404 }
        );
      }
      blueprintId = latest.id;
    }

    const { error: updateErr } = await supabase
      .from("blueprints")
      .update({
        review_status: "approved",
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", blueprintId)
      .eq("project_id", projectId);

    if (updateErr) {
      // Never return updateErr.message to the client — see
      // [[api_error_message_internal_leak]].
      return serverErrorResponse("projects/approve-blueprint", updateErr, {
        message: "Failed to approve blueprint",
      });
    }

    return NextResponse.json({ ok: true, blueprintId });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown server error";
    if (message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (message === "Not found") {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    return serverErrorResponse("projects/approve-blueprint", error, {
      message: "Failed to approve blueprint",
    });
  }
}
