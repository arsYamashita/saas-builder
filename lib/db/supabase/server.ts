/**
 * Re-exports the server-side Supabase client from @saas/auth. Kept as a
 * local path (and the original `createClient` name) so existing call sites
 * keep working unchanged after the extraction — see packages/auth/.
 */
export { createServerSupabaseClient as createClient } from "@saas/auth";
