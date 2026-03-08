# Baseline: membership_content_affiliate GREEN v1

## Status

- npm install: pass
- lint: pass
- typecheck: pass
- playwright: pass

## Fixed Test Input

- name: SalonCore First Run
- templateKey: membership_content_affiliate
- project ID: 133691fa-a1d0-4454-8d60-e906b6328815

## GREEN Prerequisites

### tsconfig

- `@/*` path alias maps to `./src/*`
- baseUrl is `.`
- strict is false (scaffold default)

### Compat Files (scaffold-provided)

- `src/lib/supabase/server.ts` — async cookies() for Next.js 15
- `src/lib/supabase/client.ts` — createBrowserClient wrapper

### Compat Files (AI-generated, not scaffolded)

- `src/lib/permissions/rbac.ts` — PERMISSIONS map, Role type, hasPermission/requirePermission
- Risk: if AI fails to generate this file, typecheck breaks because `src/lib/navigation/dashboard-nav.ts` imports from it

### Avoided Patterns

- `request.ip` is NOT used (middleware uses NextRequest without ip access)
- Stripe `apiVersion` is NOT hardcoded in exported code (only in builder-side `lib/billing/stripe.ts`)

## Permanent Fixes Applied Before GREEN

| Fix | File | Detail |
|-----|------|--------|
| tsconfig path alias | `lib/quality/scaffold/tsconfig-json.ts` | `@/*` -> `./src/*` |
| Supabase server compat | `lib/quality/scaffold/compat-supabase-server.ts` | async cookies() for Next.js 15 |
| Supabase client compat | `lib/quality/scaffold/compat-supabase-client.ts` | createBrowserClient wrapper |
| Scaffold writer | `lib/quality/write-export-scaffold.ts` | Writes compat files to `src/lib/supabase/` |

## Exported Scaffold Files (root)

- package.json
- tsconfig.json
- next.config.ts
- playwright.config.ts
- eslint.config.mjs
- middleware.ts
- next-env.d.ts
- .gitignore
- README.md
- app/layout.tsx
- app/page.tsx
- tests/playwright/auth.spec.ts
- tests/playwright/smoke.spec.ts
- src/lib/supabase/server.ts
- src/lib/supabase/client.ts

## Where to Look When It Breaks

### 1. Scaffold

- `lib/quality/scaffold/` — all scaffold generators
- `lib/quality/write-export-scaffold.ts` — scaffold writer
- Check: are all compat files being written?

### 2. Compat Layer

- `lib/quality/scaffold/compat-supabase-server.ts` — async cookies pattern
- `lib/quality/scaffold/compat-supabase-client.ts` — browser client
- Check: does the pattern match the current @supabase/ssr API?

### 3. Path Alias

- `lib/quality/scaffold/tsconfig-json.ts` — paths config
- Check: does `@/*` still resolve to `./src/*`?

### 4. Generated Imports

- AI-generated files import from `@/lib/supabase/server`, `@/lib/permissions/rbac`, etc.
- Check: do the imported paths match files that exist (scaffold or AI-generated)?

## Known Fragile Points

1. `src/lib/permissions/rbac.ts` is AI-generated only. No scaffold fallback.
2. If AI changes import paths (e.g., `@/utils/supabase/server` instead of `@/lib/supabase/server`), typecheck will break.
3. Next.js 15 async cookies — if scaffold uses sync cookies(), build fails.
