import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/db/supabase/admin";
import { requireTenantRole } from "@/lib/rbac/guards";
import { contentFormSchema } from "@/lib/validation/content";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { writeAuditLog } from "@/lib/audit/write-audit-log";

export async function GET() {
  try {
    const membership = await requireTenantRole("admin");
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from("contents")
      .select("*")
      .eq("tenant_id", membership.tenant_id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Fetch contents error:", error.message);
      return NextResponse.json(
        { error: "Failed to fetch contents" },
        { status: 500 }
      );
    }

    return NextResponse.json({ contents: data });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    console.error("Fetch contents unexpected error:", message);

    return NextResponse.json(
      { error: "Failed to fetch contents" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const membership = await requireTenantRole("admin");
    const user = await requireCurrentUser();
    const supabase = createAdminClient();

    const body = await req.json();
    const parsed = contentFormSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const input = parsed.data;

    const { data, error } = await supabase
      .from("contents")
      .insert({
        tenant_id: membership.tenant_id,
        title: input.title,
        body: input.body || null,
        content_type: input.content_type,
        visibility: input.visibility,
        published: input.published,
        published_at: input.published ? new Date().toISOString() : null,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) {
      console.error("Create content error:", error.message);
      return NextResponse.json(
        { error: "Failed to create content" },
        { status: 500 }
      );
    }

    await writeAuditLog({
      tenantId: membership.tenant_id,
      actorUserId: user.id,
      action: "content.create",
      resourceType: "content",
      resourceId: data.id,
      afterJson: data,
    });

    return NextResponse.json({ content: data }, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    console.error("Create content unexpected error:", message);

    return NextResponse.json(
      { error: "Failed to create content" },
      { status: 500 }
    );
  }
}
