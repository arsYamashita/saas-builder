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

## Regression Testing

### Fixture

- Path: `tests/fixtures/membership-content-affiliate-saloncore-first-run.json`
- Content: same as Fixed Test Input in `docs/runbooks/05-first-template-execution.md`

### Run Command

```bash
npm run regression:mca
# or
bash scripts/run-mca-regression.sh
```

### Comparison Items

| Item | GREEN Condition |
|------|----------------|
| generation overall_status | completed |
| lint_status | pass |
| typecheck_status | pass |
| playwright_status | pass |
| generated_files count | > 0 |
| blueprints count | >= 1 |
| implementation_runs count | >= 1 |
| all 6 generation steps | completed |

### Minimum GREEN Judgment

All of these must be true:
1. Generation completed (all 6 steps)
2. lint: pass
3. typecheck: pass
4. playwright: pass
5. generated_files count > 0

---

## Automated Comparison

### Files

- Baseline JSON: `tests/baselines/membership-content-affiliate-green-v1.json`
- Compare script: `scripts/compare-mca-baseline.sh`
- Integrated in: `scripts/run-mca-regression.sh` (auto-runs after generation)

### Deterministic Comparison Targets

- Generation steps (6 steps, all "completed")
- Quality gate statuses (lint, typecheck, playwright, all "pass")
- Saved counts (blueprints, implementation_runs, generated_files meet minimums)
- Required file paths exist in export directory
- Scaffold file paths exist in export directory

### Excluded from Automated Comparison

- AI-generated code content (non-deterministic)
- Exact generated_files count (varies with AI output)
- Blueprint/schema/API design content
- File content checksums
- Project ID and timestamps

---

## Known Fragile Points

1. `src/lib/permissions/rbac.ts` is AI-generated only. No scaffold fallback.
2. If AI changes import paths (e.g., `@/utils/supabase/server` instead of `@/lib/supabase/server`), typecheck will break.
3. Next.js 15 async cookies — if scaffold uses sync cookies(), build fails.
