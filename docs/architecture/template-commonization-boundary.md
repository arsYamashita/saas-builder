# Template Commonization Boundary

## Purpose

Define what can be shared across templates and what must remain template-specific,
before adding `reservation_saas` as the second template.

Rule: membership_content_affiliate GREEN must not break when a second template is added.

---

## A. Commonize Now (safe to share before adding 2nd template)

These are already template-agnostic in implementation. No code changes needed.

| Component | Current Location | Reason |
|-----------|-----------------|--------|
| Generation pipeline (6-step orchestration) | `app/api/projects/[projectId]/generate-template/route.ts` | Steps are the same for any template. Template key is already stored on project. |
| Generation runs DB | `lib/db/generation-runs.ts` | Tracks steps generically. No template-specific logic. |
| Generated files DB | `lib/db/generated-files.ts` | Stores file_path + content_text. Template-agnostic. |
| Quality gate runner | `lib/quality/run-*.ts` | Runs npm install, lint, typecheck, playwright. Same for any exported project. |
| Export scaffold | `lib/quality/scaffold/*`, `lib/quality/write-export-scaffold.ts` | Writes package.json, tsconfig, compat files. Same for any Next.js + Supabase project. |
| Baseline comparison infra | `scripts/compare-mca-baseline.sh` | Structure is reusable. Only the baseline JSON is template-specific. |
| Regression script structure | `scripts/run-mca-regression.sh` | Pattern is reusable. Fixture and baseline paths are template-specific. |
| Project creation API | `app/api/projects/route.ts` | Already accepts any templateKey. |
| Auth module | `lib/auth/*` | Session, login, signup — no template-specific logic. |
| Tenant module | `lib/tenant/*` | Tenant resolution — no template-specific logic. |
| Audit module | `lib/audit/*` | Generic audit log writer. |
| DB clients | `lib/db/supabase/*` | Admin/server/client wrappers. Template-agnostic. |
| Blueprint validation schema | `lib/validation/blueprint.ts` | Generic structure (entities, screens, roles, billing, affiliate). Works for any template. |

## B. Do NOT Commonize Yet (risk of breaking MCA GREEN)

| Component | Current Location | Why Not |
|-----------|-----------------|---------|
| Final prompts | `prompts/final/01-05-*-final.md` | Hardcoded to `membership_content_affiliate`. Must be duplicated per template, not parameterized. |
| Rules | `docs/rules/01-11-*.md` | 01-template-scope, 02-file-path-rules, 05-role-rules are MCA-specific. Others are partly generic but tightly coupled. |
| Prompt prefix | `prompts/12-claude-membership-template-prefix.md` | Template name is in the filename and content. |
| Template preset | `lib/templates/membership-content-affiliate.ts` | MCA-specific default values. |
| Fixture | `tests/fixtures/membership-content-affiliate-saloncore-first-run.json` | MCA-specific test input. |
| Baseline JSON | `tests/baselines/membership-content-affiliate-green-v1.json` | MCA-specific expected values. |
| Runbooks 01, 05, 06 | `docs/runbooks/01,05,06` | Reference MCA by name. |
| RBAC role set | `lib/rbac/roles.ts` | Current roles (owner, admin, member) fit MCA. reservation_saas may need staff. |
| Billing/Affiliate modules | `lib/billing/*`, `lib/affiliate/*` | MCA requires both. reservation_saas likely needs billing but not affiliate. |
| build-prompt-with-rules | `lib/ai/build-prompt-with-rules.ts` | Currently loads a single prefix + main. Need to route to correct template's prompts. |

## C. Split Into Template-Specific at reservation_saas Addition Time

These will need a template-specific version when the 2nd template is added.

