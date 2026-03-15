import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/db/supabase/admin";
import { writeAuditLog } from "@/lib/audit/write-audit-log";

type Props = {
  params: Promise<{ projectId: string }>;
};

export async function POST(req: NextRequest, { params }: Props) {
  try {
    const { projectId } = await params;
    const body = await req.json().catch(() => ({}));
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
      return NextResponse.json(
        { error: "Failed to approve blueprint", details: updateErr.message },
        { status: 500 }
      );
    }

    // Audit log (non-blocking)
    const { data: proj } = await supabase
      .from("projects")
      .select("tenant_id")
      .eq("id", projectId)
      .single();

    if (proj) {
      writeAuditLog({
        tenantId: proj.tenant_id,
        action: "blueprint.approve",
        resourceType: "blueprint",
        resourceId: blueprintId!,
        afterJson: { review_status: "approved" },
      });
    }

    return NextResponse.json({ ok: true, blueprintId });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown server error";
    return NextResponse.json(
      { error: "Failed to approve blueprint", details: message },
      { status: 500 }
    );
  }
}
