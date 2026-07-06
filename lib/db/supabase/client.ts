/**
 * Re-exports the browser-side Supabase client from @saas/auth/client — the
 * browser-safe entrypoint. Kept as a local path (and the original
 * `createClient` name) so existing call sites keep working unchanged after
 * the extraction — see packages/auth/.
 *
 * This shim MUST import from `@saas/auth/client` (never the root barrel or
 * `@saas/auth/server`): Client Components import this module, and the
 * server entrypoint pulls `next/headers` + `server-only` into the module
 * graph, which breaks the Next.js client build.
 */
export { createBrowserSupabaseClient as createClient } from "@saas/auth/client";
