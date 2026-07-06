/**
 * Re-exports the service-role Supabase client from @saas/auth. Kept as a
 * local path (and the original `createAdminClient` name) so existing call
 * sites / test mocks (`vi.mock("@/lib/db/supabase/admin", ...)`) keep
 * working unchanged after the extraction — see packages/auth/.
 *
 * IMPORTANT: this client bypasses Row Level Security entirely — see
 * packages/auth/README.md for the tenant-boundary rules that apply to
 * every query made with it.
 */
export { createAdminSupabaseClient as createAdminClient } from "@saas/auth";
