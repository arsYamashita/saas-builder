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

/**
 * Verify the current user has access to the specified generation run via
 * tenant membership. Joins generation_runs → projects to confirm the run
 * belongs to a project owned by the user's active tenant. Prevents IDOR.
 */
export async function requireRunAccess(runId: string) {
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

  const { data: run } = await supabase
    .from("generation_runs")
    .select(
      "id, project_id, template_key, status, review_status, steps_json, projects!inner(tenant_id)"
    )
    .eq("id", runId)
    .eq("projects.tenant_id", tenantUser.tenant_id)
    .single();

  if (!run) {
    throw new Error("Not found");
  }

  return { user, run, tenantId: tenantUser.tenant_id };
}
