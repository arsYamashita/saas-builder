# Second Template Readiness Runbook

## Purpose

Checklist and rules for adding a second template (reservation_saas)
without breaking the first template (membership_content_affiliate).

---

## Before Starting the Second Template

### Mandatory Checks

1. `npm run regression:mca` returns GREEN
2. `bash scripts/compare-mca-baseline.sh <project-id>` returns PASS
3. `baseline/mca-green-v1` tag exists
4. No uncommitted changes in:
   - `lib/quality/scaffold/*`
   - `prompts/final/*`
   - `docs/rules/*`
   - `lib/ai/*`

### If Any Check Fails

Stop. Fix the MCA regression first. Do not proceed with the second template.

---

## What to Copy (Not Modify)

Create new files for reservation_saas. Do not edit MCA originals.

| MCA Original | New File for reservation_saas |
|---|---|
| `prompts/final/01-blueprint-final.md` | New blueprint prompt for reservation_saas |
| `prompts/final/02-schema-final.md` | New schema prompt |
| `prompts/final/03-api-final.md` | New API prompt |
| `prompts/final/04-ui-final.md` | New UI prompt |
| `prompts/final/05-file-split-final.md` | New file split prompt |
| `docs/rules/01-template-scope.md` | New scope for reservation_saas |
| `docs/rules/02-file-path-rules.md` | New allowed paths |
| `docs/rules/05-role-rules.md` | New role set (owner, admin, staff) |
| `lib/templates/membership-content-affiliate.ts` | `lib/templates/reservation-saas.ts` |

---

## What to Share (Already Generic)

These do not need copying or modification:

- `lib/auth/*` — session, login, signup
- `lib/tenant/*` — tenant resolution
- `lib/rbac/*` — role enforcement (role set comes from rules)
- `lib/audit/*` — audit log writer
- `lib/db/*` — DB clients, generation runs, generated files
- `lib/quality/*` — scaffold, quality gate runners
- `lib/validation/blueprint.ts` — generic blueprint structure
- `app/api/projects/[projectId]/generate-template/route.ts` — 6-step pipeline
- `scripts/compare-mca-baseline.sh` — structure (different baseline JSON)

---

## The One Code Change Required

`lib/ai/build-prompt-with-rules.ts` must route to the correct prompt files
based on the project's `template_key`.

Current behavior: always loads the same prefix + main prompt files.
Required behavior: select prefix and main prompt by template_key.

This is the minimum change to support a second template.
It must not change behavior when template_key is `membership_content_affiliate`.

---

## What NOT To Do

- Do not modify MCA prompts to "support both templates"
- Do not merge MCA and reservation_saas rules into a single file
- Do not add reservation_saas entities to MCA's template-scope
- Do not generalize the scaffold beyond Next.js + Supabase + Stripe
- Do not add new AI providers
- Do not refactor the generation pipeline
- Do not change DB schema for "multi-template support"

---

## After Adding reservation_saas

### Immediate Checks

1. Run `npm run regression:mca` — must be GREEN
2. Run MCA baseline comparison — must be PASS
3. If MCA is broken, revert reservation_saas changes and investigate

### First Run of reservation_saas

Follow the same pattern as MCA:

1. Create fixture for reservation_saas
2. Run first generation
3. Record results
4. Fix first broken stage
5. Iterate to GREEN
6. Create baseline
7. Create regression script

### Ongoing

- Both `regression:mca` and `regression:rsv` must pass before any commit to shared code
- Changes to shared modules (scaffold, quality gate, generation pipeline) require both regressions to pass
