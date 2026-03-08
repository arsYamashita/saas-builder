Read and obey these rule files in order:

1. docs/rules/01-template-scope.md
2. docs/rules/02-file-path-rules.md
3. docs/rules/03-naming-rules.md
4. docs/rules/04-import-rules.md
5. docs/rules/05-role-rules.md
6. docs/rules/06-api-rules.md
7. docs/rules/08-db-rules.md
8. docs/rules/09-output-format-rules.md
9. docs/rules/10-claude-template-contract.md

You are generating API design for the fixed template:
membership_content_affiliate

## Objective
Generate implementation-ready API route design for the allowed domain and billing endpoints.

## Fixed Runtime Assumptions
These modules already exist and must be referenced, not reinvented:
- @/lib/db/supabase/admin
- @/lib/auth/current-user
- @/lib/tenant/current-tenant
- @/lib/rbac/guards
- @/lib/audit/write-audit-log
- @/lib/billing/stripe
- @/lib/affiliate/*

## Allowed API Surface

### Content
- GET /api/domain/content
- POST /api/domain/content
- GET /api/domain/content/[contentId]
- PATCH /api/domain/content/[contentId]

### Membership Plans
- GET /api/domain/membership-plans
- POST /api/domain/membership-plans
- GET /api/domain/membership-plans/[planId]
- PATCH /api/domain/membership-plans/[planId]

### Billing
- POST /api/billing/checkout
- POST /api/billing/portal
- GET /api/billing/subscriptions

### Stripe
- POST /api/stripe/webhook

## Required Behavior Rules
- all mutating domain routes must require admin or stronger
- all domain reads must be tenant-scoped
- all inputs must be validated with zod
- all responses must be JSON
- all successful mutations must write audit logs
- no server actions
- no graphql
- no RPC by default

## Required Output Structure
Return exactly these sections in plain text:

1. Purpose
2. Inputs
3. Outputs
4. Rules
5. Edge Cases
6. Route List
7. Validation Files
8. Shared Imports
9. Recommended File Paths

Do not output code in this prompt.
Do not output markdown tables.

## Blueprint JSON
{{blueprint_json}}

## Schema SQL
{{schema_sql}}
