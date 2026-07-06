import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client. BYPASSES Row Level Security entirely —
 * tenant/role boundaries are NOT enforced by the database for queries made
 * with this client. RLS in this codebase is defense-in-depth; the actual
 * tenant boundary for admin-client queries must be enforced in application
 * code (e.g. an explicit `.eq("tenant_id", tenantId)` on every query, or the
 * `assertTenantScopedRow` guard exported from this package). Do not treat a
 * passing RLS policy as a substitute for that check.
 *
 * Reads `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` from the
 * environment; throws if either is missing.
 */
export function createAdminSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Supabase admin environment variables are missing");
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
