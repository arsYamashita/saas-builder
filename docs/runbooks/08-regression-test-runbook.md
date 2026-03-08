# Regression Test Runbook
# membership_content_affiliate

## Purpose

Verify that the same fixed input produces the same GREEN result as the baseline.

This is not a feature test.
This is a comparison against a known-good state.

Baseline: `baseline/mca-green-v1` tag
Baseline doc: `docs/baselines/membership-content-affiliate-green-v1.md`

---

## Prerequisites

- Dev server running on localhost:3000
- Supabase running with migrations applied
- Environment variables set (.env.local)
- jq installed
- Fixture exists: `tests/fixtures/membership-content-affiliate-saloncore-first-run.json`

---

## Execution

### Manual

```bash
bash scripts/run-mca-regression.sh
```

Or with npm:

```bash
npm run regression:mca
```

### Steps the Script Performs

1. POST fixture to `/api/projects` -> get project ID
2. POST `/api/projects/{id}/generate-template` -> start generation
3. Poll `/api/projects/{id}` until generation completes or fails
4. Fetch final project state
5. Display results

---

## Comparison Items

### Must Match Baseline

| Item | Baseline Value |
|------|---------------|
| generation overall_status | completed |
| lint_status | pass |
| typecheck_status | pass |
| playwright_status | pass |

### Should Be Comparable

| Item | Baseline Approximate |
|------|---------------------|
| generated_files count | same order of magnitude |
| blueprints count | >= 1 |
| implementation_runs count | >= 1 |
| all 6 generation steps | completed |

### Not Expected to Match Exactly

- Project ID (new each run)
- Timestamps
- AI output content (non-deterministic)
- Exact file contents

---

## Fail Criteria

A regression run is considered FAILED if any of these:

1. Project creation fails (HTTP != 201)
2. generate-template fails to start (HTTP >= 400)
3. Generation overall_status is not "completed"
4. Any quality gate status is not "pass" (lint, typecheck, playwright)
5. generated_files count is 0
6. blueprints count is 0

---

## When a Regression Fails

Follow this order:

1. Check which step failed first (generation step or quality gate)
2. Compare with baseline doc to see if it is a known fragile point
3. Check scaffold files first (path alias, compat files)
4. Check generated imports second
5. Do NOT fix downstream before upstream
6. Fix one thing, rerun

Reference: `docs/runbooks/06-common-first-run-errors.md`

---

## Rerun Rules

- Always use the same fixture file
- Do not modify the fixture between runs
- Create a new project each time (do not reuse project IDs)
- Record each run result before making fixes

---

## Upstream-First Principle

When debugging regression failures:

1. Scaffold issue? -> fix scaffold
2. Prompt issue? -> check if prompt changed since baseline
3. AI output drift? -> compare generated_files structure
4. New dependency version? -> check package.json scaffold

Never patch generated output directly.
Always fix the source (scaffold, prompt, or compat layer).
