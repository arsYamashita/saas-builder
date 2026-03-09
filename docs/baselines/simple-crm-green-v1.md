# Baseline: simple_crm_saas GREEN v1

## Status

- npm install: pass
- lint: pass
- typecheck: pass
- playwright: pass

## Fixed Test Input

- name: CRMFlow First Run
- templateKey: simple_crm_saas
- fixture: `tests/fixtures/simple-crm-first-run.json`
- first GREEN project ID: ea3dc501-b7aa-4661-8cc3-76a56a7406d3

## GREEN Prerequisites

### Shared Core (same as MCA/RSV)

- auth / tenant / rbac / audit / scaffold は共通コアを使う
- tsconfig: `@/*` → `./src/*`, baseUrl `.`, strict false
- `src/lib/supabase/server.ts` — async cookies() for Next.js 15 (scaffold)
- `src/lib/supabase/client.ts` — createBrowserClient wrapper (scaffold)

### simple_crm_saas 固有

- billing: disabled (`billingModel: "none"`)
- affiliate: disabled (`affiliateEnabled: false`)
- domain entities: customers, deals, tasks
- notes: optional（MVP scope 外でも可）
- roles: owner, admin, staff（member は含まない）
- blueprint validation で `commission_type: "none"` を許可する（`lib/validation/blueprint.ts`）

## Permanent Fixes Applied Before GREEN

| Fix | File | Detail |
|-----|------|--------|
| commission_type "none" | `lib/validation/blueprint.ts` | affiliate disabled テンプレ用に enum 拡張（RSV で適用済み） |
| project form enum | `lib/validation/project-form.ts` | templateKey に simple_crm_saas を追加 |

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
- Check: does the schema accommodate simple_crm_saas valid output values?

### 2. Prompt Routing

- `lib/ai/template-prompt-resolver.ts` — template-specific prompt paths
- `lib/templates/template-registry.ts` — manifest entry
- Check: does simple_crm_saas resolve to `final/simple_crm_saas/*.md`?

### 3. Scaffold

- `lib/quality/scaffold/` — all scaffold generators
- `lib/quality/write-export-scaffold.ts` — scaffold writer
- Check: are all compat files being written?

### 4. Generated Imports

- AI-generated files import from `@/lib/supabase/server` etc.
- Check: do the imported paths match files that exist (scaffold or AI-generated)?

### 5. Domain-Specific Prompts

- `prompts/final/simple_crm_saas/` — all simple_crm_saas prompts
- Check: are entities/roles/routes consistent across prompts?

## Regression Testing

### Run Command

```bash
npm run regression:crm
# or
bash scripts/run-crm-regression.sh
```

### Automated Comparison

- Baseline JSON: `tests/baselines/simple-crm-green-v1.json`（正本）
- Compare script: `scripts/compare-crm-baseline.sh`
- Integrated in: `scripts/run-crm-regression.sh` (auto-runs after generation)

### Minimum GREEN Judgment

All of these must be true:
1. Generation completed (all 6 steps)
2. lint: passed
3. typecheck: passed
4. playwright: passed
5. generated_files count > 0

## Known Fragile Points

1. AI が CRM 以外のドメイン用語（reservation, content, affiliate）を混入させるリスクあり
2. `src/lib/permissions/rbac.ts` は AI 生成のみ。scaffold fallback なし
3. deal の stage フィールドが enum でない場合、型エラーの可能性あり
