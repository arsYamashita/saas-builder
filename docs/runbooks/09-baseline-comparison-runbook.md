# Baseline Comparison Runbook
# membership_content_affiliate

## Purpose

Compare a new regression run against the known GREEN v1 baseline.
Detect regressions in structure, not in AI-generated content.

---

## What We Compare (Deterministic)

| Category | Items |
|----------|-------|
| Generation steps | All 6 steps must be "completed" |
| Quality gate | lint, typecheck, playwright must be "pass" |
| Saved counts | blueprints >= 1, implementation_runs >= 1, generated_files >= 1 |
| Required file paths | Key AI-generated files exist in export directory |
| Scaffold files | All scaffold-provided files exist in export directory |

## What We Do NOT Compare

| Item | Reason |
|------|--------|
| AI-generated code content | Non-deterministic across runs |
| Exact generated_files count | May vary with AI output |
| Project ID | New each run |
| Timestamps | Always different |
| Blueprint/schema content | AI output varies |
| File content checksums | Content is non-deterministic |

---

## Comparison Procedure

### Automated

```bash
# Full regression + comparison
npm run regression:mca

# Comparison only (existing project)
bash scripts/compare-mca-baseline.sh <project-id>
```

### Manual Verification

If automated comparison passes but behavior seems wrong:

1. Open export directory: `exports/projects/<id>/`
2. Check tsconfig.json has `@/*` -> `./src/*`
3. Check `src/lib/supabase/server.ts` uses `await cookies()`
4. Check `src/lib/permissions/rbac.ts` exports Role type
5. Compare file list with baseline doc

---

## Fail Criteria

Comparison is FAIL if any of:

1. Any generation step is not "completed"
2. Any quality status is not "pass"
3. Any minimum count is not met
4. Any required file path is missing from export

---

## Triage Order

When comparison fails:

1. **Generation step failed** -> check prompts, AI response, placeholder replacement
2. **Quality gate failed** -> check scaffold, compat files, path alias
3. **Count too low** -> check split_files step, generated_files insert
4. **Required file missing** -> check if AI stopped generating it, or export skipped it

Always fix upstream before downstream.

---

## Baseline Reference

- Baseline tag: `baseline/mca-green-v1`
- Baseline doc: `docs/baselines/membership-content-affiliate-green-v1.md`
- Baseline JSON: `tests/baselines/membership-content-affiliate-green-v1.json`
- Fixture: `tests/fixtures/membership-content-affiliate-saloncore-first-run.json`
