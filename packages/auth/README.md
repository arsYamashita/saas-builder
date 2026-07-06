# @saas/auth

Shared Supabase Auth client factories, session lookup, and tenant-scoping
guard helpers, extracted from saas-builder so the same hardened auth/RLS
code is reused across saas-builder and generated templates instead of being
re-implemented (and re-broken) per app.

## Exports

- `createBrowserSupabaseClient()` — browser-side client (anon key + cookies).
- `createServerSupabaseClient()` — server-side client for Route
  Handlers/Server Actions/Server Components (anon key + request cookies;
  RLS still applies).
- `createAdminSupabaseClient()` — service-role client. **Bypasses RLS
  entirely.**
- `getAuthSession()` — resolves the current authenticated user from the
  server-side session, or `{ user: null }`.
- `assertTenantScopedRow(row, tenantId, notFoundMessage?)` — IDOR guard;
  throws unless `row` is non-null and `row.tenant_id === tenantId`.

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
import { createAdminSupabaseClient, assertTenantScopedRow } from "@saas/auth";

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
