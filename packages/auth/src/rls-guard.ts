/**
 * RLS defense-in-depth guard.
 *
 * This codebase's actual multi-tenant boundary is enforced mostly in
 * application code, not the database: most API routes query through the
 * service-role admin client (see `createAdminSupabaseClient`), which
 * BYPASSES Row Level Security entirely. RLS policies in
 * `supabase/migrations` are a second line of defense, not the primary one.
 *
 * `assertTenantScopedRow` is the generic version of the tenant-ownership
 * check every "fetch by id, scoped to the caller's tenant" query needs
 * (e.g. `requireProjectAccess`, `requireRunAccess`): it re-verifies, in
 * application code, that the row that came back actually belongs to the
 * expected tenant — so a query that forgets its `.eq("tenant_id", ...)`
 * filter (or an admin-client query with a bug in that filter) fails closed
 * instead of leaking another tenant's row (IDOR).
 */
export function assertTenantScopedRow<T extends { tenant_id: string }>(
  row: T | null | undefined,
  tenantId: string,
  notFoundMessage = "Not found"
): T {
  if (!row || row.tenant_id !== tenantId) {
    throw new Error(notFoundMessage);
  }

  return row;
}
