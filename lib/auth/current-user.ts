import { getAuthSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/db/supabase/admin";
import { resetStuckSteps } from "@/lib/db/step-review";
import type { GenerationStep } from "@/types/generation-run";

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
 * Return the current user and their active tenant_id.
 * Useful for queries that need tenant scoping without a specific resource.
 */
export async function requireTenantUser() {
  const user = await requireCurrentUser();
  const supabase = createAdminClient();

  // Deterministic ordering: without ORDER BY, Postgres does not guarantee
  // row order, so a user in multiple active tenants could non-deterministically
  // land in a different tenant on each call. Order by created_at + id so the
  // same (earliest-joined) tenant is always selected.
  // See [[multitenant_tenant_selection_nondeterministic]].
  const { data: tenantUser } = await supabase
    .from("tenant_users")
    .select("tenant_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(1)
    .single();

  if (!tenantUser) {
    throw new Error("Unauthorized");
  }

  return { user, tenantId: tenantUser.tenant_id };
}

/**
 * Verify the current user has access to the specified project via tenant
 * membership. Prevents IDOR by ensuring the project belongs to the user's
 * active tenant.
 */
export async function requireProjectAccess(projectId: string) {
  const { user, tenantId } = await requireTenantUser();
  const supabase = createAdminClient();

  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .eq("tenant_id", tenantId)
    .single();

  if (!project) {
    throw new Error("Not found");
  }

  return { user, project, tenantId };
}

/**
 * Verify the current user has access to the specified generation run via
 * tenant membership. Joins generation_runs → projects to confirm the run
 * belongs to a project owned by the user's active tenant. Prevents IDOR.
 */
export async function requireRunAccess(runId: string) {
  const { user, tenantId } = await requireTenantUser();
  const supabase = createAdminClient();

  const { data: run } = await supabase
    .from("generation_runs")
    .select(
      "id, project_id, template_key, status, review_status, steps_json, projects!inner(tenant_id)"
    )
    .eq("id", runId)
    .eq("projects.tenant_id", tenantId)
    .single();

  if (!run) {
    throw new Error("Not found");
  }

  // Lazy stuck-step reset: a step left "running" past
  // STUCK_STEP_THRESHOLD_MS (crashed rerun that never reached its
  // compensating catch/finally) is auto-reset to "failed" the next time
  // anyone reads this run, rather than staying frozen forever.
  // See [[ai_generation_step_stuck_running]].
  const { steps, changed } = resetStuckSteps(run.steps_json as GenerationStep[]);
  if (changed) {
    await supabase
      .from("generation_runs")
      .update({ steps_json: steps, current_step: null })
      .eq("id", runId);
    // Reflect the reset in the returned object too (current_step is not in
    // this query's select list, so only steps_json needs syncing here).
    run.steps_json = steps;
  }

  return { user, run, tenantId };
}
