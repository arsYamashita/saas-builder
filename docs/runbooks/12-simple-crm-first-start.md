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