| Component | What Happens |
|-----------|-------------|
| `prompts/final/*` | Copy to `prompts/templates/reservation_saas/final/` (do not modify MCA's) |
| `docs/rules/01-template-scope.md` | New version for reservation_saas with different entities, screens |
| `docs/rules/02-file-path-rules.md` | New allowed paths for reservation_saas screens |
| `docs/rules/05-role-rules.md` | reservation_saas may use owner, admin, staff (not member) |
| `lib/templates/` | Add `reservation-saas.ts` preset alongside existing MCA preset |
| `tests/fixtures/` | Add reservation_saas fixture |
| `tests/baselines/` | Add reservation_saas baseline JSON (after first GREEN) |
| Prompt prefix file | Add `prompts/14-claude-reservation-saas-prefix.md` or similar |

## D. Keep MCA-Specific Permanently

These should never be generalized. They define MCA's identity.

| Component | Reason |
|-----------|--------|
| MCA fixture (`tests/fixtures/membership-content-affiliate-saloncore-first-run.json`) | Fixed test input for MCA regression |
| MCA baseline JSON (`tests/baselines/membership-content-affiliate-green-v1.json`) | MCA-specific expected values |
| MCA baseline doc (`docs/baselines/membership-content-affiliate-green-v1.md`) | MCA-specific documentation |
| `baseline/mca-green-v1` git tag | Immutable reference point |
| MCA domain entities (contents, membership_plans, subscriptions, affiliates, referrals, commissions) | Template scope definition |
| MCA screen paths (/content, /plans, /billing, /affiliate) | Template-specific UI |

---

## Common Core Evaluation

| Module | Status | Reason | Risk If Generalized Too Early |
|--------|--------|--------|-------------------------------|
| auth | commonize now | No template logic inside | None — already generic |
| tenant | commonize now | Tenant resolution is template-agnostic | None |
| rbac (lib/rbac/) | commonize now | Role enforcement is generic; role *set* is in rules | Low — role enum may need extension |
| audit | commonize now | Generic write-audit-log | None |
| export scaffold | commonize now | Same Next.js + Supabase + Stripe stack for all templates | None |
| quality gate | commonize now | lint/typecheck/playwright are project-agnostic | None |
| generation runs | commonize now | 6-step pipeline is template-agnostic | None |
| generated files | commonize now | file_path + content_text storage is generic | None |
| baseline comparison infra | commonize now | Script structure is reusable; only JSON config differs | None |
| billing (lib/billing/) | later | reservation_saas may have different billing model | Premature abstraction if billing differs significantly |
| affiliate (lib/affiliate/) | do not commonize | Only MCA uses affiliate. reservation_saas does not. | Would add unused code to reservation_saas |

---

## Template-Specific Layer Evaluation

| Component | Status | Reason |
|-----------|--------|--------|
| Blueprint prompt final | template-specific | Domain entities, screens, roles differ per template |
| Schema prompt final | template-specific | DB tables differ per template |
| API prompt final | template-specific | Route structure differs per template |
| UI prompt final | template-specific | Screen layouts differ per template |
| File split prompt final | template-specific | Allowed file paths differ per template |
| docs/rules/01-template-scope | template-specific | Defines domain objects per template |
| docs/rules/02-file-path-rules | template-specific | Allowed paths differ per template |
| docs/rules/05-role-rules | template-specific | Active roles differ per template |
| Fixed fixture | template-specific | Each template has its own regression input |
| Baseline JSON | template-specific | Expected values differ per template |
| Required file paths in baseline | template-specific | AI generates different files per template |
| Runbook debug notes | template-specific | Error patterns differ per template |
| docs/rules/03-naming-rules | mostly common | May reuse across templates |
| docs/rules/04-import-rules | mostly common | @/ alias rule is universal |
| docs/rules/06-api-rules | mostly common | Tenant boundary, zod validation universal |
| docs/rules/07-ui-rules | mostly common | Next.js patterns universal |
| docs/rules/08-db-rules | mostly common | RLS, migration patterns universal |
| docs/rules/09-output-format-rules | common | JSON-only output rule is universal |
| docs/rules/10-claude-template-contract | mostly common | Contract structure is universal; entity list differs |

---

## Proposed Directory Structure (Future)

No files will be moved now. This is the target structure for when reservation_saas is added.

```
prompts/
  common/                              # shared prompt fragments
    09-output-format-rules.md
  templates/
    membership_content_affiliate/
      final/
        01-blueprint-final.md
        02-schema-final.md
        03-api-final.md
        04-ui-final.md
        05-file-split-final.md
      prefix/
        12-claude-membership-template-prefix.md
      rules/
        01-template-scope.md
        02-file-path-rules.md
        05-role-rules.md
    reservation_saas/
      final/                           # new for reservation_saas
      prefix/
      rules/

docs/rules/
  common/                              # rules that apply to all templates
    03-naming-rules.md
    04-import-rules.md
    06-api-rules.md
    07-ui-rules.md
    08-db-rules.md
    09-output-format-rules.md
  membership_content_affiliate/        # MCA-specific rules
    01-template-scope.md
    02-file-path-rules.md
    05-role-rules.md
  reservation_saas/                    # new

lib/templates/
  membership-content-affiliate.ts      # stays
  reservation-saas.ts                  # new

tests/fixtures/
  membership-content-affiliate-saloncore-first-run.json   # stays
  reservation-saas-first-run.json                         # new

tests/baselines/
  membership-content-affiliate-green-v1.json              # stays
  reservation-saas-green-v1.json                          # new (after first GREEN)

scripts/
  run-mca-regression.sh                # stays
  compare-mca-baseline.sh              # stays
  run-rsv-regression.sh                # new
  compare-rsv-baseline.sh              # new
```

---

## Pre-Checklist: Before Starting reservation_saas

### Must Do First

- [ ] `npm run regression:mca` is GREEN
- [ ] `compare-mca-baseline.sh` is PASS
- [ ] No uncommitted changes to lib/quality/scaffold/*
- [ ] No uncommitted changes to prompts/final/*
- [ ] No uncommitted changes to docs/rules/*

### Commonize Before Starting (safe, no MCA impact)

- [ ] Nothing — common core is already generic in code. No file moves needed for 2nd template.

### Copy (Do Not Modify Originals) When Starting

- [ ] `prompts/final/*` -> copy for reservation_saas versions
- [ ] `docs/rules/01-template-scope.md` -> new reservation_saas version
- [ ] `docs/rules/02-file-path-rules.md` -> new reservation_saas version
- [ ] `docs/rules/05-role-rules.md` -> new reservation_saas version
- [ ] `lib/templates/membership-content-affiliate.ts` -> use as reference for new preset

### Route Prompt Loading by Template Key

- [ ] `build-prompt-with-rules.ts` must select correct prompt/prefix by template_key
- [ ] This is the only builder-side code change needed to support 2nd template
- [ ] Must not change behavior when template_key = membership_content_affiliate

### After Adding reservation_saas

- [ ] Run `npm run regression:mca` — must still be GREEN
- [ ] Run `compare-mca-baseline.sh` — must still be PASS
- [ ] Run reservation_saas regression (new script)
- [ ] Create reservation_saas baseline after first GREEN
