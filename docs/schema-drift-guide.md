# Schema Drift Guide

Companion to `docs/security-checklist.md` item 10. Full context: M5 指示書
`2026-07-06_039_saas_builder_schema_drift_ci_guard_template`.

## The bug class this prevents

A hand-written DB row type (`export type Foo = { ... }`) stops matching
the real schema — a migration adds/renames/drops a column, the hand type
isn't updated. Reading a field that the hand type declares but the real
row doesn't have returns `undefined` **silently** — not a compile error
(the type says the field exists), not a thrown exception, not a failed
test. The value just disappears from the UI. First diagnosed as
`[[daycare_dashboard_type_schema_drift]]` (day_care_web_app,
`review-detail.tsx` reading `proposed_content`/`rationale`/`before_text`
against a real schema of `suggested_content`/`llm_rationale`), with the
same-family symptom in the Firestore world as `aria_app_collection_drift`
(UI/webhook collection-name mismatches).

## Supabase-based projects: the generated-types-as-source-of-truth pattern

1. **Regenerate real types from live migrations**:
   ```bash
   # CI (postgres service container already running):
   SCHEMA_DRIFT_DB_URL=postgresql://postgres:postgres@localhost:5432/postgres \
     bash scripts/schema-drift/regen-and-diff.sh <migrations-dir> <generated-types-file>

   # Local dev (spins up + tears down a throwaway local Postgres automatically):
   bash scripts/schema-drift/regen-and-diff.sh <migrations-dir> <generated-types-file>
   ```
   This is a thin wrapper around the real `supabase gen types typescript
   --db-url ...` command (see `scripts/schema-drift/regen-and-diff.sh`
   for the exact recipe, including the `auth.users`/`auth.uid()` stub
   every Supabase-style migration set implicitly depends on via
   `REFERENCES auth.users(id)` — a throwaway Postgres has no Supabase
   platform installed, so this FK target doesn't exist without it).

2. **Commit the generated snapshot** (`<template>/src/types/database.generated.ts`)
   — this is the literal, mechanically-produced source of truth. Never
   hand-edit it.

3. **New code should import from the generated file directly**
   (`import type { Database } from "./database.generated"`) rather than
   adding new fields to a hand-written type. Existing templates
   (`community_membership_saas`) still ship a hand-written
   `database.ts` with named per-table types (`Tenant`, `User`, ...) for
   ergonomics — those are kept in sync with the generated snapshot by the
   structural gate below, not by trusting a human to remember.

4. **Two CI jobs, two different reliability guarantees** — do not confuse
   them:

   | Job | What it checks | Needs | Reliability |
   |---|---|---|---|
   | `schema-drift-gate` (`npm run schema:drift:gate`) | The COMMITTED hand type file vs. the COMMITTED generated snapshot — do they still agree, field for field? | Nothing (pure string diff of two files already in the repo) | **Blocking (hard).** Deterministic, offline, cannot flake. |
   | `schema-drift-freshness` (`scripts/schema-drift/regen-and-diff.sh`) | Is the COMMITTED generated snapshot itself still fresh vs. the LIVE migrations? | Postgres + the real `supabase` CLI (which itself needs Docker for its `postgres-meta` helper container) | **Informational (`continue-on-error: true`).** The `supabase` CLI's internal helper container has to reach the target Postgres over the docker bridge network — this works in local testing and is expected to work on GitHub Actions runners, but is exactly the kind of environment-dependent step that shouldn't be allowed to block unrelated PRs on a networking hiccup. Promote to blocking once it's been green for a while with no false failures. |

### Onboarding a new Supabase-based template

Add one entry to `scripts/schema-drift-targets.json`:

```json
{
  "name": "<template-key>",
  "migrationsDir": "templates/<template-key>/supabase/migrations",
  "generatedTypesFile": "templates/<template-key>/src/types/database.generated.ts",
  "handTypesFile": "templates/<template-key>/src/types/database.ts",
  "mappingFile": "templates/<template-key>/src/types/schema-drift.config.json",
  "mode": "warning"
}
```

Then:
1. Run `regen-and-diff.sh` once to produce `database.generated.ts`.
2. Write `schema-drift.config.json` — an EXPLICIT `{ HandTypeName:
   "table_name" }` map (never inferred from pluralization; see
   `scripts/schema-drift-gate-core.ts`'s doc comment for why).
3. Run `npm run schema:drift:gate` — fix any `error`-severity findings
   (real drift) until it's clean, THEN flip `"mode": "warning"` to
   `"mode": "hard"` in the target entry.

Both CI jobs pick up new entries automatically — no other wiring needed.

### Two-stage rollout (why `mode` exists per-target)

Forcing `hard` mode on a target with pre-existing, unrelated drift blocks
every future PR for reasons that have nothing to do with their actual
change — this is exactly what happened when `day_care_web_app`'s
`database.ts` (~590 lines of unrelated accumulated drift) was
provisionally scoped for hard-gating in instruction `049` and had to be
parked. **New targets should start in `"mode": "warning"`, confirm 0
`error`-severity findings, then flip to `"mode": "hard"`.**
`community_membership_saas` (the only target as of this PR) went through
exactly this cycle: the initial `regen-and-diff.sh` run against `main`
surfaced one real (if minor) drift — `Membership.invited_by` existed on
the real `memberships` table (and was already being read/written by
`app/api/admin/tenants/[tenantId]/members/route.ts`) but was missing from
the hand `Membership` type — fixed in this PR, confirmed 0 findings, then
set to `"mode": "hard"`.

## Firestore-based derivatives (aria_app family)

Firestore has no migrations/schema-introspection API the way Postgres
does, so there is no generated-snapshot mechanism to mirror. Instead,
`scripts/firestore-drift-gate-core.ts` + `scripts/firestore-drift-gate-check.ts`
work off an **explicit, human-maintained schema declaration**
(`docs/examples/firestore-schema.example.json` shows the shape) and flag:

1. `.collection("name")` references to a collection name not in the
   declared list — the `[[aria_app_collection_drift]]` failure mode
   (`templates` / `customTemplates` / `universalTemplates` all half-used
   across different call sites).
2. References to explicitly-declared deprecated field names — the same
   grep-guard shape `day_care_web_app`'s CI already uses for its
   known-deprecated `revision_suggestions` columns.

This is a **template asset, not wired into saas-builder's own CI**
(saas-builder has no Firestore usage) or into `aria-app` itself
(`aria-app`'s main source is under a modify-freeze — see
`[[feedback_aria_no_source_changes]]`; any change there needs an explicit
instruction + Codex-reviewed deploy). To adopt it in a Firestore project:

```bash
cp scripts/firestore-drift-gate-core.ts scripts/firestore-drift-gate-check.ts <target-repo>/scripts/
cp docs/examples/firestore-schema.example.json <target-repo>/firestore-schema.json  # fill in real collections
# wire into CI:
tsx scripts/firestore-drift-gate-check.ts --schema firestore-schema.json --root app --root lib
```
