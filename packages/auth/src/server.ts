/**
 * @saas/auth/server — the server-only entrypoint.
 *
 * `import "server-only"` makes any attempt to pull this entrypoint (and
 * therefore `next/headers` / the service-role admin client) into a Client
 * Component module graph a build-time error in Next.js, instead of a
 * confusing runtime/bundle failure. Client Components must use
 * `@saas/auth/client` instead.
 */
import "server-only";

export { createServerSupabaseClient } from "./clients/server";
export { createAdminSupabaseClient } from "./clients/admin";
export { getAuthSession } from "./session";
export { assertTenantScopedRow } from "./rls-guard";
