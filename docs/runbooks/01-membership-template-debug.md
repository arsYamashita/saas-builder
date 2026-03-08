# membership_content_affiliate Debug Runbook

## Goal

The goal is not full automation.
The goal is to make one template reproducible and stable.

A run is considered healthy when:

- blueprint is generated
- implementation plan is generated
- schema is generated
- api design is generated
- files are split and saved
- files are exported
- quality gate runs
- failures are understandable and localized

## Debug Priority

Always debug in this order:

1. project input
2. blueprint
3. schema
4. api design
5. file split
6. export
7. lint
8. typecheck
9. playwright

Do not debug UI before checking schema and API assumptions.

## Rule

Never try to fix everything at once.
Only fix the earliest broken stage first.

## Important Principle

If blueprint is wrong, everything after it is downstream noise.
If schema is wrong, API and UI failures are downstream noise.
If file paths are wrong, export and quality failures are downstream noise.

## First Questions To Ask

- Did the project input match the fixed template scope?
- Did the AI obey the template rules?
- Did the output violate allowed file paths?
- Did the output invent new roles or entities?
- Did the output rewrite core modules?

## Stop Conditions

Stop and fix upstream if:

- blueprint introduces disallowed entities
- schema renames existing tables
- api design ignores tenant boundaries
- files are generated in forbidden paths
- generated pages require missing core modules

## Healthy Debug Loop

1. run generation
2. inspect earliest failed step
3. apply minimal fix
4. rerun only from necessary stage
5. compare outputs
6. update rules or prompts if repeated failure

---

## Phase A: Generation Run Failure

When the Builder generation itself fails.

Inspection order:

1. `generation_runs.error_message`
2. Which step stopped
3. The saved artifact immediately before that step:
   - blueprint
   - implementation_runs
   - generated_files

Example: If `schema` fails → inspect blueprint → inspect schema prompt → inspect schema output.
Do NOT look at `api_design` or `quality gate` yet. It is noise.

## Phase B: Quality Gate Failure

Inspection order:

1. install
2. lint
3. typecheck
4. playwright

Important: If `playwright` is red but `lint` or `typecheck` is also red, fix lint/typecheck first.

## Phase C: Export Directory Broken

Inspection order:

1. Is scaffold written?
2. Are `generated_files.file_path` values in allowed paths?
3. Are there duplicate files for the same responsibility?
4. Are import aliases consistent with `@/`?

---

## Common Failure Patterns

### Case 1: Claude outputs forbidden paths

Examples:

- `app/admin/content/page.tsx`
- `lib/custom-auth.ts`

Action:

- Reject before file split
- Strengthen `02-file-path-rules.md`
- Rerun with final prompt

Do NOT: export anyway and hope for the best.

### Case 2: Roles multiply

Examples:

- editor
- superadmin

Action:

- Reject at blueprint stage
- Enforce `05-role-rules.md`
- Rerun `01-blueprint-final.md`

### Case 3: UI contains billing logic

Examples:

- Webhook processing inside a page component
- Stripe client imported in client component

Action:

- Reject the UI file
- Reapply `11-lovable-template-contract.md`
- Regenerate UI only

### Case 4: Typecheck fails massively

Typical causes:

- missing imports
- missing files
- path mismatch

Action:

- List all `generated_files` paths
- Cross-reference exports with imports
- Regenerate only the missing files

Do NOT: add `any` types everywhere to suppress errors.

### Case 5: Only playwright fails

Action:

- Confirm app boots
- Confirm route exists
- Check title / selector mismatch

This is relatively minor.

---

## generated_files Adoption Rules

### Accept

- Follows rules
- Syntactically valid
- Dependencies align with existing core
- Path is allowed
- Better than current saved version

### Hold

- Code looks plausible but imports are suspect
- Dependency targets may not exist
- Core module assumptions are slightly off

### Reject

- Forbidden path
- Forbidden role/entity
- Core rewrite
- Markdown mixed into code
- Billing/auth/tenant redesigned without authorization
- Duplicate competing files for same responsibility

---

## Path to Green: Priority Order

1. **Blueprint fixed** — if this is off, everything downstream is off
2. **Schema fixed** — table names, column names, tenant_id locked
3. **API fixed** — content / plans / billing / affiliate only
4. **UI fixed** — screens can be fixed later
5. **Playwright fixed** — tests follow last

The order is: data structure → API → UI → tests.

---

## Operational Flow Per Run

### Run 1

- Generate Full Template
- Check which step failed first

### Run 2

- Fix only the first broken step
- Full rerun

### Run 3

- Review generated_files
- Reject/ignore clearly bad files

### Run 4

- Export
- Run quality gate

### Run 5

- Fix in order: lint → typecheck → playwright

---

## Rules That Prevent Stalling

1. Change only one thing per fix
2. Do not mix rule changes with output fixes
3. When failure occurs, suspect upstream first
4. Green is the target, but "failure localization" is sufficient at first

---

## Current Priority

The next phase is NOT adding new features.
The next phase is making one template pass end-to-end.

Do not:

- Add reservation_saas
- Add more AI providers
- Make UI fancier

Do:

- Tighten constraints
- Make failures visible
- Pass one template
