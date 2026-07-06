/**
 * @saas/auth/client — the browser-safe entrypoint.
 *
 * Client Components must import from here (or via the app's
 * `@/lib/db/supabase/client` shim), NEVER from `@saas/auth/server` or a
 * mixed barrel: the server entrypoint imports `next/headers` (via the
 * server client factory) and `server-only`, both of which break the Next.js
 * client bundle if they enter the client module graph.
 */
export { createBrowserSupabaseClient } from "./clients/browser";
