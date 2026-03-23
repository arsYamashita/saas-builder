import { getAuthSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/db/supabase/admin";

export async function requireCurrentUser() {
  const session = await getAuthSession();

  if (!session.user) {
    throw new Error("Unauthorized");
  }

  const supabase = createAdminClient();

  const { data: userRecord, error } = await supabase
    .from("users")
    .select("*")
    .eq("id", session.user.id)
    .single();

  if (error) {
    throw new Error(`User profile not found: ${error.message}`);
  }

  return {
    id: session.user.id,
    email: session.user.email,
    displayName: userRecord.display_name ?? null,
  };
}

/**
 * Verify the current user has access to the specified project via tenant
 * membership. Prevents IDOR by ensuring the project belongs to the user's
 * active tenant.
 */
export async function requireProjectAccess(projectId: string) {
  const user = await requireCurrentUser();
  const supabase = createAdminClient();

  const { data: tenantUser } = await supabase
    .from("tenant_users")
    .select("tenant_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .single();

  if (!tenantUser) {
    throw new Error("Unauthorized");
  }

  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .eq("tenant_id", tenantUser.tenant_id)
    .single();

  if (!project) {
    throw new Error("Not found");
  }

  return { user, project, tenantId: tenantUser.tenant_id };
}
