# Generated Files Review Guide

## Goal

Not every generated file should be accepted.
Review generated files as candidates, not truth.

## Review Order

1. file path
2. file category
3. content validity
4. dependency assumptions
5. duplication
6. alignment with template scope

---

## Accept Immediately If

- file path is allowed
- file content is syntactically valid
- it uses existing core modules
- it matches naming rules
- it stays inside template scope
- it is better than current saved version

## Reject Immediately If

- forbidden path
- forbidden role name
- forbidden entity name
- core module rewrite
- billing logic inside UI page
- auth redesign inside generated domain file
- markdown explanation mixed into code
- duplicate competing files for same responsibility

## Caution Files

Review carefully:

- api routes
- webhook handlers
- billing files
- affiliate commission logic
- anything touching tenant boundaries

## Low-Risk Files

Usually easier to accept:

- form components
- list pages
- simple edit pages
- zod validation files
- basic tests

---

## Merge Rule

If two generated files compete:

- keep the one that obeys rules better
- prefer simpler implementation
- prefer file using existing core imports
- archive the worse one, do not overwrite blindly

## Version Rule

generated_files in DB are source records.
Local exported files are disposable.
If needed, delete local export and re-export from DB.
