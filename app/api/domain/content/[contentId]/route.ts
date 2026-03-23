import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/db/supabase/admin";
import { requireTenantRole } from "@/lib/rbac/guards";
import { contentFormSchema } from "@/lib/validation/content";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { writeAuditLog } from "@/lib/audit/write-audit-log";

type Props = {
  params: Promise<{ contentId: string }>;
};

export async function GET(_req: NextRequest, { params }: Props) {
  try {
    const { contentId } = await params;
    const membership = await requireTenantRole("admin");
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from("contents")
      .select("*")
      .eq("id", contentId)
      .eq("tenant_id", membership.tenant_id)
      .single();

    if (error) {
      console.error("Fetch content error:", error.message);
      return NextResponse.json(
        { error: "Content not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ content: data });
  } catch (error) {
    console.error("Fetch content unexpected error:", error);

    return NextResponse.json(
      { error: "Failed to fetch content" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest, { params }: Props) {
  try {
    const { contentId } = await params;
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

    const { data: before, error: beforeError } = await supabase
      .from("contents")
      .select("*")
      .eq("id", contentId)
      .eq("tenant_id", membership.tenant_id)
      .single();

    if (beforeError) {
      console.error("Fetch content for update error:", beforeError.message);
      return NextResponse.json(
        { error: "Content not found" },
        { status: 404 }
      );
    }

    const { data, error } = await supabase
      .from("contents")
      .update({
        title: input.title,
        body: input.body || null,
        content_type: input.content_type,
        visibility: input.visibility,
        published: input.published,
        published_at: input.published
          ? before.published_at ?? new Date().toISOString()
          : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", contentId)
      .eq("tenant_id", membership.tenant_id)
      .select()
      .single();

    if (error) {
      console.error("Update content error:", error.message);
      return NextResponse.json(
        { error: "Failed to update content" },
        { status: 500 }
      );
    }

    await writeAuditLog({
      tenantId: membership.tenant_id,
      actorUserId: user.id,
      action: "content.update",
      resourceType: "content",
      resourceId: data.id,
      beforeJson: before,
      afterJson: data,
    });

    return NextResponse.json({ content: data });
  } catch (error) {
    console.error("Update content unexpected error:", error);

    return NextResponse.json(
      { error: "Failed to update content" },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: NextRequest, { params }: Props) {
  try {
    const { contentId } = await params;
    const membership = await requireTenantRole("admin");
    const user = await requireCurrentUser();
    const supabase = createAdminClient();

    const { data: before, error: beforeError } = await supabase
      .from("contents")
      .select("*")
      .eq("id", contentId)
      .eq("tenant_id", membership.tenant_id)
      .single();

    if (beforeError) {
      console.error("Fetch content for delete error:", beforeError.message);
      return NextResponse.json(
        { error: "Content not found" },
        { status: 404 }
      );
    }

    const { error } = await supabase
      .from("contents")
      .delete()
      .eq("id", contentId)
      .eq("tenant_id", membership.tenant_id);

    if (error) {
      const isFkViolation = error.code === "23503" || error.message?.includes("foreign key");
      console.error("Delete content error:", error.message);
      return NextResponse.json(
        {
          error: isFkViolation
            ? "Cannot delete content: it is referenced by other records"
            : "Failed to delete content",
        },
        { status: isFkViolation ? 409 : 500 }
      );
    }

    await writeAuditLog({
      tenantId: membership.tenant_id,
      actorUserId: user.id,
      action: "content.delete",
      resourceType: "content",
      resourceId: contentId,
      beforeJson: before,
      afterJson: null,
    });

    return NextResponse.json({ ok: true, deletedId: contentId });
  } catch (error) {
    console.error("Delete content unexpected error:", error);

    return NextResponse.json(
      { error: "Failed to delete content" },
      { status: 500 }
    );
  }
}
