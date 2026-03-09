# simple_crm_saas First Start Runbook

## Purpose

Guide the first generation attempt for the simple_crm_saas template.
The goal is NOT immediate GREEN.
The goal is localized failure identification.

---

## Prerequisites

Before attempting any simple_crm_saas generation:

1. `npm run regression:mca` is GREEN
2. `npm run regression:rsv` is GREEN
3. Template manifest entry is added to `lib/templates/template-registry.ts`
4. simple_crm_saas prompts exist at `prompts/final/simple_crm_saas/`
5. simple_crm_saas rules exist at `docs/rules/simple_crm_saas/`
6. simple_crm_saas fixture exists at `tests/fixtures/simple-crm-first-run.json`

---

## Fixed Test Input

Use this fixture:
`tests/fixtures/simple-crm-first-run.json`

- name: CRMFlow First Run
- templateKey: simple_crm_saas
- domain: customers, deals, tasks
- billingModel: none
- affiliateEnabled: false
- roles: owner, admin, staff

---

## First Run Procedure

### Step 1
Run MCA and RSV regression first. Confirm both GREEN.

### Step 2
Create a project using the simple_crm_saas fixture:
```bash
curl -X POST http://localhost:3000/api/projects \
  -H "Content-Type: application/json" \
  -d @tests/fixtures/simple-crm-first-run.json
```

### Step 3
Trigger generation:
```bash
curl -X POST http://localhost:3000/api/projects/{id}/generate-template
```

### Step 4
Wait for completion or failure. Do not debug yet. First observe.

### Step 5
Record results using the same format as MCA/RSV first run.

---

## What To Check After First Run

In this order:

1. **Blueprint** — did it produce simple_crm_saas entities (customers, deals, tasks)?
2. **Schema** — did it produce customers, deals, tasks tables?
3. **API design** — did it produce /api/domain/customers, /deals, /tasks routes?
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

- Do not modify MCA prompts to "fix" simple_crm_saas
- Do not modify RSV prompts to "fix" simple_crm_saas
- Do not modify shared scaffold to "fix" simple_crm_saas
- Do not modify MCA/RSV rules
- Do not add simple_crm_saas entities to MCA/RSV scope
- Do not change billing/affiliate modules

---

## After First Run

1. Run MCA regression — must still be GREEN
2. Run RSV regression — must still be GREEN
3. Record simple_crm_saas first run results
4. Identify first failure point
5. Fix one thing at a time
6. Repeat until GREEN
7. Create baseline and regression script for simple_crm_saas

---

## Post-Routing Connection Checklist

Template routing is now wired. Before first simple_crm_saas generation:

### Step 1: Verify MCA and RSV are not broken

```bash
npm run regression:mca
npm run regression:rsv
```

Both must return GREEN. If not, revert routing changes and investigate.

### Step 2: Create simple_crm_saas project

```bash
curl -X POST http://localhost:3000/api/projects \
  -H "Content-Type: application/json" \
  -d @tests/fixtures/simple-crm-first-run.json
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

### Step 5: Run MCA and RSV regression again

```bash
npm run regression:mca
npm run regression:rsv
```

Confirm both are still GREEN after simple_crm_saas attempt.

---

## GREEN Achieved

simple_crm_saas は full GREEN を達成済み。

- First GREEN project ID: `ea3dc501-b7aa-4661-8cc3-76a56a7406d3`
- All 6 generation steps: completed
- Quality: lint=passed, typecheck=passed, playwright=passed
- Fix required: project form validation enum のみ

### Baseline & Regression

baseline と regression インフラが整備済み:

- Baseline 文書: `docs/baselines/simple-crm-green-v1.md`
- Baseline JSON: `tests/baselines/simple-crm-green-v1.json`（正本）
- Regression script: `scripts/run-crm-regression.sh`
- Compare script: `scripts/compare-crm-baseline.sh`
- Tag: `baseline/crm-green-v1`

### 実行方法

```bash
# Full regression (create → generate → quality → compare)
npm run regression:crm

# Compare only (既存 project に対して)
bash scripts/compare-crm-baseline.sh <project-id>
```

### 壊れた時

1. まず `bash scripts/compare-crm-baseline.sh <project-id>` で差分を確認
2. generation steps の FAIL を特定
3. quality checks の FAIL を特定
4. `docs/baselines/simple-crm-green-v1.md` の "Where to Look" セクション参照
