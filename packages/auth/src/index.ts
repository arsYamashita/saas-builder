/**
 * @saas/auth — shared Supabase Auth client factories, session lookup, and
 * tenant-scoping (RLS defense-in-depth) guard helpers.
 *
 * See this package's README.md for the mandatory usage rules (the
 * service-role admin client bypasses RLS — application code must enforce
 * tenant boundaries itself) before using any of these exports.
 */
export { createBrowserSupabaseClient } from "./clients/browser";
export { createServerSupabaseClient } from "./clients/server";
export { createAdminSupabaseClient } from "./clients/admin";
export { getAuthSession } from "./session";
export { assertTenantScopedRow } from "./rls-guard";
