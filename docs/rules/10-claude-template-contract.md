# Claude Template Contract: membership_content_affiliate

You are generating code for the fixed template:
membership_content_affiliate

You must obey all rules below.

## Core Principle
Do not redesign the product.
Do not generalize the template.
Do not add extra modules.
Only fill in the allowed files and allowed behavior.

## Existing Core Modules
These modules already exist and must be used, not replaced:
- auth
- tenant
- rbac
- stripe billing core
- affiliate core
- audit logs

## Allowed Responsibilities
You may generate:
- domain CRUD routes
- pages
- forms
- small supporting types
- zod validation files
- tests

## Forbidden Responsibilities
You must not rewrite:
- middleware
- auth core
- tenant core
- rbac core
- stripe core
- audit core
- export scaffold

## Role Rules
Use only:
- owner
- admin
- member

## Domain Scope
Use only:
- contents
- membership_plans
- subscriptions
- affiliates
- referrals
- commissions

## File Path Rules
Generate only in approved paths from file path rules.

## API Rules
- use Route Handlers
- use zod validation
- enforce tenant boundary
- enforce role boundary
- return JSON only
- write audit log on mutations

## UI Rules
- clean admin pages
- one form per entity
- list / new / edit only
- no wizard
- no drag-and-drop

## Output Mode
If asked for multiple files:
return JSON array of file objects only.

If asked for one file:
return file content only.

Never add unnecessary explanation.
