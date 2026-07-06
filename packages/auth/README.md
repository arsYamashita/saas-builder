# @saas/auth

Shared Supabase Auth client factories, session lookup, and tenant-scoping
guard helpers, extracted from saas-builder so the same hardened auth/RLS
code is reused across saas-builder and generated templates instead of being
re-implemented (and re-broken) per app.

## Entrypoints — pick by environment, never mix

The package is split into three entrypoints so server-only APIs
(`next/headers`, the service-role key) can never enter a Next.js client
bundle. There is deliberately NO mixed barrel that exports both browser
and server factories.

### `@saas/auth/client` — Client Components only

- `createBrowserSupabaseClient()` — browser-side client (anon key + cookies).

### `@saas/auth/server` — Route Handlers / Server Components / Server Actions

Guarded by `import "server-only"`: importing this entrypoint from a Client
Component module graph fails `next build` with a clear error instead of a
confusing bundle failure.

- `createServerSupabaseClient()` — server-side client (anon key + request
  cookies; RLS still applies).
- `createAdminSupabaseClient()` — service-role client. **Bypasses RLS
  entirely.**
- `getAuthSession()` — resolves the current authenticated user from the
  server-side session, or `{ user: null }`.
- `assertTenantScopedRow()` — re-exported for convenience.

### `@saas/auth` (root) — universal helpers only

- `assertTenantScopedRow(row, tenantId, notFoundMessage?)` — IDOR guard;
  throws unless `row` is non-null and `row.tenant_id === tenantId`.

Note for non-Next test runners (vitest etc.): `server-only` throws at
import time outside a `react-server` environment — alias it to an empty
stub module (see the consuming app's `vitest.config.ts`).

## Mandatory usage rules (required on every call site)

### 1. The admin client bypasses RLS — you must still enforce tenant boundaries in code

`createAdminSupabaseClient()` uses the Supabase service-role key, which
**bypasses Row Level Security entirely**. RLS policies (see
`supabase/migrations/0012_enable_rls_tenant_isolation.sql`) are
defense-in-depth here, not the primary boundary — most of this codebase's
API routes query through the admin client, so the tenant/role boundary must
be enforced explicitly in application code on every query
(`.eq("tenant_id", tenantId)`, an owner/role check, etc.).

Do not assume "RLS is enabled on this table" means a query through the
admin client is automatically tenant-scoped — it is not.

### 2. Use `assertTenantScopedRow` on "fetch by id, scoped to tenant" reads

Any handler that fetches a single resource by id and must confirm it
belongs to the caller's tenant (project access, run access, etc.) should
run the result through `assertTenantScopedRow` before returning/using it,
even if the query already had a `.eq("tenant_id", ...)` filter — this is a
second, generic line of defense against a query that's missing or has a
buggy tenant filter, so a bug there fails closed (404) instead of leaking
another tenant's row (IDOR).

```ts
import {
  createAdminSupabaseClient,
  assertTenantScopedRow,
} from "@saas/auth/server";

const supabase = createAdminSupabaseClient();
const { data: project } = await supabase
  .from("projects")
  .select("*")
  .eq("id", projectId)
  .eq("tenant_id", tenantId)
  .single();

const scoped = assertTenantScopedRow(project, tenantId, "Project not found");
```

### 3. Never treat `{ user: null }` from `getAuthSession()` as authenticated

Always check for `null` and reject (401) or redirect to sign-in — don't
fall through to tenant/role logic with a null user.
