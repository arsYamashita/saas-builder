/**
 * @saas/auth — root entrypoint. UNIVERSAL (environment-agnostic) exports
 * only.
 *
 * The client/server factories deliberately do NOT live here: a mixed
 * barrel would let a Client Component import transitively pull
 * `next/headers` (a server-only API) into the client module graph and
 * break the Next.js client build. Import from the environment-specific
 * entrypoints instead:
 *
 *   - `@saas/auth/client` — browser client factory (Client Components)
 *   - `@saas/auth/server` — server/admin client factories + getAuthSession
 *     (Route Handlers, Server Components, Server Actions; guarded by
 *     `import "server-only"`)
 *
 * See this package's README.md for the mandatory usage rules (the
 * service-role admin client bypasses RLS — application code must enforce
 * tenant boundaries itself).
 */
export { assertTenantScopedRow } from "./rls-guard";
