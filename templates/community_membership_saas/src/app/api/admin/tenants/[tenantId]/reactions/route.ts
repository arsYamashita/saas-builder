// POST /api/admin/tenants/[tenantId]/reactions — Guard: requireTenantMember
// Toggle reaction (like/unlike). No audit (too noisy).

import { createAdminClient } from "@/lib/db/supabase/admin";
import {
  requireAuth,
  requireTenantMember,
  handleGuardError,
  GuardError,
} from "@/lib/guards";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  try {
    const { tenantId } = await params;
    const authUser = await requireAuth();
    await requireTenantMember(authUser.id, tenantId);

    const body = await req.json();
    const { target_type, target_id, reaction_type } = body;

    if (!target_type || !target_id) {
      throw new GuardError(400, "target_type and target_id are required");
    }

    if (target_type !== "post" && target_type !== "comment") {
      throw new GuardError(400, "target_type must be 'post' or 'comment'");
    }

    const reactionKind = reaction_type ?? "like";
    const supabase = createAdminClient();

    // Check if reaction already exists
    const { data: existing, error: fetchError } = await supabase
      .from("reactions")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("user_id", authUser.id)
      .eq("target_type", target_type)
      .eq("target_id", target_id)
      .eq("reaction_type", reactionKind)
      .maybeSingle();

    if (fetchError) {
      throw new GuardError(500, `Failed to check reaction: ${fetchError.message}`);
    }

    if (existing) {
      // Unlike: remove existing reaction
      const { error: deleteError } = await supabase
        .from("reactions")
        .delete()
        .eq("id", existing.id);

      if (deleteError) {
        throw new GuardError(500, `Failed to remove reaction: ${deleteError.message}`);
      }

      return Response.json({ liked: false });
    }

    // Like: insert new reaction
    const { error: insertError } = await supabase
      .from("reactions")
      .insert({
        tenant_id: tenantId,
        user_id: authUser.id,
        target_type,
        target_id,
        reaction_type: reactionKind,
      });

    if (insertError) {
      throw new GuardError(500, `Failed to add reaction: ${insertError.message}`);
    }

    return Response.json({ liked: true });
  } catch (error) {
    return handleGuardError(error);
  }
}
