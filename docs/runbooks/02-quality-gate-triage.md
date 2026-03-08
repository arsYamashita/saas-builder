# Quality Gate Triage

## Goal

Use quality gate to localize failures.
Do not treat every failed run as a product failure.

## Triage Order

Always inspect in this order:

1. install
2. lint
3. typecheck
4. playwright

---

## Case 1: install fails

Likely causes:

- bad package.json scaffold
- invalid dependency versions
- network / environment issue

Action:

- inspect export scaffold
- verify package.json is present
- verify npm scripts exist
- rerun install manually in export directory

Do not inspect generated pages yet.

## Case 2: lint fails

Likely causes:

- malformed syntax
- unfinished file content
- invalid import path
- mixed markdown and code in generated file

Action:

- inspect failing file
- check whether AI returned explanation text inside content_text
- check import paths
- check missing "use client"

Priority:

- syntax errors first
- then import errors
- then smaller style issues

## Case 3: typecheck fails

Likely causes:

- missing exports
- missing type files
- wrong import alias usage
- client/server boundary errors
- path mismatch

Action:

- inspect missing modules
- verify scaffold files exist
- verify generated file paths match imports
- verify file categories were exported correctly

Do not patch by random any-types everywhere.
Fix missing structure first.

## Case 4: playwright fails

Likely causes:

- app does not boot
- route does not exist
- page title mismatch
- auth redirect mismatch
- client component crash

Action:

- first confirm app runs locally
- then confirm route exists
- then inspect page content
- only then adjust test

---

## Red / Yellow / Green Meaning

### Red

- install fails
- syntax invalid
- app cannot boot

### Yellow

- typecheck fails from missing support files
- route names inconsistent
- one or two pages broken

### Green-ish

- lint passes
- typecheck passes
- only playwright has route/content mismatch

---

## Fix Rule

Never patch playwright first if lint/typecheck are red.
