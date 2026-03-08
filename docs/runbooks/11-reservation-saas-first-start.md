# reservation_saas First Start Runbook

## Purpose

Guide the first generation attempt for the reservation_saas template.
The goal is NOT immediate GREEN.
The goal is localized failure identification.

---

## Prerequisites

Before attempting any reservation_saas generation:

1. `npm run regression:mca` is GREEN
2. `compare-mca-baseline.sh` is PASS
3. Template routing code change is applied
   (see: `docs/architecture/reservation-saas-template-routing-plan.md`)
4. reservation_saas prompts exist at `prompts/final/reservation_saas/`
5. reservation_saas rules exist at `docs/rules/reservation_saas/`
6. reservation_saas fixture exists at `tests/fixtures/reservation-saas-first-run.json`

---

## Fixed Test Input

Use this fixture:
`tests/fixtures/reservation-saas-first-run.json`

- name: BookEasy First Run
- templateKey: reservation_saas
- domain: services, reservations, customers
- billingModel: none
- affiliateEnabled: false
- roles: owner, admin, staff

---

## First Run Procedure

### Step 1
Run MCA regression first. Confirm GREEN.

### Step 2
Create a project using the reservation_saas fixture:
```bash
curl -X POST http://localhost:3000/api/projects \
  -H "Content-Type: application/json" \
  -d @tests/fixtures/reservation-saas-first-run.json
```

### Step 3
Trigger generation:
```bash
curl -X POST http://localhost:3000/api/projects/{id}/generate-template
```

### Step 4
Wait for completion or failure. Do not debug yet. First observe.

### Step 5
Record results using the same format as MCA first run
(see: `docs/runbooks/05-first-template-execution.md`)

---

## What To Check After First Run

In this order:

1. **Blueprint** — did it produce reservation_saas entities (services, reservations, customers)?
2. **Schema** — did it produce services, reservations, customers, staff_members tables?
3. **API design** — did it produce /api/domain/services, /reservations, /customers routes?
4. **Split files** — did it emit valid file objects?
5. **Export** — did files appear in export directory?
6. **Quality gate** — install -> lint -> typecheck -> playwright

---

## Expected First Run Outcomes

Realistic expectation:
- Blueprint: likely completed (prompt is clear)
- Implementation: likely completed
- Schema: likely completed
- API design: likely completed
- Split files: may fail (path rules are new)
- Export: may fail if split_files fails
- Quality: lint may pass, typecheck may fail

This is acceptable for a first run.

---

## Do NOT

- Do not modify MCA prompts to "fix" reservation_saas
- Do not modify shared scaffold to "fix" reservation_saas
- Do not modify MCA rules
- Do not add reservation_saas entities to MCA scope
- Do not change billing/affiliate modules

---

## After First Run

1. Run MCA regression — must still be GREEN
2. Record reservation_saas first run results
3. Identify first failure point
4. Fix one thing at a time
5. Repeat until GREEN
6. Create baseline and regression script for reservation_saas

---

## Post-Routing Connection Checklist

Template routing is now wired. Before first reservation_saas generation:

### Step 1: Verify MCA is not broken

```bash
npm run regression:mca
```

Must return GREEN. If not, revert routing changes and investigate.

### Step 2: Create reservation_saas project

```bash
curl -X POST http://localhost:3000/api/projects \
  -H "Content-Type: application/json" \
  -d @tests/fixtures/reservation-saas-first-run.json
```

### Step 3: Trigger generation

```bash
curl -X POST http://localhost:3000/api/projects/{id}/generate-template
```

### Step 4: Observe results

Do not debug yet. Record:
- Which step failed first
- Error message
- Whether blueprint was saved

### Step 5: Run MCA regression again

```bash
npm run regression:mca
```

Confirm MCA is still GREEN after reservation_saas attempt.

---

## Known First-Run Failures

### Failure #1: affiliate.commission_type validation

- Symptom: blueprint validation fails with `commission_type "none"` not in enum
- Cause: reservation_saas has `affiliate.enabled: false`, AI returns `commission_type: "none"`
- Fix: add `"none"` to `blueprintAffiliateSchema.commission_type` enum in `lib/validation/blueprint.ts`
- MCA impact: none (MCA uses "fixed", "percentage", or "configurable")

### General Rule

If blueprint validation fails, check `lib/validation/blueprint.ts` first.
The blueprint schema must accommodate all templates' valid output values.

---

## GREEN Achieved

reservation_saas は full GREEN を達成済み。

- First GREEN project ID: `5d53dc3b-b072-40b2-ab18-61d3b57931e7`
- All 6 generation steps: completed
- Quality: lint=passed, typecheck=passed, playwright=passed
- Fix required: commission_type "none" のみ

### Baseline & Regression

baseline と regression インフラが整備済み:

- Baseline 文書: `docs/baselines/reservation-saas-green-v1.md`
- Baseline JSON: `tests/baselines/reservation-saas-green-v1.json`（正本）
- Regression script: `scripts/run-rsv-regression.sh`
- Compare script: `scripts/compare-rsv-baseline.sh`
- Tag: `baseline/rsv-green-v1`

### 実行方法

```bash
# Full regression (create → generate → quality → compare)
npm run regression:rsv

# Compare only (既存 project に対して)
bash scripts/compare-rsv-baseline.sh <project-id>
```

### 壊れた時

1. まず `bash scripts/compare-rsv-baseline.sh <project-id>` で差分を確認
2. generation steps の FAIL を特定
3. quality checks の FAIL を特定
4. `docs/baselines/reservation-saas-green-v1.md` の "Where to Look" セクション参照
