// GET  /api/admin/tenants/[tenantId]/modules/[moduleId]/lessons — Guard: requireRole(editor)
// POST /api/admin/tenants/[tenantId]/modules/[moduleId]/lessons — Guard: requireRole(admin), Audit: lesson.create

import { createAdminClient } from "@/lib/db/supabase/admin";
import {
  requireAuth,
  requireRole,
  handleGuardError,
  GuardError,
} from "@/lib/guards";
import { writeAuditLog } from "@/lib/audit";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ tenantId: string; moduleId: string }> }
) {
  try {
    const { tenantId, moduleId } = await params;
    const authUser = await requireAuth();
    await requireRole(authUser.id, tenantId, "editor");

    const supabase = createAdminClient();

    // モジュールの存在確認
    const { data: mod, error: modError } = await supabase
      .from("course_modules")
      .select("id")
      .eq("id", moduleId)
      .eq("tenant_id", tenantId)
      .single();

    if (modError || !mod) {
      throw new GuardError(404, "Module not found");
    }

    const { data: lessons, error } = await supabase
      .from("course_lessons")
      .select("*")
      .eq("module_id", moduleId)
      .eq("tenant_id", tenantId)
      .order("sort_order", { ascending: true });

    if (error) {
      throw new GuardError(500, `Failed to fetch lessons: ${error.message}`);
    }

    return Response.json({ lessons: lessons ?? [] });
  } catch (error) {
    return handleGuardError(error);
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ tenantId: string; moduleId: string }> }
) {
  try {
    const { tenantId, moduleId } = await params;
    const authUser = await requireAuth();
    await requireRole(authUser.id, tenantId, "admin");

    const supabase = createAdminClient();

    // モジュールの存在確認
    const { data: mod, error: modError } = await supabase
      .from("course_modules")
      .select("id")
      .eq("id", moduleId)
      .eq("tenant_id", tenantId)
      .single();

    if (modError || !mod) {
      throw new GuardError(404, "Module not found");
    }

    const body = await req.json();
    const {
      title,
      slug,
      body: lessonBody,
      video_url,
      video_duration_seconds,
      transcript,
      sort_order,
      is_preview,
      drip_days,
      unlock_level,
    } = body;

    if (!title || !slug) {
      throw new GuardError(400, "title and slug are required");
    }

    const { data: lesson, error } = await supabase
      .from("course_lessons")
      .insert({
        module_id: moduleId,
        tenant_id: tenantId,
        title,
        slug,
        body: lessonBody ?? null,
        video_url: video_url ?? null,
        video_duration_seconds: video_duration_seconds ?? null,
        transcript: transcript ?? null,
        sort_order: sort_order ?? 0,
        is_preview: is_preview ?? false,
        drip_days: drip_days ?? null,
        unlock_level: unlock_level ?? null,
      })
      .select()
      .single();

    if (error) {
      throw new GuardError(500, `Failed to create lesson: ${error.message}`);
    }

    await writeAuditLog({
      tenantId,
      actorUserId: authUser.id,
      action: "lesson.create",
      resourceType: "course_lesson",
      resourceId: lesson.id,
      after: lesson,
    });

    return Response.json({ lesson }, { status: 201 });
  } catch (error) {
    return handleGuardError(error);
  }
}
