# Baseline: reservation_saas GREEN v1

## Status

- npm install: pass
- lint: pass
- typecheck: pass
- playwright: pass

## Fixed Test Input

- name: BookEasy First Run
- templateKey: reservation_saas
- fixture: `tests/fixtures/reservation-saas-first-run.json`
- first GREEN project ID: 5d53dc3b-b072-40b2-ab18-61d3b57931e7

## GREEN Prerequisites

### Shared Core (same as MCA)

- auth / tenant / rbac / audit / scaffold は共通コアを使う
- tsconfig: `@/*` → `./src/*`, baseUrl `.`, strict false
- `src/lib/supabase/server.ts` — async cookies() for Next.js 15 (scaffold)
- `src/lib/supabase/client.ts` — createBrowserClient wrapper (scaffold)

### reservation_saas 固有

- affiliate: disabled (`affiliate.enabled: false`)
- billing: none (`billingModel: "none"`)
- blueprint validation で `commission_type: "none"` を許可する（`lib/validation/blueprint.ts`）
- domain entities: services, reservations, customers, staff_members
- roles: owner, admin, staff（member は含まない）

## Permanent Fixes Applied Before GREEN

| Fix | File | Detail |
|-----|------|--------|
| commission_type "none" | `lib/validation/blueprint.ts` | affiliate disabled テンプレ用に enum 拡張 |

## Exported Scaffold Files (root)

- package.json
- tsconfig.json
- next.config.ts
- playwright.config.ts
- eslint.config.mjs
- middleware.ts
- app/layout.tsx
- app/page.tsx
- tests/playwright/auth.spec.ts
- tests/playwright/smoke.spec.ts
- src/lib/supabase/server.ts
- src/lib/supabase/client.ts

## Where to Look When It Breaks

### 1. Blueprint Validation

- `lib/validation/blueprint.ts` — Zod schema for blueprint output
- Check: does the schema accommodate reservation_saas valid output values?
- Especially: `commission_type`, `billing.model` enums

### 2. Prompt Routing

- `lib/ai/template-prompt-resolver.ts` — template-specific prompt paths
- Check: does reservation_saas resolve to `final/reservation_saas/*.md`?

### 3. Scaffold

- `lib/quality/scaffold/` — all scaffold generators
- `lib/quality/write-export-scaffold.ts` — scaffold writer
- Check: are all compat files being written?

### 4. Generated Imports

- AI-generated files import from `@/lib/supabase/server` etc.
- Check: do the imported paths match files that exist (scaffold or AI-generated)?

### 5. Domain-Specific Prompts

- `prompts/final/reservation_saas/` — all reservation_saas prompts
- Check: are entities/roles/routes consistent across prompts?

## Regression Testing

### Run Command

```bash
npm run regression:rsv
# or
bash scripts/run-rsv-regression.sh
```

### Automated Comparison

- Baseline JSON: `tests/baselines/reservation-saas-green-v1.json`
- Compare script: `scripts/compare-rsv-baseline.sh`
- Integrated in: `scripts/run-rsv-regression.sh` (auto-runs after generation)

### Minimum GREEN Judgment

All of these must be true:
1. Generation completed (all 6 steps)
2. lint: passed
3. typecheck: passed
4. playwright: passed
5. generated_files count > 0

## Known Fragile Points

1. AI が `commission_type: "none"` 以外の値を返すと validation fail する可能性あり
2. reservation_saas prompts は MCA コピーベース。AI が MCA 用語（member, content, affiliate）を混入させるリスクあり
3. `src/lib/permissions/rbac.ts` は AI 生成のみ。scaffold fallback なし
