// GET  /api/admin/tenants/[tenantId]/membership-questions — Guard: なし (公開: 申請フォーム用)
// POST /api/admin/tenants/[tenantId]/membership-questions — Guard: requireRole(admin), Audit: membership_question.create

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
  { params }: { params: Promise<{ tenantId: string }> }
) {
  try {
    const { tenantId } = await params;

    const supabase = createAdminClient();

    const { data: questions, error } = await supabase
      .from("membership_questions")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("sort_order", { ascending: true });

    if (error) {
      throw new GuardError(500, `Failed to fetch questions: ${error.message}`);
    }

    return Response.json({ questions: questions ?? [] });
  } catch (error) {
    return handleGuardError(error);
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  try {
    const { tenantId } = await params;
    const authUser = await requireAuth();
    await requireRole(authUser.id, tenantId, "admin");

    const body = await req.json();
    const { question_text, is_required, sort_order } = body;

    if (!question_text) {
      throw new GuardError(400, "question_text is required");
    }

    const supabase = createAdminClient();

    const { data: question, error } = await supabase
      .from("membership_questions")
      .insert({
        tenant_id: tenantId,
        question_text,
        is_required: is_required ?? true,
        sort_order: sort_order ?? 0,
      })
      .select()
      .single();

    if (error) {
      throw new GuardError(500, `Failed to create question: ${error.message}`);
    }

    await writeAuditLog({
      tenantId,
      actorUserId: authUser.id,
      action: "membership_question.create",
      resourceType: "membership_question",
      resourceId: question.id,
      after: question,
    });

    return Response.json({ question }, { status: 201 });
  } catch (error) {
    return handleGuardError(error);
  }
}
